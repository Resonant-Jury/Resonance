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

    @Test func aRefreshThatFailedSpeaksOnlyOverTheShelfItWasFor() throws {
        // Pulled on the published shelf, then Bookmarks chosen while the request was on its way; it failed.
        #expect(CardBoxScreen.afterRefresh(of: .published, showing: true, failure: .offline, shown: .bookmarks) == nil)
        // Still on the shelf it was for: the line over it, and VoiceOver hears it.
        let stayed = try #require(CardBoxScreen.afterRefresh(of: .published, showing: true, failure: .offline, shown: .published))
        #expect(stayed == CardBoxScreen.ShelfFailure(shelf: .published, failure: .offline))
        // Kept for the shelf it was for: never said over another one.
        #expect(stayed?.over(.published) == .offline)
        #expect(stayed?.over(.bookmarks) == nil)
        // Answered, or nothing on screen to keep: no line.
        #expect(CardBoxScreen.afterRefresh(of: .draft, showing: true, failure: nil, shown: .draft) == .some(nil))
        #expect(CardBoxScreen.afterRefresh(of: .draft, showing: false, failure: .failed, shown: .draft) == .some(nil))
    }
}
