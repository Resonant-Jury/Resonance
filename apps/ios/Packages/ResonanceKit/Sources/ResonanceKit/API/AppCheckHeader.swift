import Foundation
import HTTPTypes
import OpenAPIRuntime
import Synchronization

/// The app's current Firebase App Check token, as the app last heard it
/// (App Attest in release builds; see FirebaseBootstrap). The API only
/// watches it for now — nothing is refused without one — so a request never
/// waits for a token: it carries the one at hand, or none.
public enum AppCheckHeader {
    public static let name = HTTPField.Name("X-Firebase-AppCheck")!

    private static let token = Mutex<String?>(nil)

    /// The token to send from now on (nil: none).
    public static func set(_ value: String?) {
        token.withLock { $0 = value?.isEmpty == false ? value : nil }
    }

    public static var current: String? { token.withLock { $0 } }
}

/// Adds `X-Firebase-AppCheck` when the app has a token at hand.
struct AppCheckMiddleware: ClientMiddleware {
    let token: @Sendable () -> String?

    init(token: @escaping @Sendable () -> String? = { AppCheckHeader.current }) {
        self.token = token
    }

    func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard let value = token() else { return try await next(request, body, baseURL) }
        var attested = request
        attested.headerFields[AppCheckHeader.name] = value
        return try await next(attested, body, baseURL)
    }
}
