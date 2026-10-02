import ResonanceKit
import Testing
@testable import Resonance

/// The card box asks for my own shelves together (one GET /me/cardbox): opening
/// it brings the private and draft shelves with the published one; other
/// people's cards (resonated, linked, bookmarks) are asked for when shown.
@MainActor @Suite struct CardBoxShelvesTests {
    typealias Shelf = ReadingAPI.CardBoxShelf
    let own: Set<Shelf> = [.published, ._private, .draft]

    private func asked(_ s: Shelf, force: Bool = false, known: Set<Shelf> = [], unconfirmed: Set<Shelf> = []) -> Set<Shelf> {
        CardBoxScreen.asked(with: s, force: force, known: known, unconfirmed: unconfirmed)
    }

    @Test func openingTheBoxAsksForMyOwnShelvesInOneRequest() {
        #expect(asked(.published) == own)
        // A cold start drew the kept published shelf: asked again with the others.
        #expect(asked(.published, unconfirmed: [.published]) == own)
    }

    @Test func aShelfAlreadyHereIsNotAskedForAgain() {
        // The private shelf came with the published one: showing the draft shelf now asks for it alone.
        #expect(asked(.draft, known: [.published, ._private]) == [.draft])
        // Back after a while: what's on screen asks again with the own shelves waiting to.
        #expect(asked(._private, known: own, unconfirmed: [.published, ._private]) == [.published, ._private])
    }

    @Test func otherPeoplesCardsAreAskedForAlone() {
        #expect(asked(.resonated) == [.resonated])
        #expect(asked(.bookmarks, known: own, unconfirmed: own) == [.bookmarks])
    }

    @Test func pullingToRefreshAsksForAllMyShelvesAgain() {
        #expect(asked(.draft, force: true, known: own) == own)
        #expect(asked(.linked, force: true, known: own.union([.linked])) == [.linked])
    }
}
