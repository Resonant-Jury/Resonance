import Foundation
import ResonanceAPI

/// This install's push registration (PUT/DELETE /api/v1/me/devices/{id}):
/// its FCM token, the app's language, which the server writes pushes in, and
/// the phone's time zone (an IANA name; the server keeps it when it knows the
/// name, so a push can one day come at the reader's own evening). The
/// contract takes at most `timeZoneMax` characters, so a longer one (none is)
/// goes as none rather than having the whole registration refused — as
/// Android's PushApi does.
/// The install id is the app's own, so signing in as someone else on the
/// same phone moves the device to them.
public struct PushAPI: Sendable {
    let client: Client

    /// RegisterDeviceRequest.timeZone's limit in the contract.
    public static let timeZoneMax = 64

    public init(client: Client) {
        self.client = client
    }

    /// The time zone as the contract takes it: none when empty or longer than `timeZoneMax`
    /// (counted as the server counts, in UTF-16 units).
    static func sendable(timeZone: String?) -> String? {
        guard let timeZone, !timeZone.isEmpty, timeZone.utf16.count <= timeZoneMax else { return nil }
        return timeZone
    }

    public func register(installationId: String, token: String, language: Strings.Language, appVersion: String?,
                         timeZone: String?) async throws {
        let body = Components.Schemas.RegisterDeviceRequest(token: token, platform: .ios, locale: language.rawValue, appVersion: appVersion,
                                                            timeZone: Self.sendable(timeZone: timeZone))
        switch try await client.registerDevice(path: .init(installationId: installationId), body: .json(body)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public func unregister(installationId: String) async throws {
        switch try await client.unregisterDevice(path: .init(installationId: installationId)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}
