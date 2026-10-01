import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import ResonanceAPI

/// Where the API lives and how a request gets its credentials.
public struct APIConfiguration: Sendable {
    /// The site's origin, e.g. https://resonance-world.vercel.app (the client adds /api/v1).
    public var origin: URL
    /// A Firebase ID token, or nil when signed out. Called per request with
    /// `forceRefresh: false` (the SDK caches the token and renews it before it
    /// expires); called again with `true` when the API rejects a token.
    public var idToken: @Sendable (_ forceRefresh: Bool) async throws -> String?

    public init(origin: URL, idToken: @escaping @Sendable (_ forceRefresh: Bool) async throws -> String?) {
        self.origin = origin
        self.idToken = idToken
    }

    public var apiURL: URL { origin.appending(path: "api/v1") }
}

public enum ResonanceClient {
    /// A generated v1 client that authenticates every call with the ID token.
    public static func make(_ configuration: APIConfiguration, session: URLSession = .shared) -> Client {
        Client(
            serverURL: configuration.apiURL,
            configuration: .init(dateTranscoder: .iso8601WithFractionalSeconds),
            transport: URLSessionTransport(configuration: .init(session: session)),
            middlewares: [BearerAuthMiddleware(idToken: configuration.idToken)]
        )
    }

    /// The app's client: through the signed-in account's HTTP cache, asking
    /// the server again after the viewer's own writes (`APIFreshness`).
    public static func make(_ configuration: APIConfiguration, cache: APIHTTPCache) -> Client {
        Client(
            serverURL: configuration.apiURL,
            configuration: .init(dateTranscoder: .iso8601WithFractionalSeconds),
            transport: AccountCacheTransport(cache: cache),
            // Freshness first: a request the token middleware retries keeps its no-cache.
            middlewares: [FreshnessMiddleware(freshness: cache.freshness), BearerAuthMiddleware(idToken: configuration.idToken)]
        )
    }
}

/// Adds `Authorization: Bearer <Firebase ID token>` — how the API recognises
/// the app (the web uses its session cookie instead). A token the API rejects
/// (revoked, or its account re-created) is refreshed once and the call retried.
public struct BearerAuthMiddleware: ClientMiddleware {
    let idToken: @Sendable (_ forceRefresh: Bool) async throws -> String?

    public init(idToken: @escaping @Sendable (_ forceRefresh: Bool) async throws -> String?) {
        self.idToken = idToken
    }

    public func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard let token = try await idToken(false) else { return try await next(request, body, baseURL) }
        var authorized = request
        authorized.headerFields[.authorization] = "Bearer \(token)"
        let (response, responseBody) = try await next(authorized, body, baseURL)
        guard response.status == .unauthorized, let fresh = try await idToken(true), fresh != token else {
            return (response, responseBody)
        }
        authorized.headerFields[.authorization] = "Bearer \(fresh)"
        return try await next(authorized, body, baseURL)
    }
}
