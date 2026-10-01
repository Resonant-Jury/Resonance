import CryptoKit
import Foundation
import ResonanceAPI

/// The last answers a cold start can draw before the network has said
/// anything: the latest feed's first page, today's picks, the account, the
/// card box's published shelf, and the block list to filter them with — kept
/// on disk for the signed-in account only.
///
/// Only ever a placeholder: each screen still asks the server, whose answer
/// replaces what was kept and is kept in its place. One account at a time:
/// the session keeps only the signed-in account's (`retainOnly`) and empties
/// it on sign-out and when account deletion is scheduled (`removeAll`); a
/// save that arrives for any other account is dropped. Today's picks never
/// outlive their UTC day, and nothing is drawn once it's `maxAge` old.
public final class APICache: Sendable {
    /// One thing kept, and the type it's kept as.
    public struct Key<Value: Codable & Sendable>: Sendable {
        let name: String
        /// Only good through the UTC day it was saved on.
        let daily: Bool
    }

    /// Older than this, a kept answer is no help on a cold start.
    public static let maxAge: TimeInterval = 7 * 24 * 60 * 60
    /// Bumped when what's kept changes shape: anything older is dropped.
    static let format = 1

    let root: URL
    private let now: @Sendable () -> Date
    /// Saves, removals and clears in the order they were asked for.
    private let queue = DispatchQueue(label: "resonance.api-cache")
    /// The account whose answers may be kept (nil: none).
    private nonisolated(unsafe) var account: String?

    public init(root: URL, now: @escaping @Sendable () -> Date = { Date() }) {
        self.root = root
        self.now = now
    }

    /// The app's: in Caches, which the system may empty when space runs low.
    public static func standard() -> APICache {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return APICache(root: caches.appending(path: "APICache", directoryHint: .isDirectory))
    }

    // MARK: - Reading and keeping

    /// What was kept for `uid`, if it's still good: the same account, the
    /// same format, not past `maxAge` and, for a daily key, today in UTC.
    public func value<Value>(_ key: Key<Value>, uid: String) -> Value? {
        queue.sync {
            let file = self.file(key.name, uid: uid)
            guard let data = try? Data(contentsOf: file) else { return nil }
            guard let kept = try? JSONDecoder().decode(Envelope<Value>.self, from: data), kept.format == Self.format,
                  kept.uid == uid, isGood(kept, daily: key.daily) else {
                try? FileManager.default.removeItem(at: file)
                return nil
            }
            return kept.value
        }
    }

    /// Keeps `value` for `uid` — unless `uid` is no longer the account being
    /// kept (an answer that came back after its account signed out).
    public func save<Value>(_ value: Value, as key: Key<Value>, uid: String) {
        let savedAt = now()
        queue.async {
            guard uid == self.account else { return }
            let envelope = Envelope(format: Self.format, uid: uid, savedAt: savedAt, day: Self.utcDay(savedAt), value: value)
            guard let data = try? JSONEncoder().encode(envelope) else { return }
            let file = self.file(key.name, uid: uid)
            try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: file, options: .atomic)
        }
    }

    public func remove<Value>(_ key: Key<Value>, uid: String) {
        queue.async { try? FileManager.default.removeItem(at: self.file(key.name, uid: uid)) }
    }

    // MARK: - Whose answers are kept

    /// `uid`'s answers are kept from now on; every other account's are
    /// deleted (nil: everyone's, as `removeAll`).
    public func retainOnly(_ uid: String?) {
        queue.sync {
            account = uid
            let keep = uid.map(Self.folder)
            let folders = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
            for folder in folders where folder != keep {
                try? FileManager.default.removeItem(at: root.appending(path: folder))
            }
        }
    }

    /// Nobody's answers are kept, and none are taken from now on.
    public func removeAll() {
        retainOnly(nil)
    }

    // MARK: - Internals

    private struct Envelope<Value: Codable>: Codable {
        let format: Int
        let uid: String
        let savedAt: Date
        /// The UTC day it was saved on (yyyy-MM-dd).
        let day: String
        let value: Value
    }

    private func isGood<Value>(_ kept: Envelope<Value>, daily: Bool) -> Bool {
        let now = now()
        let age = now.timeIntervalSince(kept.savedAt)
        guard age >= 0, age < Self.maxAge else { return false }
        return !daily || kept.day == Self.utcDay(now)
    }

    private func file(_ name: String, uid: String) -> URL {
        root.appending(path: Self.folder(uid), directoryHint: .isDirectory).appending(path: "\(name).json")
    }

    /// An account's folder: a digest of its uid, so no uid is ever a path.
    static func folder(_ uid: String) -> String {
        SHA256.hash(data: Data(uid.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined()
    }

    /// The day in UTC, which the server's daily picks follow.
    public static func utcDay(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

extension APICache.Key where Value == FeedPage {
    /// The latest feed's first page (GET /feed).
    public static var latest: Self { .init(name: "latest", daily: false) }
}

extension APICache.Key where Value == [FeedCard] {
    /// Today's picks (GET /feed/recommended): they change with the UTC day.
    public static var recommended: Self { .init(name: "recommended", daily: true) }
    /// The card box's published shelf (GET /me/cards?tab=published).
    public static var published: Self { .init(name: "published", daily: false) }
}

extension APICache.Key where Value == Components.Schemas.Me {
    /// The account (GET /me).
    public static var me: Self { .init(name: "me", daily: false) }
}

extension APICache.Key where Value == [String] {
    /// The people the account has blocked, to filter what's kept with before
    /// the live list has arrived.
    public static var blocked: Self { .init(name: "blocked", daily: false) }
}
