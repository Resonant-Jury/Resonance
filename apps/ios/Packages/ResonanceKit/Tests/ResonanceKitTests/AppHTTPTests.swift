import Foundation
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// Every session the app makes is set up one way (AppHTTP): each request says
/// which app and version it comes from, and waits 30 seconds for the server
/// rather than URLSession's minute — through the per-account HTTP cache and
/// through the calls no cache keeps alike.
@Suite struct AppHTTPTests {
    let server: LocalHTTPServer

    init() throws {
        server = try LocalHTTPServer { request in
            switch request.path {
            case "/api/account/deletion": .init(body: #"{"deletion":null}"#)
            default: .init(headers: ["Cache-Control": "private, max-age=0"], body: #"{"cards":[],"nextCursor":null}"#)
            }
        }
    }

    private var configuration: APIConfiguration {
        APIConfiguration(origin: server.origin, idToken: { _ in "token" })
    }

    @Test func theUserAgentNamesTheAppItsVersionAndBuild() {
        #expect(AppHTTP.userAgent(version: "2.0.0", build: "3", os: "18.5") == "Resonance/2.0.0 (iOS 18.5; build 3)")
        #expect(AppHTTP.userAgent.hasPrefix("Resonance/"))
    }

    @Test func everyRequestSaysWhichAppItComesFrom() async throws {
        let cache = APIHTTPCache(root: FileManager.default.temporaryDirectory.appending(path: "AppHTTPTests-\(UUID().uuidString)"))
        cache.use(account: "alice")
        // Signed out at the end: the account's cache goes with its folder.
        defer { cache.use(account: nil) }
        // The API through the account's HTTP cache, a client of its own (a sign-out's last call), and the account routes.
        _ = try await ReadingAPI(client: ResonanceClient.make(configuration, cache: cache)).feed()
        _ = try await ReadingAPI(client: ResonanceClient.make(configuration)).feed()
        _ = try await AccountAPI(configuration).deletion()
        let agents = server.requests.map { $0.headers["user-agent"] }
        #expect(agents.count == 3)
        #expect(agents.allSatisfy { $0 == AppHTTP.userAgent })
    }

    @Test func requestsWaitHalfAMinuteNotAWhole() {
        let root = FileManager.default.temporaryDirectory.appending(path: "AppHTTPTests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = APIHTTPCache(root: root)
        #expect(cache.session.configuration.timeoutIntervalForRequest == 30)
        cache.use(account: "alice")
        #expect(cache.session.configuration.timeoutIntervalForRequest == 30)
        #expect(AppHTTP.session.configuration.timeoutIntervalForRequest == 30)
        // The calls no cache keeps store nothing either.
        #expect(AppHTTP.session.configuration.urlCache == nil)
    }
}
