import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// The account's own profile: telling "no profile yet" from a failed request
/// (the onboarding gate hangs on it), creating and editing it, the pen-name check.
struct ProfileAPITests {
    static let me = """
    {"id":"alice","handle":"海風","initials":"海風","accentColor":"oklch(88% 0.08 55)","bio":null,"avatarUrl":null,
     "region":"TW","primaryLocale":"zh-TW","handleChangedAt":null}
    """

    func api(_ transport: StubTransport) -> ProfileAPI {
        ProfileAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport))
    }

    @Test func readsTheProfile() async throws {
        let me = try await api(StubTransport(body: Self.me)).me()
        #expect(me?.handle == "海風")
        #expect(me?.region == "TW")
    }

    @Test func theAccountBringsItsScheduledDeletion() async throws {
        // The app's client, which reads the contract's timestamps (milliseconds included).
        func api(_ body: String) -> ProfileAPI {
            ProfileAPI(client: ResonanceClient.make(APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil }),
                                                    transport: StubTransport(body: body), middlewares: []))
        }
        let scheduled = Self.me.replacingOccurrences(of: #""handleChangedAt":null"#, with: #""handleChangedAt":null,"#
            + #""deletion":{"requestedAt":"2026-10-01T09:30:00.000Z","purgeAfter":"2026-10-08T09:30:00.000Z"}"#)
        let me = try await api(scheduled).me()
        #expect(me?.deletion?.value1.purgeAfter == ISO8601.date("2026-10-08T09:30:00.000Z"))
        // None scheduled: null — or, from a server older than the field, absent.
        let none = Self.me.replacingOccurrences(of: #""handleChangedAt":null"#, with: #""handleChangedAt":null,"deletion":null"#)
        #expect(try await api(none).me()?.deletion == nil)
        #expect(try await api(Self.me).me()?.deletion == nil)
    }

    @Test func onlyTheContractsNotFoundMeansNoProfileYet() async throws {
        let missing = StubTransport(status: .notFound, body: #"{"error":{"code":"not_found","message":"This account has no profile yet."}}"#)
        #expect(try await api(missing).me() == nil)
    }

    @Test func aFailedRequestIsNeverANewAccount() async throws {
        // A server error, a proxy's HTML 404 and an unexpected 404 all throw — none of them is "no profile".
        await #expect(throws: APIFailure.unexpected(status: 502)) {
            try await api(StubTransport(status: .badGateway, body: "<html>")).me()
        }
        let html = StubTransport(status: .notFound, body: "<html>Not found</html>")
        html.contentType = "text/html"
        await #expect(throws: (any Error).self) { try await api(html).me() }
        let garbled = StubTransport(status: .notFound, body: "<html>")
        await #expect(throws: (any Error).self) { try await api(garbled).me() }
        let other = StubTransport(status: .notFound, body: #"{"error":{"code":"internal","message":"x"}}"#)
        await #expect(throws: APIFailure(code: "internal", message: "x", status: 404)) { try await api(other).me() }
    }

    @Test func createsTheProfileAndTakesAnExistingOneBack() async throws {
        let created = StubTransport(status: .created, body: Self.me)
        let me = try await api(created).create(handle: "海風", region: "TW", language: .zhTW)
        #expect(me.id == "alice")
        let request = try #require(created.requests.first)
        #expect(request.method == .post)
        #expect(request.path?.hasSuffix("/me") == true)
        let sent = try #require(created.sentJSON.first ?? nil)
        #expect(sent["handle"] as? String == "海風")
        #expect(sent["region"] as? String == "TW")
        #expect(sent["primaryLocale"] as? String == "zh-TW")
        // Idempotent: a retried request answers 200 with the profile it already made.
        #expect(try await api(StubTransport(status: .ok, body: Self.me)).create(handle: "海風", region: "TW", language: .en).id == "alice")
    }

    @Test func aNameTakenMeanwhileIsAConflict() async throws {
        let transport = StubTransport(status: .conflict, body: #"{"error":{"code":"conflict","message":"That pen name is taken."}}"#)
        do {
            _ = try await api(transport).create(handle: "海風", region: "TW", language: .en)
            Issue.record("expected a conflict")
        } catch let failure as APIFailure {
            #expect(failure.isConflict)
        }
        await #expect(throws: APIFailure.self) { try await api(transport).update(handle: "海風") }
    }

    @Test func updateSendsOnlyTheFieldsGiven() async throws {
        let transport = StubTransport(body: Self.me)
        _ = try await api(transport).update(bio: "")
        let sent = try #require(transport.sentJSON.first ?? nil)
        #expect(transport.requests.first?.method == .patch)
        #expect(sent["bio"] as? String == "")
        #expect(sent["handle"] == nil)
        #expect(sent["region"] == nil)
    }

    @Test func checksANameInItsOwnPathSegment() async throws {
        let transport = StubTransport(body: #"{"handle":"海風 2","available":false}"#)
        #expect(try await api(transport).isAvailable("海風 2") == false)
        #expect(transport.requests.first?.path?.hasSuffix("/handles/%E6%B5%B7%E9%A2%A8%202") == true)
    }

    @Test func reportsACardThroughTheServer() async throws {
        let transport = StubTransport(status: .created, body: #"{"id":"r1"}"#)
        let safety = SafetyAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport))
        #expect(try await safety.reportCard("a-walk", reason: .selfHarm, detail: nil) == "r1")
        #expect(transport.requests.first?.path?.hasSuffix("/cards/a-walk/report") == true)
        let sent = try #require(transport.sentJSON.first ?? nil)
        #expect(sent["reason"] as? String == "self_harm")
        #expect(sent["detail"] == nil)
        // No author in the request: the server knows it, anonymous cards included.
        #expect(sent.keys.sorted() == ["reason"])
    }

    @Test func reportsAPersonOrAMessageThroughTheServer() async throws {
        let transport = StubTransport(status: .created, body: #"{"id":"r2"}"#)
        let safety = SafetyAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport))
        #expect(try await safety.report(.person("mallory"), reason: .harassment, detail: "每天都來") == "r2")
        try await safety.report(.message("m7", conversationId: "alice_mallory"), reason: .spam, detail: nil)
        try await safety.report(.conversation("alice_mallory"), reason: .other, detail: nil)
        #expect(transport.requests.allSatisfy { $0.method == .post && $0.path?.hasSuffix("/reports") == true })
        let sent = transport.sentJSON.compactMap { $0 }
        #expect(sent.count == 3)
        #expect(sent[0]["targetType"] as? String == "user")
        #expect(sent[0]["targetId"] as? String == "mallory")
        #expect(sent[0]["conversationId"] == nil)
        #expect(sent[0]["reason"] as? String == "harassment")
        #expect(sent[0]["detail"] as? String == "每天都來")
        #expect(sent[1]["targetType"] as? String == "message")
        #expect(sent[1]["targetId"] as? String == "m7")
        #expect(sent[1]["conversationId"] as? String == "alice_mallory")
        #expect(sent[1]["detail"] == nil)
        // A conversation as a whole: the message report naming the conversation itself.
        #expect(sent[2]["targetType"] as? String == "message")
        #expect(sent[2]["targetId"] as? String == "alice_mallory")
        #expect(sent[2]["conversationId"] as? String == "alice_mallory")

        let refused = StubTransport(status: .notFound, body: #"{"error":{"code":"not_found","message":"No such message."}}"#)
        await #expect(throws: APIFailure(code: "not_found", message: "No such message.", status: 404)) {
            try await SafetyAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: refused))
                .report(.message("gone", conversationId: "alice_mallory"), reason: .spam, detail: nil)
        }
    }
}

/// The pen name's rules, as the contract's `Handle` checks them.
struct PenNameTests {
    @Test func acceptsTwoToTwentyCharactersOfAnyScript() {
        #expect(PenName.isValid("海風"))
        #expect(PenName.isValid("  alice  "))
        #expect(PenName.isValid(String(repeating: "a", count: 20)))
        #expect(!PenName.isValid("a"))
        #expect(!PenName.isValid("  a  "))
        #expect(!PenName.isValid(String(repeating: "a", count: 21)))
    }

    @Test func countsLengthLikeTheServer() {
        // An emoji is two UTF-16 units, as JavaScript counts it.
        #expect(PenName.isValid(String(repeating: "🌊", count: 10)))
        #expect(!PenName.isValid(String(repeating: "🌊", count: 11)))
    }

    @Test func refusesPathCharactersAndControls() {
        for bad in ["a/b", "a?b", "a#b", "a\\b", "a\u{7}b", "a\nb"] {
            #expect(!PenName.isValid(bad), "\(bad)")
        }
        #expect(PenName.sanitized("a/b?c#d\\e\u{7}") == "abcde")
    }

    @Test func typingStopsAtTheLimitWithoutSplittingACharacter() {
        #expect(PenName.sanitized(String(repeating: "a", count: 25)) == String(repeating: "a", count: 20))
        #expect(PenName.sanitized(String(repeating: "a", count: 19) + "🌊") == String(repeating: "a", count: 19))
        #expect("一句話介紹".prefix(utf16Units: 80) == "一句話介紹")
    }
}
