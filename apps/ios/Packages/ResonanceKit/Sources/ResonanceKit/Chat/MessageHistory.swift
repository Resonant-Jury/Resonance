import Foundation

/// How much of a conversation the thread reads at a time.
public enum ChatPaging {
    /// The live window: the newest messages a listener keeps current.
    public static let liveLimit = 50
    /// The page read when the thread is scrolled up to its oldest message.
    public static let olderPage = 50
    /// The page read while looking for a message a quote or a search result points at.
    public static let jumpPage = 100
    /// The page read while reading the whole conversation for a search.
    public static let allPage = 200
    /// At most this many messages are read for a search.
    public static let loadAllCap = 5000
}

/// Every message of a conversation the thread has so far, oldest first (by send time, then id).
/// The twin of Android's `MessageHistory`.
///
/// Two things feed it: the live window — the newest `liveLimit` messages, which a listener keeps
/// current — and older pages read one at a time. The window only ever adds to what is held: a
/// message that slides out of it (a newer one pushed it past the limit) stays, so the thread
/// keeps what the person has scrolled through. `Cursor` is whatever the next older page starts
/// after (a Firestore document snapshot); the history only remembers the one that belongs to its
/// oldest message.
public struct MessageHistory<Cursor> {
    /// A message with the cursor that starts the page before it.
    public struct Entry {
        public let message: ChatMessage
        public let cursor: Cursor

        public init(_ message: ChatMessage, cursor: Cursor) {
            self.message = message
            self.cursor = cursor
        }
    }

    /// What a window changed.
    public enum Merged: Equatable, Sendable {
        case unchanged
        case changed
        /// The window shared nothing with what was held (the listener was away long enough for the
        /// thread to move on past it): the history started afresh from it.
        case restarted
    }

    public let liveLimit: Int
    private var byId: [String: ChatMessage] = [:]
    private var oldest: ChatMessage?
    /// Whether an older page has been read since the history was last started afresh.
    private var paged = false

    /// All messages held, oldest first.
    public private(set) var messages: [ChatMessage] = []

    /// Where the page before the oldest message held starts; nil while the history is empty.
    public private(set) var oldestCursor: Cursor?

    /// Whether there may be messages older than the oldest held. True while that isn't known
    /// (only a cached window has arrived); false once a window shorter than the limit came from
    /// the server (it holds the whole conversation) or a page came back short.
    public private(set) var hasOlder = false

    public init(liveLimit: Int = ChatPaging.liveLimit) {
        self.liveLimit = liveLimit
    }

    public var count: Int { byId.count }
    public var isEmpty: Bool { byId.isEmpty }
    public func contains(_ id: String) -> Bool { byId[id] != nil }
    public subscript(id: String) -> ChatMessage? { byId[id] }

    /// The live window arrived (in any order). `authoritative`: it came from the server, so a
    /// window shorter than the limit is the whole conversation; a cached one may be only a part of it.
    @discardableResult
    public mutating func mergeWindow(_ window: [Entry], authoritative: Bool = true) -> Merged {
        var restarted = false
        if !byId.isEmpty, !window.contains(where: { byId[$0.message.id] != nil }) {
            clear()
            restarted = true
        }
        let changed = upsert(window)
        if !paged { hasOlder = window.count >= liveLimit || !authoritative }
        return restarted ? .restarted : changed ? .changed : .unchanged
    }

    /// An older page of at most `limit` messages arrived: a shorter one was the last. Returns
    /// whether anything new came in.
    @discardableResult
    public mutating func mergePage(_ page: [Entry], limit: Int) -> Bool {
        paged = true
        hasOlder = page.count >= limit
        return upsert(page)
    }

    /// Forgets everything (the conversation is gone, or the listener lost track of it).
    public mutating func clear() {
        byId = [:]
        messages = []
        oldest = nil
        oldestCursor = nil
        hasOlder = false
        paged = false
    }

    private mutating func upsert(_ entries: [Entry]) -> Bool {
        var changed = false
        for entry in entries {
            let message = entry.message
            if byId.updateValue(message, forKey: message.id) != message { changed = true }
            // The oldest message's cursor is refreshed when its document comes again (an updated snapshot).
            if let current = oldest, current.id != message.id, !ChatMessage.isOrderedBefore(message, current) { continue }
            oldest = message
            oldestCursor = entry.cursor
        }
        if changed { messages = byId.values.sorted(by: ChatMessage.isOrderedBefore) }
        return changed
    }
}
