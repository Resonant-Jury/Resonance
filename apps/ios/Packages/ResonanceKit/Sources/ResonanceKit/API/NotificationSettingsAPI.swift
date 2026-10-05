import Foundation
import ResonanceAPI

/// The pushes an account asked for beyond the ones answering it (GET/PATCH
/// /api/v1/me/notifications): "a card for tonight" (`picks`) and new cards
/// from the people it is connected with (`connectionCards`). Both are off
/// until turned on; the server keeps the choice, so it follows the account to
/// every device. Whether this phone may show them is the system's to say —
/// ask for that before turning one on.
public struct NotificationSettingsAPI: Sendable {
    public typealias Settings = Components.Schemas.NotificationSettings

    /// One switch, as the contract names it.
    public enum Switch: String, CaseIterable, Sendable {
        case picks, connectionCards
    }

    let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func settings() async throws -> Settings {
        switch try await client.getNotificationSettings() {
        case let .ok(r): return try r.body.json
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Turns one switch on or off and leaves the other as it is (it isn't sent).
    /// Answers both as the server has them now.
    public func set(_ name: Switch, _ on: Bool) async throws -> Settings {
        let body = switch name {
        case .picks: Components.Schemas.UpdateNotificationSettingsRequest(picks: on)
        case .connectionCards: Components.Schemas.UpdateNotificationSettingsRequest(connectionCards: on)
        }
        switch try await client.updateNotificationSettings(body: .json(body)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}

extension Components.Schemas.NotificationSettings {
    public subscript(_ name: NotificationSettingsAPI.Switch) -> Bool {
        get {
            switch name {
            case .picks: picks
            case .connectionCards: connectionCards
            }
        }
        set {
            switch name {
            case .picks: picks = newValue
            case .connectionCards: connectionCards = newValue
            }
        }
    }
}
