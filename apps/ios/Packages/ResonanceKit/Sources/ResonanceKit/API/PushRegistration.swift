import Foundation

/// What this install last told the server about its pushes — whose they are,
/// the token, the language they are written in and the app's version — so a
/// launch doesn't send the same registration every time. It goes again when
/// any of it changes, and at least once a `ttl` (the server may have dropped
/// the device meanwhile: a token FCM refused, another account signed in on
/// this install elsewhere). Signing out forgets it. The twin of Android's
/// PushRegistration.
public struct PushRegistration: Equatable, Sendable {
    public static let ttl: TimeInterval = 24 * 60 * 60

    public let installationId: String
    public let uid: String
    public let token: String
    public let language: String
    public let version: String

    public init(installationId: String, uid: String, token: String, language: String, version: String) {
        self.installationId = installationId
        self.uid = uid
        self.token = token
        self.language = language
        self.version = version
    }

    private static let separator = "\n"

    /// As kept on the device, with when it was sent.
    public func encode(sentAt: Date) -> String {
        [installationId, uid, token, language, version, String(sentAt.timeIntervalSince1970)].joined(separator: Self.separator)
    }

    /// Whether `wanted` was sent (as `kept` says) recently enough not to send it again.
    public static func isFresh(_ kept: String?, _ wanted: PushRegistration, now: Date) -> Bool {
        guard let parts = kept?.components(separatedBy: separator), parts.count == 6,
              let seconds = TimeInterval(parts[5]) else { return false }
        let sent = PushRegistration(installationId: parts[0], uid: parts[1], token: parts[2], language: parts[3], version: parts[4])
        let age = now.timeIntervalSince(Date(timeIntervalSince1970: seconds))
        // A clock set back counts as stale too.
        return sent == wanted && age >= 0 && age < ttl
    }
}
