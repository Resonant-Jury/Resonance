import Foundation
import ResonanceAPI

/// This install's push registration (PUT/DELETE /api/v1/me/devices/{id}):
/// its FCM token and the app's language, which the server writes pushes in.
/// The install id is the app's own, so signing in as someone else on the
/// same phone moves the device to them.
public struct PushAPI: Sendable {
    let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func register(installationId: String, token: String, language: Strings.Language, appVersion: String?) async throws {
        let body = Components.Schemas.RegisterDeviceRequest(token: token, platform: .ios, locale: language.rawValue, appVersion: appVersion)
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
