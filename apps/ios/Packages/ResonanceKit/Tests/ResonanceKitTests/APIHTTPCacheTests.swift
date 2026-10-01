import Foundation
import ResonanceAPI
import Synchronization
import Testing
@testable import ResonanceKit

/// The app's client against a real local server: what the v1 API answers
/// `Cache-Control: private` with an ETag is reused within its max-age and
/// revalidated after; the viewer's own writes make the next GET of every URL
/// go to the server; and no answer ever crosses from one account to another.
@Suite struct APIHTTPCacheTests {
    /// Who the next request's token belongs to.
    let signedIn = Shared("alice")
    let maxAge = Shared(30)
    let root = FileManager.default.temporaryDirectory.appending(path: "APIHTTPCacheTests-\(UUID().uuidString)")
    let server: LocalHTTPServer
    let cache: APIHTTPCache

    init() throws {
        let maxAge = maxAge
        server = try LocalHTTPServer { request in
            // The API's answer for whoever the token names (`Bearer <uid>`).
            let uid = request.headers["authorization"]?.replacingOccurrences(of: "Bearer ", with: "") ?? "nobody"
            let etag = "\"\(uid)-1\""
            let caching = ["Cache-Control": "private, max-age=\(maxAge.withLock { $0 })", "ETag": etag]
            switch (request.method, request.path) {
            case ("GET", _) where request.headers["if-none-match"] == etag:
                return .init(status: 304, headers: caching)
            case ("GET", "/api/v1/me"):
                return .init(headers: caching, body: """
                {"id":"\(uid)","handle":"\(uid)","initials":"AB","accentColor":"oklch(90% 0.05 60)","bio":null,
                 "avatarUrl":null,"region":null,"primaryLocale":null,"handleChangedAt":null}
                """)
            case ("GET", _):
                return .init(headers: caching, body: #"{"cards":[],"nextCursor":null}"#)
            case ("POST", "/api/v1/notes"):
                return .init(status: 201, body: #"{"id":"n1"}"#)
            case ("POST", "/api/v1/messages"):
                return .init(status: 400, body: #"{"error":{"code":"invalid_request","message":"No."}}"#)
            default:
                return .init(status: 204)
            }
        }
        cache = APIHTTPCache(root: root)
        cache.use(account: "alice")
    }

    private var client: Client {
        let signedIn = signedIn
        return ResonanceClient.make(APIConfiguration(origin: server.origin, idToken: { _ in signedIn.withLock { $0 } }), cache: cache)
    }

    private var reading: ReadingAPI { ReadingAPI(client: client) }

    private func folderExists(_ uid: String) -> Bool {
        FileManager.default.fileExists(atPath: root.appending(path: APIHTTPCache.folder(uid)).path)
    }

    @Test func anAnswerWithinItsMaxAgeCostsNoRequest() async throws {
        _ = try await reading.feed()
        _ = try await reading.feed()
        _ = try await reading.feed()
        // The token-authenticated answer was kept (a private cache may) and reused.
        #expect(server.requests(to: "/api/v1/feed?limit=12").count == 1)
    }

    @Test func aStaleAnswerIsAskedForWithItsETag() async throws {
        maxAge.withLock { $0 = 1 }
        _ = try await reading.feed()
        try await Task.sleep(for: .milliseconds(1500))
        let page = try await reading.feed()

        let asked = server.requests(to: "/api/v1/feed?limit=12")
        #expect(asked.count == 2)
        #expect(asked.last?.headers["if-none-match"] == "\"alice-1\"")
        // The 304 came back as the kept answer.
        #expect(page.cards.isEmpty && page.nextCursor == nil)
    }

    @Test func afterTheViewersWriteEachURLIsAskedForAgainOnce() async throws {
        _ = try await reading.feed()
        _ = try await ProfileAPI(client: client).me()
        _ = try await MessagingAPI(client: client).sendNote(cardId: "c1", text: "Hi")

        _ = try await reading.feed()
        _ = try await reading.feed()
        _ = try await ProfileAPI(client: client).me()

        let feed = server.requests(to: "/api/v1/feed?limit=12")
        #expect(feed.count == 2)
        #expect(feed.last?.headers["cache-control"] == "no-cache")
        // Revalidated, not refetched: a 304 when nothing changed.
        #expect(feed.last?.headers["if-none-match"] == "\"alice-1\"")
        let me = server.requests(to: "/api/v1/me")
        #expect(me.count == 2)
        #expect(me.last?.headers["cache-control"] == "no-cache")
    }

    @Test func aWriteMadeElsewhereMakesTheNextGETAskAgain() async throws {
        _ = try await reading.feed()
        // A block or a bookmark: written straight to Firestore, the API never saw it.
        cache.freshness.invalidate()
        _ = try await reading.feed()
        _ = try await reading.feed()

        let asked = server.requests(to: "/api/v1/feed?limit=12")
        #expect(asked.count == 2)
        #expect(asked.last?.headers["cache-control"] == "no-cache")
    }

    @Test func writesThatChangeNothingReadLeaveTheCacheTrusted() async throws {
        _ = try await reading.feed()
        // The push registration on every launch, and a write the server refused.
        try await PushAPI(client: client).register(installationId: "i1", token: "t", language: .en, appVersion: nil)
        _ = try? await MessagingAPI(client: client).sendMessage(to: "bob", text: "Hi")
        _ = try await reading.feed()

        #expect(server.requests(to: "/api/v1/feed?limit=12").count == 1)
    }

    @Test func anotherAccountNeverGetsTheFirstOnesAnswers() async throws {
        let alice = try await ProfileAPI(client: client).me()
        #expect(alice?.id == "alice")
        #expect(folderExists("alice"))

        // Bob signs in on the same phone and asks for the same URL within its max-age.
        signedIn.withLock { $0 = "bob" }
        cache.use(account: "bob")
        let bob = try await ProfileAPI(client: client).me()

        #expect(bob?.id == "bob")
        let asked = server.requests(to: "/api/v1/me")
        #expect(asked.count == 2)
        #expect(asked.last?.headers["authorization"] == "Bearer bob")
        #expect(asked.last?.headers["if-none-match"] == nil)
        #expect(!folderExists("alice"))
        // Nothing the dropped cache still had on its way brings her files back.
        try await Task.sleep(for: .milliseconds(500))
        #expect(!folderExists("alice"))
    }

    @Test func signedOutNothingIsKept() async throws {
        _ = try await reading.feed()
        cache.use(account: nil)
        #expect(!folderExists("alice"))

        signedIn.withLock { $0 = "nobody" }
        _ = try await reading.feed()
        _ = try await reading.feed()
        #expect(server.requests(to: "/api/v1/feed?limit=12").count == 3)
        #expect(((try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []).isEmpty)
    }

    @Test func theSameAccountKeepsItsCacheAndDropsOthersLeftOnDisk() throws {
        try FileManager.default.createDirectory(at: root.appending(path: APIHTTPCache.folder("carol")), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: root.appending(path: APIHTTPCache.folder("alice")), withIntermediateDirectories: true)
        // A cold start restoring alice: hers stays, carol's (from a session never signed out) goes.
        let relaunched = APIHTTPCache(root: root)
        relaunched.use(account: "alice")
        #expect(folderExists("alice"))
        #expect(!folderExists("carol"))
    }
}

/// A value the test and the server's thread both reach.
final class Shared<Value: Sendable>: Sendable {
    private let value: Mutex<Value>
    init(_ value: Value) { self.value = Mutex(value) }
    func withLock<T: Sendable>(_ body: (inout Value) -> T) -> T { value.withLock { body(&$0) } }
}
