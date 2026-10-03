import Foundation
import Testing
@testable import ResonanceKit

/// What a bubble carries besides its words: the card a message shares once it is read (its
/// stand-in before), else its link's preview, else its words — and a card the reader can't see
/// falls back to the link it was, or to nothing.
@Suite struct CarriedTests {
    let at = Date(timeIntervalSince1970: 1)
    let preview = ChatLinks.parse("https://resonance.channel/card/a-walk").map { LinkPreview(link: $0, title: "A walk") }

    func message(_ text: String, cardRef: String? = nil, preview: LinkPreview? = nil, note: Bool = false) -> ChatMessage {
        ChatMessage(id: "m1", senderId: "bob", text: text, sentAt: at, cardRef: cardRef,
                    noteRef: note ? MessagingAPI.NoteRef(cardId: "c9", noteId: "n1") : nil, preview: preview)
    }

    func carried(_ m: ChatMessage, _ lookup: CardLookup<String>) -> Carried<String> {
        Carried.of(m, share: m.cardShare(), lookup: { _ in lookup })
    }

    @Test func aCardReadIsTheCardAndALinkToItShowsTheWordsAroundIt() throws {
        let linked = message("看看這篇 https://resonance.channel/card/a-walk", preview: preview)
        let share = try #require(linked.cardShare())
        #expect(carried(linked, .found("card")) == .card("card", share))
        #expect(carried(linked, .found("card")).words(of: linked) == "看看這篇")
        let alone = message("https://resonance.channel/card/a-walk", preview: preview)
        #expect(carried(alone, .found("card")).words(of: alone).isEmpty)
        // A card shared with the button keeps all its words.
        let button = message("read this", cardRef: "c1")
        #expect(carried(button, .found("card")).words(of: button) == "read this")
    }

    @Test func aCardOnItsWayIsItsStandIn() {
        let linked = message("https://resonance.channel/card/a-walk", preview: preview)
        #expect(carried(linked, .loading).isCard)
        #expect(carried(message("", cardRef: "c1"), .loading).isCard)
    }

    @Test func aCardTheReaderCantSeeFallsBackToItsLinkOrToNothing() {
        let linked = message("看看這篇 https://resonance.channel/card/a-walk", preview: preview)
        #expect(carried(linked, .hidden) == .preview(preview!))
        #expect(carried(linked, .hidden).words(of: linked) == linked.text)
        #expect(carried(message("看看這篇 https://resonance.channel/card/a-walk"), .hidden) == .words)
        #expect(carried(message("", cardRef: "c1"), .hidden) == .nothing)
        #expect(carried(message("still here", cardRef: "c1"), .hidden) == .words)
    }

    @Test func aCardNotReadWaitsWhenItWasSentWithTheButtonAndIsALinkOtherwise() {
        #expect(carried(message("", cardRef: "c1"), .failed).isCard)
        let linked = message("https://resonance.channel/card/a-walk", preview: preview)
        #expect(carried(linked, .failed) == .preview(preview!))
    }

    @Test func otherMessagesCarryTheirPreviewOrTheirWords() {
        let other = ChatLinks.parse("https://example.com/a").map { LinkPreview(link: $0, title: "A") }
        #expect(carried(message("see https://example.com/a", preview: other), .loading) == .preview(other!))
        #expect(carried(message("hello"), .loading) == .words)
        #expect(carried(message("", note: true), .loading) == .words)
        #expect(carried(message(""), .loading) == .nothing)
    }
}
