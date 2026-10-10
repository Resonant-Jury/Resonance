import Foundation
import HTTPTypes
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

    @Test func appliesAPendingEditThroughTheContract() async throws {
        let transport = StubTransport(body: #"{"id":"c1","slug":"a-walk","applied":true}"#)
        let result = try await api(transport).applyEdit("c1")
        #expect(result.applied == true)
        #expect(result.slug == "a-walk")
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path?.hasSuffix("/cards/c1/edits/apply") == true)
    }

    @Test func changesACardsVisibilityThroughTheContract() async throws {
        let transport = StubTransport(body: ReadingAPITests.card.replacingOccurrences(of: #""visibility":"public""#,
                                                                                      with: #""visibility":"private""#))
        let card = try await api(transport).updateCard("c1", visibility: ._private)
        #expect(card.visibility == ._private)
        let request = try #require(transport.requests.first)
        #expect(request.method == .patch)
        #expect(request.path == "/cards/c1")
        // Only what changes is sent: the byline stays as it is.
        let sent = try #require(transport.sentJSON.first ?? nil)
        #expect(sent["visibility"] as? String == "private")
        #expect(sent.keys.sorted() == ["visibility"])

        _ = try await api(transport).updateCard("c1", anonymous: true)
        #expect(transport.sentJSON.last??["anonymous"] as? Bool == true)
        #expect(transport.sentJSON.last??.keys.sorted() == ["anonymous"])
    }

    @Test func deletesACardThroughTheContract() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).deleteCard("c1")
        let request = try #require(transport.requests.first)
        #expect(request.method == .delete)
        #expect(request.path == "/cards/c1")
        #expect(request.headerFields[.authorization] == "Bearer stale-token")
    }

    @Test func resonatesWithAnExistingCardThroughTheContract() async throws {
        let transport = StubTransport(body: #"{"card":\#(ReadingAPITests.card),"changed":true}"#)
        let result = try await api(transport).resonate(with: "target", cardId: "c1")
        #expect(result.changed)
        #expect(result.card.id == "c1")
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path == "/cards/target/resonances")
        #expect(request.headerFields[.authorization] == "Bearer stale-token")
        let sent = try #require(transport.sentJSON.first ?? nil)
        #expect(sent["cardId"] as? String == "c1")
        #expect(sent.keys.sorted() == ["cardId"])
    }

    @Test func resonatingSaysWhyItWasRefused() async throws {
        for (status, code) in [(HTTPResponse.Status.conflict, "conflict"), (.tooManyRequests, "rate_limited"),
                               (.forbidden, "forbidden"), (.notFound, "not_found"), (.badRequest, "invalid_request")] {
            let transport = StubTransport(status: status, body: #"{"error":{"code":"\#(code)","message":"No."}}"#)
            await #expect(throws: APIFailure(code: code, message: "No.", status: status.code)) {
                try await api(transport).resonate(with: "target", cardId: "c1")
            }
        }
    }

    @Test func stopsResonatingThroughTheContract() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).unresonate(from: "target", cardId: "c1")
        let request = try #require(transport.requests.first)
        #expect(request.method == .delete)
        #expect(request.path == "/cards/target/resonances/c1")
        let refused = StubTransport(status: .notFound, body: #"{"error":{"code":"not_found","message":"No such card."}}"#)
        await #expect(throws: APIFailure(code: "not_found", message: "No such card.", status: 404)) {
            try await api(refused).unresonate(from: "target", cardId: "bobs-card")
        }
    }

    @Test func someoneElsesCardIsNotFound() async throws {
        let transport = StubTransport(status: .notFound, body: #"{"error":{"code":"not_found","message":"No such card."}}"#)
        await #expect(throws: APIFailure(code: "not_found", message: "No such card.", status: 404)) {
            try await api(transport).deleteCard("bobs-card")
        }
        await #expect(throws: APIFailure(code: "not_found", message: "No such card.", status: 404)) {
            try await api(transport).updateCard("bobs-card", visibility: ._private)
        }
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

    @Test func aProfilePhotoSaysItIsAnAvatar() async throws {
        StubURLProtocol.reset([(200, #"{"publicUrl":"https://img.test/avatar/2026-10/a.webp","key":"avatar/2026-10/a.webp"}"#)])
        let photo = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x03])
        let url = try await api().upload(photo, filename: "avatar.jpg", purpose: "avatar")
        #expect(url.absoluteString == "https://img.test/avatar/2026-10/a.webp")

        let (request, body) = try #require(StubURLProtocol.sent.first)
        let contentType = try #require(request.value(forHTTPHeaderField: "Content-Type"))
        let boundary = try #require(contentType.split(separator: "boundary=").last.map(String.init))
        // The file, then `purpose=avatar` (the route reads form.get('purpose') === 'avatar').
        let head = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"avatar.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8)
        let purpose = Data("\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\navatar".utf8)
        #expect(body == head + photo + purpose + Data("\r\n--\(boundary)--\r\n".utf8))
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
