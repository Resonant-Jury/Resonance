import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// The thought map reads its cards under the rules, and asks the server for
/// the ones the rules won't let it read — someone else's anonymous card the
/// viewer resonated with — which come without their author.
@MainActor @Suite struct ThoughtMapCardsTests {
    struct Offline: Error {}

    nonisolated static func mapCard(_ id: String, by author: String = "alice") -> MapCard {
        MapCard(id: id, authorId: author, slug: nil, title: "Card \(id)", story: "A story.", tags: [], visibility: "public",
                publishedAt: nil, mediaURL: nil, accentHue: nil)
    }

    @Test func originalsTheRulesRefuseComeFromTheServerWithoutTheirAuthor() async {
        let asked = Calls<[String]>()
        let cards = await ThoughtMapService.read(["mine", "anon", "gone", "bobs"], underRules: { id in
            // An anonymous card's document names its author, so the rules let only the author read it.
            switch id {
            case "mine": Self.mapCard("mine")
            case "bobs": Self.mapCard("bobs", by: "bob")
            default: nil
            }
        }, server: { ids in
            await asked.record(ids)
            // The server leaves out what the reader may not see (gone: deleted, or made private).
            return [Fixture.card("anon", slug: "after-the-rain", title: "雨後", anonymous: true)]
        })
        // In the order asked, each from wherever it could be read; one request for the rest.
        #expect(cards.map(\.id) == ["mine", "anon", "bobs"])
        #expect(await asked.all == [["anon", "gone"]])
        let anon = cards[1]
        #expect(anon.authorId.isEmpty)
        #expect(anon.title == "雨後")
        #expect(anon.slug == "after-the-rain")
        #expect(anon.publishedAt == ISO8601.date("2026-09-01T08:00:00.000Z"))
        #expect(anon.accentHue == 140)
        #expect(cards[2].authorId == "bob")
    }

    @Test func everythingReadableAsksTheServerNothing() async {
        let asked = Calls<[String]>()
        let cards = await ThoughtMapService.read(["a", "b"], underRules: { Self.mapCard($0) }, server: { ids in
            await asked.record(ids)
            return []
        })
        #expect(cards.map(\.id) == ["a", "b"])
        #expect(await asked.all.isEmpty)
    }

    @Test func aServerThatFailsLeavesThoseOutThisTime() async {
        let cards = await ThoughtMapService.read(["a", "anon"], underRules: { $0 == "a" ? Self.mapCard($0) : nil },
                                                 server: { _ in throw Offline() })
        #expect(cards.map(\.id) == ["a"])
    }

    @Test func aSummaryIsDrawnAsTheMapDrawsACard() {
        let card = MapCard(summary: Fixture.card("c1", slug: "a-walk", title: "一場雨後的散步", by: "bob"))
        #expect(card.authorId == "bob")
        #expect(card.title == "一場雨後的散步")
        // The excerpt stands in for the story the node shows the start of.
        #expect(card.story == "…")
        #expect(card.tags == ["日常"])
        #expect(card.visibility == "public")
        #expect(card.mediaURL == nil)
    }
}
