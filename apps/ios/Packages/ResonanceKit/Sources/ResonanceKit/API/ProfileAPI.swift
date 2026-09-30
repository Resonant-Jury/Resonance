import Foundation
import ResonanceAPI

/// The signed-in account's own profile (GET/POST/PATCH /api/v1/me) and the
/// pen-name check beside it (GET /api/v1/handles/{handle}).
public struct ProfileAPI: Sendable {
    let client: Client

    public init(client: Client) {
        self.client = client
    }

    /// The account's profile, or nil when it has none yet. Only the contract's
    /// own answer for that (404 `not_found`) comes back as nil: being offline,
    /// a server error or a proxy's page throws, so a flaky network never reads
    /// as a new account.
    public func me() async throws -> Components.Schemas.Me? {
        switch try await client.getMe() {
        case let .ok(r): return try r.body.json
        case let .notFound(r):
            let failure = APIFailure(try r.body.json, status: 404)
            guard failure.isNotFound else { throw failure }
            return nil
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Onboarding (the web's signup profile step). Idempotent: an account that
    /// already has a profile gets it back unchanged. A pen name someone took in
    /// the meantime throws `conflict`.
    public func create(handle: String, region: String, language: Strings.Language) async throws -> Components.Schemas.Me {
        let locale: Components.Schemas.CreateProfileRequest.PrimaryLocalePayload = switch language {
        case .en: .en
        case .zhTW: .zhTW
        }
        let body = Components.Schemas.CreateProfileRequest(handle: handle, region: region, primaryLocale: locale)
        switch try await client.createProfile(body: .json(body)) {
        case let .created(r): return try r.body.json
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Settings: only the fields passed change (nil leaves one as it is; an
    /// empty bio clears it). A pen name someone else holds throws `conflict`.
    public func update(handle: String? = nil, bio: String? = nil, region: String? = nil) async throws -> Components.Schemas.Me {
        let body = Components.Schemas.UpdateProfileRequest(handle: handle, bio: bio, region: region)
        switch try await client.updateProfile(body: .json(body)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Whether a pen name is free (the account's own counts as free).
    public func isAvailable(_ handle: String) async throws -> Bool {
        switch try await client.getHandleAvailability(path: .init(handle: handle)) {
        case let .ok(r): return try r.body.json.available
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}

/// A pen name as the contract takes it (`Handle` in schemas.ts): trimmed,
/// 2–20 characters of any script, but never `/ ? # \` or a control character
/// — it is the /u/{handle} path segment. Lengths count UTF-16 units, as the
/// server's (JavaScript) check does.
public enum PenName {
    public static let minLength = 2
    public static let maxLength = 20
    /// The one-line bio's limit (BIO_MAX).
    public static let bioMax = 80

    /// What the server stores: the name without the whitespace around it.
    public static func normalized(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public static func isValid(_ text: String) -> Bool {
        let name = normalized(text)
        return (minLength...maxLength).contains(name.utf16.count) && name.unicodeScalars.allSatisfy(isAllowed)
    }

    /// The field as typed: the characters a pen name can't hold never land,
    /// and typing stops at the limit (the web's `slice(0, 20)`).
    public static func sanitized(_ text: String) -> String {
        var scalars = String.UnicodeScalarView()
        scalars.append(contentsOf: text.unicodeScalars.filter(isAllowed))
        return String(scalars).prefix(utf16Units: maxLength)
    }

    private static let forbidden: Set<Unicode.Scalar> = ["/", "?", "#", "\\"]

    private static func isAllowed(_ scalar: Unicode.Scalar) -> Bool {
        !forbidden.contains(scalar) && scalar.properties.generalCategory != .control
    }
}

extension String {
    /// The leading characters that fit in `limit` UTF-16 units (what a
    /// JavaScript `max(n)` counts), never splitting a character.
    public func prefix(utf16Units limit: Int) -> String {
        guard utf16.count > limit else { return self }
        var out = ""
        var used = 0
        for character in self {
            used += character.utf16.count
            if used > limit { break }
            out.append(character)
        }
        return out
    }
}
