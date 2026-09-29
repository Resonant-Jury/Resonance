import Foundation
import Testing
@testable import ResonanceAPI
@testable import ResonanceKit

/// Serves the web routes the writer calls outside the contract (/api/upload,
/// /api/cards/*): canned replies in order, and a record of what was sent.
final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var replies: [(status: Int, json: String)] = []
    nonisolated(unsafe) static var sent: [(request: URLRequest, body: Data)] = []

    static func reset(_ replies: [(status: Int, json: String)]) {
        self.replies = replies
        sent = []
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        // URLSession hands a protocol the body as a stream.
        var body = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                body.append(buffer, count: n)
            }
            stream.close()
        }
        Self.sent.append((request, body))
        let reply = Self.replies.isEmpty ? (status: 500, json: "{}") : Self.replies.removeFirst()
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil,
                                       headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(reply.json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

/// Which tokens the API asked for: `false` for the cached one, `true` for a refresh.
actor TokenLog {
    private(set) var asks: [Bool] = []
    func ask(_ forceRefresh: Bool) -> String {
        asks.append(forceRefresh)
        return forceRefresh ? "fresh-token" : "stale-token"
    }
}

@Suite(.serialized) struct WritingAPITests {
    let tokens = TokenLog()

    func api(_ transport: StubTransport = StubTransport(body: "{}")) -> WritingAPI {
        let tokens = tokens
        let configuration = APIConfiguration(origin: URL(string: "https://example.test")!) { await tokens.ask($0) }
        let client = Client(serverURL: configuration.apiURL, transport: transport,
                            middlewares: [BearerAuthMiddleware(idToken: configuration.idToken)])
        let session = URLSessionConfiguration.ephemeral
        session.protocolClasses = [StubURLProtocol.self]
        return WritingAPI(client: client, configuration: configuration, session: URLSession(configuration: session))
    }

    @Test func publishesThroughTheContract() async throws {
        let transport = StubTransport(body: #"{"id":"c1","slug":"a-walk","firstPublish":true,"later":1}"#)
        let result = try await api(transport).publish("c1")
        #expect(result.slug == "a-walk")
        #expect(result.firstPublish == true)
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path?.hasSuffix("/cards/c1/publish") == true)
        #expect(request.headerFields[.authorization] == "Bearer stale-token")
    }

    @Test func uploadsThePhotoAsTheFormsFilePart() async throws {
        StubURLProtocol.reset([(200, #"{"publicUrl":"https://img.test/u/alice/cover.avif","key":"u/alice/cover.avif"}"#)])
        let photo = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x01, 0x02])
        let url = try await api().upload(photo, filename: "cover.jpg")
        #expect(url.absoluteString == "https://img.test/u/alice/cover.avif")

        let (request, body) = try #require(StubURLProtocol.sent.first)
        #expect(request.url?.path == "/api/upload")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer stale-token")
        let contentType = try #require(request.value(forHTTPHeaderField: "Content-Type"))
        let boundary = try #require(contentType.split(separator: "boundary=").last.map(String.init))
        #expect(contentType.hasPrefix("multipart/form-data"))
        let head = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"cover.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8)
        #expect(body == head + photo + Data("\r\n--\(boundary)--\r\n".utf8))
    }

    @Test func refreshesARejectedTokenOnce() async throws {
        StubURLProtocol.reset([(401, "{}"), (200, #"{"tags":["散步","雨天"]}"#)])
        let tags = try await api().suggestTags(title: "一場雨後的散步", story: "雨停的時候…", tags: ["日常"])
        #expect(tags == ["散步", "雨天"])
        #expect(await tokens.asks == [false, true])
        #expect(StubURLProtocol.sent.map { $0.request.value(forHTTPHeaderField: "Authorization") } == ["Bearer stale-token", "Bearer fresh-token"])
        let sent = try JSONSerialization.jsonObject(with: try #require(StubURLProtocol.sent.last?.body)) as? [String: Any]
        #expect(sent?["thoughtCore"] as? String == "一場雨後的散步")
        #expect(sent?["tags"] as? [String] == ["日常"])
    }

    @Test func streamsTheIllustrationsPreviewsThenItsPicture() async throws {
        let png = Data([0x89, 0x50, 0x4E, 0x47])
        StubURLProtocol.reset([(200, """
        {"type":"partial","index":0,"b64":"\(png.base64EncodedString())"}
        {"type":"done","publicUrl":"https://img.test/u/alice/generated.avif","key":"u/alice/generated.avif"}

        """)])
        var events: [WritingAPI.IllustrationEvent] = []
        for try await event in api().illustrate(story: "雨停的時候…") { events.append(event) }
        #expect(events == [.partial(png), .done(URL(string: "https://img.test/u/alice/generated.avif")!)])
        let (request, body) = try #require(StubURLProtocol.sent.first)
        #expect(request.url?.path == "/api/generate-image")
        #expect((try JSONSerialization.jsonObject(with: body) as? [String: String])?["story"] == "雨停的時候…")
    }

    @Test func aFailureAfterTheStreamBeganIsAnEvent() async throws {
        StubURLProtocol.reset([(200, #"{"type":"error"}"#)])
        var events: [WritingAPI.IllustrationEvent] = []
        for try await event in api().illustrate(story: "s") { events.append(event) }
        #expect(events == [.failed])
    }

    @Test func asksToSignInAgainWhenTheFreshTokenIsRejectedToo() async throws {
        StubURLProtocol.reset([(401, "{}"), (401, "{}")])
        await #expect(throws: APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401)) {
            try await api().insight(title: "t", story: "s")
        }
        #expect(StubURLProtocol.sent.count == 2)
    }
}
