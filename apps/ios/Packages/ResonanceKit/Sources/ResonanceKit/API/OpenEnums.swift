import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI

/// A value the contract adds to one of its enums later (a new visibility, a
/// third writing language, a new error code) reaches installed apps before
/// they know it. swift-openapi-generator's enums are closed — one unknown
/// value fails the whole answer, a feed for one card — so every JSON answer
/// passes through here first, and such a value becomes the one this build
/// takes it for (`OpenEnums.fields`): only that field is approximated, the
/// answer still reads. (Android's generated client has its "unknown" case.)
public struct OpenEnumsMiddleware: ClientMiddleware {
    public init() {}

    public func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, responseBody) = try await next(request, body, baseURL)
        guard let responseBody, response.headerFields[.contentType]?.lowercased().contains("json") == true else {
            return (response, responseBody)
        }
        if case let .known(length) = responseBody.length, length > OpenEnums.maxBytes { return (response, responseBody) }
        let data = try await Data(collecting: responseBody, upTo: OpenEnums.maxBytes)
        return (response, HTTPBody(OpenEnums.normalize(data)))
    }
}

public enum OpenEnums {
    /// Far above any v1 answer (a card with its story and lists is a few hundred KB).
    static let maxBytes = 16 * 1024 * 1024

    /// Each enum in the contract's answers, by property name (no other
    /// property in an answer shares one of these names — `OpenEnumsTests`
    /// checks the table against openapi.json): the values this build knows,
    /// and what an unknown one is taken for.
    static let fields: [String: (known: Set<String>, fallback: String)] = [
        // A card's audience: an unknown one is treated as the narrowest (never offered as public).
        "visibility": (Set(Components.Schemas.FeedCard.VisibilityPayload.allCases.map(\.rawValue))
            .union(Components.Schemas.CardDetail.VisibilityPayload.allCases.map(\.rawValue)), "private"),
        "primaryLocale": (Set(Components.Schemas.Me.PrimaryLocalePayload.allCases.map(\.rawValue)), "en"),
        // Today's picks: unknown is "not final" — the app asks again later.
        "status": (Set(Components.Schemas.RecommendedFeed.StatusPayload.allCases.map(\.rawValue)), "stale"),
        // An error's code: one this build can't act on is an error all the same (its message still shows).
        "code": (Set(Components.Schemas.ErrorCode.allCases.map(\.rawValue)), "internal"),
    ]

    /// The answer with every unknown enum value replaced; untouched when there is none (or it isn't JSON).
    static func normalize(_ data: Data) -> Data {
        guard let root = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else { return data }
        var changed = false
        let fixed = normalize(root, changed: &changed)
        guard changed, let out = try? JSONSerialization.data(withJSONObject: fixed, options: [.fragmentsAllowed]) else { return data }
        return out
    }

    private static func normalize(_ value: Any, changed: inout Bool) -> Any {
        if var object = value as? [String: Any] {
            for (key, child) in object {
                if let field = fields[key], let string = child as? String {
                    if !field.known.contains(string) {
                        object[key] = field.fallback
                        changed = true
                    }
                } else if child is [String: Any] || child is [Any] {
                    object[key] = normalize(child, changed: &changed)
                }
            }
            return object
        }
        if let array = value as? [Any] {
            return array.map { normalize($0, changed: &changed) }
        }
        return value
    }
}
