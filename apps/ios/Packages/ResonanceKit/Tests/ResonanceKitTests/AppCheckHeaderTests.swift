import Foundation
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// The API watches App Check (it refuses nothing yet): every call carries the
/// token the app has at hand, through the account's cache or not, and a call
/// made before there is one simply goes without.
@Suite(.serialized) struct AppCheckHeaderTests {
    let server: LocalHTTPServer

    init() throws {
        server = try LocalHTTPServer { _ in
            .init(headers: ["Cache-Control": "private, max-age=0"], body: #"{"cards":[],"nextCursor":null}"#)
        }
    }

    private var configuration: APIConfiguration {
        APIConfiguration(origin: server.origin, idToken: { _ in "token" })
    }

    @Test func callsCarryTheTokenAtHandAndGoWithoutOneOtherwise() async throws {
        defer { AppCheckHeader.set(nil) }
        let cache = APIHTTPCache(root: FileManager.default.temporaryDirectory.appending(path: "AppCheckHeaderTests-\(UUID().uuidString)"))
        cache.use(account: "alice")
        defer { cache.use(account: nil) }

        AppCheckHeader.set(nil)
        _ = try await ReadingAPI(client: ResonanceClient.make(configuration)).feed()
        AppCheckHeader.set("attested")
        _ = try await ReadingAPI(client: ResonanceClient.make(configuration)).feed()
        _ = try await ReadingAPI(client: ResonanceClient.make(configuration, cache: cache)).feed()
        AppCheckHeader.set("")
        _ = try await ReadingAPI(client: ResonanceClient.make(configuration)).feed()

        #expect(server.requests.map { $0.headers["x-firebase-appcheck"] } == [nil, "attested", "attested", nil])
    }
}
