import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// The writer tells the screens behind it only what it wrote — a visit that
/// wrote nothing makes nobody read again — and names the card, so a page
/// showing another card, or the thought map, reads only what changed. The
/// map, kept between visits, reads everything again only once what it read
/// is old.
@MainActor @Suite struct WriterChangesTests {
    @Test func aVisitThatWroteNothingChangesNothing() {
        let writer = WriteLauncher()
        var told = 0
        writer.onChange = { told += 1 }
        writer.open()
        #expect(writer.requested == WriteLauncher.Request())
        writer.leave(nil)
        #expect(writer.changes == 0)
        #expect(told == 0)
        #expect(writer.lastChange == nil)
    }

    @Test func aVisitThatWroteNamesItsCard() {
        let writer = WriteLauncher()
        var told = 0
        writer.onChange = { told += 1 }
        writer.open(.init(referenceCardId: "original"))
        #expect(writer.requested?.referenceCardId == "original")
        writer.leave(.init(cardId: "draft-1", referenceCardId: "original"))
        #expect(writer.changes == 1)
        #expect(told == 1)
        #expect(writer.lastChange == .init(cardId: "draft-1", referenceCardId: "original"))

        // Published, revised or dropped: it counts as a change too.
        writer.leave(.init(cardId: "card-2"))
        #expect(writer.changes == 2)
        // A card's ⋯ (visibility, delete).
        writer.noteChange(.init(cardId: "card-3"))
        #expect(writer.changes == 3)
        #expect(writer.lastChange?.cardId == "card-3")
    }

    @Test func editingACardAsksForItsOwnWriterAndKeepsItsPageUnderneath() {
        let writer = WriteLauncher()
        writer.edit("card-1", showsCard: false)
        #expect(writer.requested == .init(cardId: "card-1", showsCard: false))
        // The route carries the request: one page per ask, equal asks alike.
        #expect(Route.write(.init(cardId: "card-1")) == Route.write(.init(cardId: "card-1")))
        #expect(Route.write(.init(cardId: "card-1")) != Route.write(.init(cardId: "card-2")))
    }

    @Test func aChangeConcernsItsCardAndTheCardItAnswers() {
        let change = WriteLauncher.Change(cardId: "reply", referenceCardId: "original")
        #expect(change.concerns("reply"))
        // A resonance to the page's card: its list of resonances may have changed.
        #expect(change.concerns("original"))
        #expect(!change.concerns("someone-else"))
        // A change that doesn't say which card concerns every page.
        #expect(WriteLauncher.Change().concerns("anything"))
    }

    @Test func theKeptMapReadsAgainOnlyWhatChangedUntilItIsOld() {
        let lastRead = Date(timeIntervalSince1970: 1_000_000)
        func refresh(loaded: Bool = true, readAt: Date? = lastRead, seen: Int = 4, changes: Int = 4,
                     last: WriteLauncher.Change? = nil, after: TimeInterval = 60) -> ThoughtMapStore.Refresh {
            ThoughtMapStore.refresh(loaded: loaded, readAt: readAt, seenChanges: seen, changes: changes,
                                    lastChange: last, now: lastRead.addingTimeInterval(after))
        }
        // Back within a while, nothing written: nothing read.
        #expect(refresh() == .nothing)
        // One card written since: that card, and the one it answers.
        #expect(refresh(changes: 5, last: .init(cardId: "reply", referenceCardId: "original")) == .cards(["reply", "original"]))
        // Several changes, or one that doesn't name its card: every card, the map kept.
        #expect(refresh(changes: 6, last: .init(cardId: "reply")) == .allCards)
        #expect(refresh(changes: 5, last: .init()) == .allCards)
        // Never read, or read too long ago (or a clock set back): everything.
        #expect(refresh(loaded: false) == .everything)
        #expect(refresh(readAt: nil) == .everything)
        #expect(refresh(after: ThoughtMapStore.staleAfter) == .everything)
        #expect(refresh(after: -1) == .everything)
    }
}

/// Going back from the writer asks only when there is writing to put away: a
/// draft with words, tags or a cover, or a published card's revision. A page
/// opened and left alone, or the first-card guide's question, is not writing.
@MainActor @Suite struct WriterLeavingTests {
    private func model(opened: DraftService.OpenedCard? = nil) -> WriteModel {
        let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
        return WriteModel(drafts: nil, writing: WritingAPI(client: ResonanceClient.make(configuration), configuration: configuration),
                          opened: opened)
    }

    private func card(published: Bool, pending: Bool = false, title: String = "A walk") -> DraftService.OpenedCard {
        .init(id: "card-1", values: DraftValues(title: title, story: "Out in the rain."), isPublished: published, slug: published ? "a-walk" : nil,
              referenceCardId: nil, hasPendingEdit: pending)
    }

    @Test func aNewCardAsksOnceAnythingIsOnIt() {
        let model = model()
        #expect(!model.holdsWriting)
        #expect(!model.needsSave)
        model.values.title = "  "
        #expect(!model.holdsWriting)
        model.values.title = "A walk"
        #expect(model.holdsWriting)
        model.values.title = ""
        model.values.tags = ["日常"]
        #expect(model.holdsWriting)
        model.values.tags = []
        model.values.imageURL = URL(string: "https://example.test/cover.webp")
        #expect(model.holdsWriting)
    }

    @Test func theGuidesSeededQuestionIsNotWritingUntilTheWriterAddsToIt() {
        let model = model()
        model.seed(story: "> What stayed with you?\n\n")
        #expect(!model.holdsWriting)
        model.values.story += "The rain."
        #expect(model.holdsWriting)
    }

    @Test func aSavedDraftKeepsItsWordsAndASavedBlankIsStillSaved() {
        // A saved draft with words is still words to put away.
        #expect(model(opened: card(published: false)).holdsWriting)
        let cleared = model(opened: card(published: false))
        cleared.values = DraftValues()
        // Nothing left to keep, yet the emptied draft still has to be saved on the way out.
        #expect(!cleared.holdsWriting)
        #expect(cleared.needsSave)
    }

    @Test func aPublishedCardAsksOnlyForARevision() {
        let untouched = model(opened: card(published: true))
        #expect(!untouched.holdsWriting)
        #expect(!untouched.needsSave)
        // A revision waiting in its buffer from before.
        #expect(model(opened: card(published: true, pending: true)).holdsWriting)
        // One being typed, not yet buffered.
        let typing = model(opened: card(published: true))
        typing.values.story += " And then it stopped."
        #expect(typing.holdsWriting)
    }
}
