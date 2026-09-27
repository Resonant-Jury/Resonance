import Foundation
import ResonanceAPI

/// A failed API call as the UI needs it: the contract's error code (so a
/// screen can react to `not_found` or `rate_limited`) and a message it can show.
public struct APIFailure: Error, Equatable, Sendable {
    public var code: String
    public var message: String
    public var status: Int?

    public init(code: String, message: String, status: Int? = nil) {
        self.code = code
        self.message = message
        self.status = status
    }

    /// From the contract's `{ error: { code, message } }` body.
    public init(_ body: Components.Schemas.ApiError, status: Int) {
        self.init(code: body.error.code.rawValue, message: body.error.message, status: status)
    }

    /// A response the contract doesn't describe (proxy error, server crash).
    public static func unexpected(status: Int) -> APIFailure {
        APIFailure(code: status >= 500 ? "internal" : "unexpected", message: "HTTP \(status)", status: status)
    }

    public var isUnauthenticated: Bool { code == "unauthenticated" }
    public var isNotFound: Bool { code == "not_found" }
}
