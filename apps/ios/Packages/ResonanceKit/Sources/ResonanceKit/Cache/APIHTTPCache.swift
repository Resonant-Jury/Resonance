import CryptoKit
import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Synchronization

/// The API's HTTP cache, one account at a time.
///
/// The v1 API answers its GETs `Cache-Control: private` with an ETag: a
/// screen shown again within the answer's max-age costs no request, and one
/// after it costs a conditional request (a 304 when nothing changed).
/// URLCache keys an answer by its URL alone, so two accounts asking for the
/// same URL (GET /me, the card box) would get each other's — and
/// `removeAllCachedResponses()` empties a cache only some time later. So each
/// account gets its own URLCache and URLSession (`use(account:)`): switching
/// account or signing out drops the old one (cancelling what it still had in
/// flight) and deletes its files, and a signed-out session keeps nothing.
public final class APIHTTPCache: Sendable {
    /// API answers are a few KB to a few hundred (a card with its story and lists).
    public static let memoryCapacity = 4 * 1024 * 1024
    public static let diskCapacity = 32 * 1024 * 1024

    /// Which answers must be asked for again (after the viewer's own writes).
    public let freshness = APIFreshness()

    private struct Partition {
        let account: String?
        let session: URLSession
        let cache: URLCache?
    }

    private let root: URL
    private let partition: Mutex<Partition>

    public init(root: URL) {
        self.root = root
        partition = Mutex(Self.partition(for: nil, root: root))
    }

    /// The app's: in Caches, apart from URLCache.shared (images stay put on sign-out).
    public static func standard() -> APIHTTPCache {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return APIHTTPCache(root: caches.appending(path: "APIHTTP", directoryHint: .isDirectory))
    }

    /// The session for the account signed in now.
    public var session: URLSession { partition.withLock { $0.session } }
    public var account: String? { partition.withLock { $0.account } }

    /// From now on requests go through `uid`'s cache (nil: signed out, no
    /// cache). The previous account's session is cancelled and its cache
    /// emptied and deleted, as is any other account's left on disk.
    public func use(account uid: String?) {
        let old: Partition? = partition.withLock { current in
            guard current.account != uid else { return nil }
            let old = current
            current = Self.partition(for: uid, root: root)
            return old
        }
        if let old {
            // No room left: it keeps nothing more, whatever it still had on its way.
            old.cache?.memoryCapacity = 0
            old.cache?.diskCapacity = 0
            old.session.invalidateAndCancel()
            freshness.reset()
        }
        let keep = uid.map(Self.folder)
        let folders = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
        for folder in folders where folder != keep {
            try? FileManager.default.removeItem(at: root.appending(path: folder))
        }
    }

    private static func partition(for uid: String?, root: URL) -> Partition {
        let configuration = URLSessionConfiguration.default
        configuration.requestCachePolicy = .useProtocolCachePolicy
        guard let uid else {
            configuration.urlCache = nil
            return Partition(account: nil, session: URLSession(configuration: configuration), cache: nil)
        }
        let cache = URLCache(memoryCapacity: memoryCapacity, diskCapacity: diskCapacity,
                             directory: root.appending(path: folder(uid), directoryHint: .isDirectory))
        configuration.urlCache = cache
        return Partition(account: uid, session: URLSession(configuration: configuration), cache: cache)
    }

    /// An account's folder: a digest of its uid, so no uid is ever a path.
    static func folder(_ uid: String) -> String {
        SHA256.hash(data: Data(uid.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined()
    }
}

/// Which cached answers may no longer be the truth for the viewer: after
/// their own write (anything the API changes for them, or a write the app
/// makes straight to Firestore — a block, a bookmark, a draft) every URL's
/// next GET asks the server again (`Cache-Control: no-cache`, answered 304
/// when it's unchanged) — once; the answer it brings is good again.
public final class APIFreshness: Sendable {
    private struct State {
        /// Something changed since the cache was last trusted.
        var stale = false
        /// URLs asked again since then.
        var revalidated: Set<String> = []
    }

    private let state = Mutex(State())

    public init() {}

    /// The viewer changed something: every URL's next GET goes to the server.
    public func invalidate() {
        state.withLock { $0 = State(stale: true) }
    }

    /// Whether this GET must go to the server (and, if so, it now has).
    func mustRevalidate(_ key: String) -> Bool {
        state.withLock { $0.stale && $0.revalidated.insert(key).inserted }
    }

    func reset() {
        state.withLock { $0 = State() }
    }
}

/// Sends `Cache-Control: no-cache` on a GET that `APIFreshness` says must go
/// to the server, and marks every URL stale after a write that succeeded —
/// except the push registration, which changes nothing anyone reads.
public struct FreshnessMiddleware: ClientMiddleware {
    let freshness: APIFreshness
    /// Writes that leave every read as it was.
    static let unchanging: Set<String> = ["registerDevice", "unregisterDevice"]
    /// The header that opts in to the server's `max-age` (src/lib/api/v1/cache.ts).
    static let optIn = HTTPField.Name("X-Resonance-Cache")!

    public init(freshness: APIFreshness) {
        self.freshness = freshness
    }

    public func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard request.method == .get else {
            let (response, responseBody) = try await next(request, body, baseURL)
            if response.status.kind == .successful, !Self.unchanging.contains(operationID) { freshness.invalidate() }
            return (response, responseBody)
        }
        var request = request
        // This client keeps answers per account and re-asks after the viewer's own writes, so it
        // may reuse a private answer while fresh: the server only allows max-age > 0 to clients
        // that say so (older builds, sharing URLSession.shared, revalidate every time).
        request.headerFields[Self.optIn] = "1"
        if freshness.mustRevalidate(request.path ?? "") { request.headerFields[.cacheControl] = "no-cache" }
        return try await next(request, body, baseURL)
    }
}

/// URLSessionTransport through the signed-in account's session.
public struct AccountCacheTransport: ClientTransport {
    let cache: APIHTTPCache

    public init(cache: APIHTTPCache) {
        self.cache = cache
    }

    public func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        try await URLSessionTransport(configuration: .init(session: cache.session))
            .send(request, body: body, baseURL: baseURL, operationID: operationID)
    }
}
