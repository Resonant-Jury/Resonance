import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import ResonanceAPI
@testable import ResonanceKit

/// Answers every request with a canned status and JSON body, and records what was sent.
final class StubTransport: ClientTransport, @unchecked Sendable {
    var status: HTTPResponse.Status
    var body: String
    private(set) var requests: [HTTPRequest] = []

    init(status: HTTPResponse.Status = .ok, body: String) {
        self.status = status
        self.body = body
    }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        requests.append(request)
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, HTTPBody(self.body))
    }
}

@Suite struct ReadingAPITests {
    static let card = """
    {"id":"c1","slug":"a-walk","title":"一場雨後的散步","excerpt":"雨停的時候…","tags":["日常"],
     "publishedAt":"2026-09-01T08:00:00.000Z","author":{"id":"bob","handle":"bob","initials":"BO",
     "accentColor":"oklch(90% 0.05 60)","avatarUrl":null,"avatarSeed":"42","verified":true},
     "imageUrl":null,"imageLabel":"一場雨後的散步","accentHue":140,"readMinutes":2,"referenceCardId":null,
     "reason":null,"someFieldFromTheFuture":1}
    """

    func api(_ transport: StubTransport) -> ReadingAPI {
        let client = Client(
            serverURL: URL(string: "https://example.test/api/v1")!,
            transport: transport,
            middlewares: [BearerAuthMiddleware(idToken: { _ in "token-123" })]
        )
        return ReadingAPI(client: client)
    }

    @Test func decodesAFeedPageAndSendsTheToken() async throws {
        let transport = StubTransport(body: #"{"cards":[\#(Self.card)],"nextCursor":null}"#)
        let page = try await api(transport).feed()
        #expect(page.cards.first?.title == "一場雨後的散步")
        #expect(page.cards.first?.author?.value1.avatarSeed == "42")
        #expect(page.nextCursor == nil)
        #expect(transport.requests.first?.headerFields[.authorization] == "Bearer token-123")
    }

    @Test func mapsContractErrorsToAPIFailure() async throws {
        let transport = StubTransport(status: .notFound, body: #"{"error":{"code":"not_found","message":"No such card."}}"#)
        await #expect(throws: APIFailure(code: "not_found", message: "No such card.", status: 404)) {
            try await api(transport).card("nope")
        }
    }

    @Test func treatsUndocumentedStatusesAsUnexpected() async throws {
        let transport = StubTransport(status: .badGateway, body: "<html>")
        await #expect(throws: APIFailure.unexpected(status: 502)) {
            try await api(transport).recommended()
        }
    }

    @Test func parsesTheContractsTimestamps() {
        #expect(ISO8601.date("2026-09-01T08:00:00.000Z") != nil)
        #expect(ISO8601.date("2026-09-01T08:00:00Z") != nil)
    }

    @Test func refreshesARejectedTokenOnceAndRetries() async throws {
        let transport = StubTransport(status: .unauthorized, body: #"{"error":{"code":"unauthenticated","message":"x"}}"#)
        let refreshed = Counter()
        let client = Client(
            serverURL: URL(string: "https://example.test/api/v1")!,
            transport: transport,
            middlewares: [BearerAuthMiddleware(idToken: { force in
                if force { await refreshed.increment(); return "fresh" }
                return "stale"
            })]
        )
        await #expect(throws: APIFailure.self) { try await ReadingAPI(client: client).recommended() }
        #expect(transport.requests.map { $0.headerFields[.authorization] } == ["Bearer stale", "Bearer fresh"])
        #expect(await refreshed.value == 1)
    }
}

actor Counter {
    var value = 0
    func increment() { value += 1 }
}
