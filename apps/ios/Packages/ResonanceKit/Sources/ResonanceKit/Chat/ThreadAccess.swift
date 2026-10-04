import Foundation

/// What the foot of a conversation offers, the composer or a word in its place — decided by
/// whether the two are connected and by the letter waiting in the conversation, if any.
///
/// A note left on a card is a letter: it connects no one, the card's author answering it does.
/// While one waits, the conversation keeps `request: { from, cardId, at, count }` (the server's
/// alone); once the author's reply connects the two, it is gone. Only that answer clears it: two
/// people connected some other way (a resonance) can still have one waiting, and while they are
/// connected it is ignored — it applies again if a take-back ends the connection. Whether they are
/// connected is still the connection itself (the profile's `isConnected`).
public enum ThreadAccess: Equatable, Sendable {
    /// Connected (or not known yet: the composer shows meanwhile): write as usual.
    case open
    /// Not connected, and the letter waiting is this person's: their note has gone, the answer is
    /// the other person's to give — a calm line where the composer was.
    case awaitingReply
    /// Not connected, and the letter waiting is theirs: the composer, with a quiet line above it —
    /// the first message sent connects the two.
    case replyToConnect
    /// Not connected, no letter: nothing to write here.
    case notConnected

    /// `connected` is nil until known; `blocked`: either of them blocked the other (nothing
    /// reaches across a block, a letter neither); `requestFrom` is the letter's writer (`request.from`
    /// of the conversation) — nil when none waits or the conversation hasn't been read yet.
    public static func of(connected: Bool?, blocked: Bool, requestFrom: String?, me: String?) -> ThreadAccess {
        guard connected == false else { return .open }
        guard !blocked, let requestFrom, let me, !requestFrom.isEmpty else { return .notConnected }
        return requestFrom == me ? .awaitingReply : .replyToConnect
    }

    /// The writer of the letter waiting in a conversation document's fields (`request.from`), if any.
    public static func requestFrom(_ conversation: [String: Any]?) -> String? {
        guard let request = conversation?["request"] as? [String: Any], let from = request["from"] as? String, !from.isEmpty
        else { return nil }
        return from
    }

    /// The composer is there to write in (with or without the line above it).
    public var canWrite: Bool { self == .open || self == .replyToConnect }
}
