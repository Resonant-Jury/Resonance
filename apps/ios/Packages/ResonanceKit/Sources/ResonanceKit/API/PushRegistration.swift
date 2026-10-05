import Foundation

/// What this install last told the server about its pushes — whose they are,
/// the token, the language they are written in, the app's version and the
/// phone's time zone — so a
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
    /// `TimeZone.current.identifier` (travel, or a change in the system's settings, sends it again).
    public let timeZone: String

    public init(installationId: String, uid: String, token: String, language: String, version: String, timeZone: String) {
        self.installationId = installationId
        self.uid = uid
        self.token = token
        self.language = language
        self.version = version
        self.timeZone = timeZone
    }

    private static let separator = "\n"

    /// As kept on the device, with when it was sent.
    public func encode(sentAt: Date) -> String {
        [installationId, uid, token, language, version, timeZone, String(sentAt.timeIntervalSince1970)].joined(separator: Self.separator)
    }

    /// Whether `wanted` was sent (as `kept` says) recently enough not to send it again. What a
    /// build before the time zone kept (one field fewer) is sent again, time zone and all.
    public static func isFresh(_ kept: String?, _ wanted: PushRegistration, now: Date) -> Bool {
        guard let parts = kept?.components(separatedBy: separator), parts.count == 7,
              let seconds = TimeInterval(parts[6]) else { return false }
        let sent = PushRegistration(installationId: parts[0], uid: parts[1], token: parts[2], language: parts[3], version: parts[4],
                                    timeZone: parts[5])
        let age = now.timeIntervalSince(Date(timeIntervalSince1970: seconds))
        // A clock set back counts as stale too.
        return sent == wanted && age >= 0 && age < ttl
    }
}
