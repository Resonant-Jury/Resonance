import Foundation
import Testing
@testable import ResonanceKit

/// Messenger's stacking: who sits in a run with whom, and where the labels fall (the same cases
/// as Android's ThreadRowsTest).
@Suite struct ThreadRowsTests {
    var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Taipei")!
        return calendar
    }

    func at(_ day: Int, _ h: Int, _ m: Int, _ s: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: h, minute: m, second: s))!
    }

    func msg(_ id: String, _ sender: String, _ time: Date, _ delivery: Delivery = .delivered, replyTo: ReplyQuote? = nil) -> ChatMessage {
        ChatMessage(id: id, senderId: sender, text: id, sentAt: time, replyTo: replyTo, delivery: delivery)
    }

    func rows(_ messages: ChatMessage...) -> [ThreadRow] { ThreadRows.build(messages, calendar: calendar) }

    @Test func messagesFromOnePersonSentCloseTogetherStackIntoARun() {
        let r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 1)), msg("c", "bob", at(1, 9, 2)), msg("d", "bob", at(1, 9, 3, 30)))
        #expect(r.map(\.position) == [.first, .middle, .middle, .last])
        #expect(r.map(\.joinsAbove) == [false, true, true, true])
        #expect(r.map(\.position.endsRun) == [false, false, false, true])
        #expect(r.map(\.id) == ["a", "b", "c", "d"])
    }

    @Test func aLoneMessageIsRoundOnAllCorners() {
        #expect(rows(msg("a", "bob", at(1, 9, 0))).map(\.position) == [.single])
        #expect(RunPosition.single.endsRun && !RunPosition.single.joinsAbove && !RunPosition.single.joinsBelow)
    }

    @Test func anotherSenderEndsTheRun() {
        let r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 1)), msg("c", "alice", at(1, 9, 1, 20)), msg("d", "bob", at(1, 9, 2)))
        #expect(r.map(\.position) == [.first, .last, .single, .single])
    }

    @Test func threeMinutesApartDoNotStack() {
        let r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 2, 59)), msg("c", "bob", at(1, 9, 5, 59)))
        // 2:59 apart stacks; the third is 3:00 after the second, so it starts a run of its own.
        #expect(r.map(\.position) == [.first, .last, .single])
        #expect(r.map(\.timeLabel) == [false, false, false])
    }

    @Test func aQuarterOfAnHourGetsATimeLabelAndABreak() {
        let r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 14, 59)), msg("c", "bob", at(1, 9, 30)))
        #expect(r.map(\.timeLabel) == [false, false, true])
        #expect(r.map(\.position) == [.single, .single, .single])
    }

    @Test func aLabelBreaksARunEvenForTheSameSender() {
        // Fifteen minutes on is a label (and not a run, which is three).
        let r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 15)))
        #expect(r.map(\.timeLabel) == [false, true])
        #expect(r[1].position == .single)
    }

    @Test func theFirstMessageOfADayCarriesTheDayLabelNotATimeLabel() {
        let r = rows(msg("a", "bob", at(1, 23, 59)), msg("b", "bob", at(2, 0, 0, 20)), msg("c", "bob", at(2, 0, 1)))
        #expect(r.map(\.dayLabel) == [true, true, false])
        #expect(r.map(\.timeLabel) == [false, false, false])
        // Midnight splits the run: 20 seconds apart, but not on the same day.
        #expect(r.map(\.position) == [.single, .first, .last])
    }

    @Test func aMessageThatFailedEndsItsRun() {
        let r = rows(msg("a", "alice", at(1, 9, 0)), msg("b", "alice", at(1, 9, 0, 30), .failed), msg("c", "alice", at(1, 9, 1)))
        #expect(r.map(\.position) == [.first, .last, .single])
    }

    @Test func aReplyOpensARunOfItsOwnAndTheMessagesAfterItStackUnderIt() {
        let quote = ReplyQuote(id: "q", senderId: "alice", text: "hi")
        let r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 0, 20), replyTo: quote), msg("c", "bob", at(1, 9, 0, 40)))
        #expect(r.map(\.position) == [.single, .first, .last])
    }

    @Test func aSendingMessageStacksUnderTheOneBeforeItEvenWithAClockABitBehind() {
        let r = rows(msg("a", "alice", at(1, 9, 0, 10)), msg("b", "alice", at(1, 9, 0, 5), .sending))
        #expect(r.map(\.position) == [.first, .last])
    }

    @Test func nothingYieldsNothing() {
        #expect(ThreadRows.build([], calendar: calendar).isEmpty)
    }
}
