import Foundation

/// Where a message sits in a run of messages from one person: it picks the corners the bubble tucks.
public enum RunPosition: Equatable, Sendable {
    /// Alone: all four corners round.
    case single
    /// The first of a run: the corner facing the next message is tucked.
    case first
    /// In the middle: both corners facing a neighbour are tucked.
    case middle
    /// The last of a run: the corner facing the one before is tucked.
    case last

    /// A neighbour above it in the run: the corner on the sender's side, top, is tucked.
    public var joinsAbove: Bool { self == .middle || self == .last }
    /// A neighbour below it in the run: the corner on the sender's side, bottom, is tucked.
    public var joinsBelow: Bool { self == .first || self == .middle }
    /// The last bubble of a run (or a lone one): the other person's avatar sits beside it.
    public var endsRun: Bool { self == .single || self == .last }
}

/// One message of the thread with what the list needs around it: its place in a run
/// (Messenger's stacking), and the labels that lead it.
///
/// `dayLabel` leads the first message of a day. `timeLabel` leads a message that comes
/// `ThreadRows.timeLabelGap` or more after the one before it on the same day. A label is a break:
/// nothing stacks across one.
public struct ThreadRow: Identifiable, Equatable, Sendable {
    public let message: ChatMessage
    public let position: RunPosition
    public let dayLabel: Bool
    public let timeLabel: Bool

    public init(message: ChatMessage, position: RunPosition, dayLabel: Bool, timeLabel: Bool) {
        self.message = message
        self.position = position
        self.dayLabel = dayLabel
        self.timeLabel = timeLabel
    }

    /// The row's identity in a list: the message's key (a message sent from here keeps its row when the document replaces it).
    public var id: String { message.key }
    /// It stacks under the message before it (a tight gap instead of the one between runs).
    public var joinsAbove: Bool { position.joinsAbove }
}

/// Lays the thread out in runs, the way Messenger stacks messages sent close together:
/// consecutive messages from the same sender, less than `runGap` apart on the same day, with no
/// label between them, are one run; a reply opens a run (it leads with the quote it answers) and a
/// message that failed to send ends the run it is in (its "not sent" line sits under it). Pure;
/// the twin of Android's `ThreadRows`.
public enum ThreadRows {
    /// Messages further apart than this don't stack.
    public static let runGap: TimeInterval = 3 * 60
    /// A message this long after the one before it (on the same day) gets a time label.
    public static let timeLabelGap: TimeInterval = 15 * 60

    /// `messages` oldest first, as `ThreadMessages.build` returns them; days as `calendar` counts them.
    public static func build(_ messages: [ChatMessage], calendar: Calendar = .current) -> [ThreadRow] {
        guard !messages.isEmpty else { return [] }
        let days = messages.map { calendar.startOfDay(for: $0.sentAt) }
        let day = messages.indices.map { $0 == 0 || days[$0] != days[$0 - 1] }
        let time = messages.indices.map { i in
            i > 0 && !day[i] && messages[i].sentAt.timeIntervalSince(messages[i - 1].sentAt) >= timeLabelGap
        }
        let joins = messages.indices.map { i -> Bool in
            guard i > 0, !day[i], !time[i] else { return false }
            let m = messages[i], before = messages[i - 1]
            // A reply opens with the quote it answers: it starts a run of its own.
            return m.replyTo == nil && before.senderId == m.senderId && before.delivery != .failed
                // A message still on its way carries this phone's clock: a few seconds off the server's doesn't unstack it.
                && abs(m.sentAt.timeIntervalSince(before.sentAt)) < runGap
        }
        return messages.indices.map { i in
            let above = joins[i]
            let below = i + 1 < messages.count && joins[i + 1]
            let position: RunPosition = above && below ? .middle : above ? .last : below ? .first : .single
            return ThreadRow(message: messages[i], position: position, dayLabel: day[i], timeLabel: time[i])
        }
    }
}
