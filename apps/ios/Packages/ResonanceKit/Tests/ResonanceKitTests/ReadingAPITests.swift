import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import ResonanceAPI
@testable import ResonanceKit

/// Answers every request with a canned status and JSON body (or, with
/// `reply`, a body made for that request), and records what was sent.
final class StubTransport: ClientTransport, @unchecked Sendable {
    var status: HTTPResponse.Status
    var body: String
    var contentType = "application/json"
    var reply: (@Sendable (HTTPRequest) -> String)?
    private let lock = NSLock()
    private var _requests: [HTTPRequest] = []
    private var _sentJSON: [[String: Any]?] = []
    var requests: [HTTPRequest] { lock.withLock { _requests } }
    /// Each request's body as JSON (nil for a request without one).
    var sentJSON: [[String: Any]?] { lock.withLock { _sentJSON } }

    init(status: HTTPResponse.Status = .ok, body: String) {
        self.status = status
        self.body = body
    }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        var sent: [String: Any]?
        if let body {
            sent = try? JSONSerialization.jsonObject(with: try await Data(collecting: body, upTo: 1 << 20)) as? [String: Any]
        }
        lock.withLock {
            _requests.append(request)
            _sentJSON.append(sent)
        }
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = contentType
        return (response, HTTPBody(reply?(request) ?? self.body))
    }
}

extension HTTPRequest {
    /// The request's path without its query.
    var bare: String { String((path ?? "").prefix { $0 != "?" }) }

    /// One query parameter, decoded.
    func query(_ name: String) -> String? {
        URLComponents(string: path ?? "")?.queryItems?.first { $0.name == name }?.value
    }
}

@Suite struct ReadingAPITests {
    static let card = """
    {"id":"c1","slug":"a-walk","title":"一場雨後的散步","excerpt":"雨停的時候…","tags":["日常"],
     "publishedAt":"2026-09-01T08:00:00.000Z","author":{"id":"bob","handle":"bob","initials":"BO",
     "accentColor":"oklch(90% 0.05 60)","avatarUrl":null,"avatarSeed":"42","verified":true,"region":"TW"},
     "anonymous":false,"visibility":"public",
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

    static func card(_ id: String, slug: String? = nil) -> String {
        Self.card.replacingOccurrences(of: #""id":"c1","slug":"a-walk""#,
                                       with: #""id":"\#(id)","slug":\#(slug.map { "\"\($0)\"" } ?? "null")"#)
    }

    static func detail(lists: String) -> String {
        #"{"card":\#(card),"story":"[一場雨](/card/rain)\n\n","visibility":"public","anonymous":false,"resonanceCount":1,"#
            + #""coreInsight":null,"isOwner":true,"referenceCard":null\#(lists)}"#
    }

    @Test func aCardPageIsOneRequestWithItsListsAndEmbeds() async throws {
        let transport = StubTransport(body: Self.detail(lists: #","resonances":{"cards":[\#(Self.card("r1"))]},"#
            + #""related":{"cards":[\#(Self.card("rel1"))]},"links":{"cards":[\#(Self.card("l1"))]},"#
            + #""embeds":{"cards":[\#(Self.card("e1", slug: "rain"))]}"#))
        let detail = try await api(transport).card("a-walk", include: ReadingAPI.CardInclude.page)
        #expect(transport.requests.count == 1)
        let request = try #require(transport.requests.first)
        #expect(request.bare == "/cards/a-walk")
        #expect(request.query("include") == "resonances,related,links,embeds")
        #expect(detail.resonances?.cards.map(\.id) == ["r1"])
        #expect(detail.related?.cards.map(\.id) == ["rel1"])
        #expect(detail.links?.cards.map(\.id) == ["l1"])
        #expect(detail.embeds?.cards.map(\.slug) == ["rain"])
    }

    @Test func aCardAloneAsksForNoLists() async throws {
        let transport = StubTransport(body: Self.detail(lists: ""))
        let detail = try await api(transport).card("a-walk")
        #expect(transport.requests.first?.query("include") == nil)
        #expect(detail.resonances == nil && detail.embeds == nil)
    }

    @Test func aProfilePageIsOneRequestWithItsCardsAndLinks() async throws {
        let transport = StubTransport(body: """
        {"author":{"id":"bob","handle":"bob","initials":"BO","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,
         "avatarSeed":"42","verified":false,"region":"TW"},"bio":null,"joinedAt":"2026-01-01T00:00:00.000Z","cardCount":3,
         "isSelf":false,"isConnected":true,"isBlocked":false,
         "cards":{"cards":[\(Self.card("c1"))],"nextCursor":"2026-09-01T08:00:00.000Z"},"links":{"cards":[\(Self.card("l1"))]}}
        """)
        let profile = try await api(transport).profile("bob", include: ReadingAPI.ProfileInclude.page, limit: 12)
        #expect(transport.requests.count == 1)
        let request = try #require(transport.requests.first)
        #expect(request.bare == "/users/bob")
        #expect(request.query("include") == "cards,links")
        #expect(request.query("limit") == "12")
        #expect(profile.cards?.cards.map(\.id) == ["c1"])
        #expect(profile.cards?.nextCursor == "2026-09-01T08:00:00.000Z")
        #expect(profile.links?.cards.map(\.id) == ["l1"])

        // Asked for alone (a conversation checking who someone is), no lists and no limit.
        _ = try await api(transport).profile("bob")
        #expect(transport.requests.last?.query("include") == nil)
        #expect(transport.requests.last?.query("limit") == nil)
    }

    @Test func severalCardsAreOneRequestInTheOrderAsked() async throws {
        let transport = StubTransport(body: "")
        // The server answers what it may show, in the order asked; c2 is not readable.
        transport.reply = { request in
            let keys = request.query("keys")?.split(separator: ",").map(String.init) ?? []
            return #"{"cards":[\#(keys.filter { $0 != "c2" }.map { ReadingAPITests.card($0) }.joined(separator: ","))]}"#
        }
        let cards = try await api(transport).cards(keys: ["c3", "c1", "c2", "c1", "not/a key", ""])
        #expect(cards.map(\.id) == ["c3", "c1"])
        #expect(transport.requests.count == 1)
        #expect(transport.requests.first?.bare == "/cards")
        // Each once, and never a key the server would refuse the whole request for.
        #expect(transport.requests.first?.query("keys") == "c3,c1,c2")
    }

    @Test func moreThanThirtyCardsGoOutSideBySideAndComeBackInOrder() async throws {
        let transport = StubTransport(body: "")
        transport.reply = { request in
            let keys = request.query("keys")?.split(separator: ",").map(String.init) ?? []
            return #"{"cards":[\#(keys.map { ReadingAPITests.card($0) }.joined(separator: ","))]}"#
        }
        let keys = (1...45).map { "c\($0)" }
        let cards = try await api(transport).cards(keys: keys)
        #expect(cards.map(\.id) == keys)
        #expect(transport.requests.count == 2)
        #expect(Set(transport.requests.compactMap { $0.query("keys")?.split(separator: ",").count }) == [30, 15])
    }

    @Test func noCardsIsNoRequest() async throws {
        let transport = StubTransport(body: #"{"cards":[]}"#)
        #expect(try await api(transport).cards(keys: []).isEmpty)
        #expect(try await api(transport).cards(keys: ["../users"]).isEmpty)
        #expect(transport.requests.isEmpty)
    }

    @Test func aStoryLinkNamesItsCard() {
        #expect(CardKey.of(href: "/card/a-walk") == "a-walk")
        #expect(CardKey.of(href: "/card/a-walk?from=story#top") == "a-walk")
        #expect(CardKey.of(href: "/card/a-walk/more") == "a-walk")
        #expect(CardKey.of(href: "/card/%E9%9B%A8") == "雨")
        #expect(CardKey.of(href: "/card/") == nil)
        #expect(CardKey.of(href: "/u/bob") == nil)
        #expect(CardKey.of(href: "https://example.com/card/a-walk") == nil)
        #expect(CardKey.isValid("a-walk_2"))
        #expect(!CardKey.isValid("雨"))
        #expect(!CardKey.isValid(String(repeating: "a", count: 161)))
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
