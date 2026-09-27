import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import ResonanceAPI

/// Where the API lives and how a request gets its credentials.
public struct APIConfiguration: Sendable {
    /// The site's origin, e.g. https://resonance-world.vercel.app (the client adds /api/v1).
    public var origin: URL
    /// A fresh Firebase ID token, or nil when signed out. Called per request;
    /// the Firebase SDK caches the token and refreshes it before it expires.
    public var idToken: @Sendable () async throws -> String?

    public init(origin: URL, idToken: @escaping @Sendable () async throws -> String?) {
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
}

/// Adds `Authorization: Bearer <Firebase ID token>` — how the API recognises
/// the app (the web uses its session cookie instead).
public struct BearerAuthMiddleware: ClientMiddleware {
    let idToken: @Sendable () async throws -> String?

    public init(idToken: @escaping @Sendable () async throws -> String?) {
        self.idToken = idToken
    }

    public func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if let token = try await idToken() {
            request.headerFields[.authorization] = "Bearer \(token)"
        }
        return try await next(request, body, baseURL)
    }
}
