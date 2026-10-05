import ResonanceKit
import Testing
@testable import Resonance

/// Which of my cards the resonate picker offers (the web's `resonateChoices`): published public
/// cards that answer no card yet — never the card being answered, nor the card it answers — and
/// how many were left out for answering another card (the picker says why they are missing).
@MainActor @Suite struct ResonateChoicesTests {
    func card(_ id: String, visibility: FeedCard.VisibilityPayload = ._public, published: Bool = true,
              answering: String? = nil, anonymous: Bool = false) -> FeedCard {
        var card = Fixture.card(id, anonymous: anonymous, by: "alice")
        card.visibility = visibility
        if !published { card.publishedAt = nil }
        card.referenceCardId = answering
        return card
    }

    @Test func onlyPublishedPublicCardsAnsweringNothingAreOffered() {
        let mine = [
            card("walk"),
            card("diary", visibility: ._private),
            card("friends", visibility: .connections),
            card("draft", published: false),
            card("night", anonymous: true),
        ]
        let choices = ResonateChoices.of(mine, target: "target", targetReference: nil)
        // An anonymous public card resonates too (without a bell): it is listed, marked.
        #expect(choices.cards.map(\.id) == ["walk", "night"])
        #expect(choices.hidden == 0)
    }

    @Test func aCardAnsweringAnotherIsLeftOutAndCounted() {
        let mine = [card("walk"), card("reply", answering: "elsewhere"), card("other-reply", answering: "else")]
        let choices = ResonateChoices.of(mine, target: "target", targetReference: nil)
        #expect(choices.cards.map(\.id) == ["walk"])
        #expect(choices.hidden == 2)
    }

    @Test func theTargetAndWhatItAnswersAreNeverOffered() {
        // My own card answering mine back would be a circle; one already answering this card isn't "another".
        let mine = [card("target"), card("original"), card("already", answering: "target"), card("walk")]
        let choices = ResonateChoices.of(mine, target: "target", targetReference: "original")
        #expect(choices.cards.map(\.id) == ["walk"])
        #expect(choices.hidden == 0)
    }

    @Test func noPublicCardsAtAllIsTheOnlyNoPublicCardsYet() {
        let none = ResonateChoices.of([card("diary", visibility: ._private), card("draft", published: false)],
                                      target: "target", targetReference: nil)
        #expect(none.emptyNote == L10n.Card.ResonatePicker.empty)
        #expect(none.footnote == nil)
        #expect(!none.nothingToPick)
    }

    // Their public cards are there, only none may answer this one: never "no public cards yet".
    @Test func everyPublicCardAnsweringAnotherSaysWhyNoneIsListedOnce() {
        let answering = ResonateChoices.of([card("reply", answering: "someone-elses")], target: "target", targetReference: nil)
        #expect(answering.cards.isEmpty)
        #expect(answering.emptyNote == L10n.Card.ResonatePicker.hiddenNote)
        // Said once, in the list's place — not again under it.
        #expect(answering.footnote == nil)
        #expect(!answering.nothingToPick)
        // Beside cards that are listed, it is the line under them.
        let some = ResonateChoices.of([card("walk"), card("reply", answering: "someone-elses")], target: "target", targetReference: nil)
        #expect(some.emptyNote == nil)
        #expect(some.footnote == L10n.Card.ResonatePicker.hiddenNote)
    }

    // Nothing to pick and nothing to say: no heading over an empty list, only the way to write one.
    @Test func theOnlyPublicCardBeingTheOneThisAnswersSaysNothing() {
        let origin = ResonateChoices.of([card("origin")], target: "target", targetReference: "origin")
        #expect(origin.cards.isEmpty)
        #expect(origin.nothingToPick)
        #expect(origin.emptyNote == nil)
        #expect(origin.footnote == nil)
        // A card listed: the heading and the list, as ever.
        #expect(!ResonateChoices.of([card("origin"), card("walk")], target: "target", targetReference: "origin").nothingToPick)
    }
}
