import Foundation

/// What a thread draws: the conversation's `MessageHistory` (oldest first), then this person's
/// own messages still on their way (`Outbox.Outgoing`, in the order they were written). The twin
/// of Android's `ThreadMessages`.
///
/// A message sent from here is drawn the moment it is sent, under a `ChatMessage.key` — its
/// client id — that the document keeps when it arrives, so the row is replaced in place instead
/// of jumping: the server makes the client id the document's id, and where an older server gave
/// the document another id, the answer to the send (`Outgoing.serverId`) tells which document is
/// whose and the key is carried over to it from then on.
public struct ThreadMessages {
    /// Document id → the key it is drawn under, for the messages sent from here whose document has an id of its own.
    private var keys: [String: String] = [:]

    public init() {}

    /// The thread's messages: all of `history`, then the ones of `onItsWay` whose document isn't in it yet.
    public mutating func build<Cursor>(_ history: MessageHistory<Cursor>, onItsWay: [Outbox.Outgoing]) -> [ChatMessage] {
        for m in onItsWay {
            if let id = m.serverId, id != m.clientId { keys[id] = m.clientId }
        }
        let held = history.messages
        let delivered = keys.isEmpty ? held : held.map { m in
            guard let key = keys[m.id] else { return m }
            var keyed = m
            keyed.key = key
            return keyed
        }
        let pending = onItsWay.filter { !$0.isIn(history) }.map(\.message)
        return pending.isEmpty ? delivered : delivered + pending
    }

    /// The conversation is gone or started afresh: nothing is carried over.
    public mutating func clear() {
        keys = [:]
    }
}
