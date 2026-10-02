import Foundation
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
        writer.close(nil)
        #expect(!writer.isPresented)
        #expect(writer.changes == 0)
        #expect(told == 0)
        #expect(writer.lastChange == nil)
    }

    @Test func aVisitThatWroteNamesItsCard() {
        let writer = WriteLauncher()
        var told = 0
        writer.onChange = { told += 1 }
        writer.open(.init(referenceCardId: "original"))
        writer.close(.init(cardId: "draft-1", referenceCardId: "original"))
        #expect(writer.changes == 1)
        #expect(told == 1)
        #expect(writer.lastChange == .init(cardId: "draft-1", referenceCardId: "original"))

        // Published: the card opens once the writer is gone, and it counts as a change.
        writer.open()
        writer.finish(card: "a-walk", change: .init(cardId: "card-2"))
        #expect(writer.changes == 2)
        #expect(writer.publishedCard == "a-walk")
        // A card's ⋯ (visibility, delete).
        writer.noteChange(.init(cardId: "card-3"))
        #expect(writer.changes == 3)
        #expect(writer.lastChange?.cardId == "card-3")
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
