import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Quieter thread captions: no line over a reply's quote or a note's card any more (who answered
/// whom goes without saying one to one) — its words are only read out by VoiceOver, before the
/// quote — and a run that leads with a quote or a note's card stands further off the run above.
@MainActor @Suite struct ThreadCaptionsTests {
    let at = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func whatVoiceOverHearsBeforeAReplysQuoteOrANotesCard() {
        #expect(ThreadCaptions.reply(mine: false, quotedMine: true, handle: "ana") == L10n.Messages.repliedToYou(handle: "ana"))
        #expect(ThreadCaptions.reply(mine: true, quotedMine: false, handle: "ana") == L10n.Messages.youRepliedTo(handle: "ana"))
        #expect(ThreadCaptions.reply(mine: true, quotedMine: true, handle: "ana") == L10n.Messages.youRepliedToYourself)
        #expect(ThreadCaptions.reply(mine: false, quotedMine: false, handle: "ana") == L10n.Messages.repliedToThemselves(handle: "ana"))
        #expect(ThreadCaptions.note(mine: false, handle: "ana") == L10n.Messages.noteOnYourCard(handle: "ana"))
        #expect(ThreadCaptions.note(mine: true, handle: "ana") == L10n.Messages.youLeftNote(handle: "ana"))
    }

    @Test func aRunLeadingWithAQuoteStandsFurtherOff() {
        let quote = ReplyQuote(id: "m1", senderId: "ana", text: "早安")
        let rows = ThreadRows.build([
            ChatMessage(id: "m1", senderId: "ana", text: "早安", sentAt: at),
            ChatMessage(id: "m2", senderId: "ana", text: "今天下雨", sentAt: at.addingTimeInterval(10)),
            ChatMessage(id: "m3", senderId: "ben", text: "是啊", sentAt: at.addingTimeInterval(20)),
            ChatMessage(id: "m4", senderId: "ben", text: "帶傘了嗎", sentAt: at.addingTimeInterval(30), replyTo: quote),
            ChatMessage(id: "m5", senderId: "ana", text: "謝謝你的卡片", sentAt: at.addingTimeInterval(40), isNote: true),
        ])
        #expect(rows.map(ThreadRowView.gap(above:)) == [0, 2, 12, 18, 18])
    }
}
