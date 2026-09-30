import ResonanceKit
import Testing
@testable import Resonance

/// A card opened from a list draws what the list knew at once, asks for the
/// lists under it alongside the card, and never outlives the server's answer.
@MainActor @Suite struct CardPreviewTests {
    @Test func theCacheFindsACardBySlugOrIdAndForgets() {
        let cache = CardPreviewCache()
        cache.remember(Fixture.card("c1", slug: "a-walk", title: "A walk"))
        #expect(cache.card(for: "a-walk")?.id == "c1")
        #expect(cache.card(for: "c1")?.title == "A walk")

        // A fresher copy replaces it, slug and all.
        cache.remember(Fixture.card("c1", slug: "a-longer-walk", title: "A longer walk"))
        #expect(cache.card(for: "a-walk") == nil)
        #expect(cache.card(for: "a-longer-walk")?.title == "A longer walk")

        cache.forget("a-longer-walk")
        #expect(cache.card(for: "c1") == nil)
        #expect(cache.count == 0)
    }

    @Test func theCacheKeepsOnlyTheMostRecent() {
        let cache = CardPreviewCache()
        for i in 0...CardPreviewCache.capacity { cache.remember(Fixture.card("c\(i)", slug: "s\(i)")) }
        #expect(cache.count == CardPreviewCache.capacity)
        #expect(cache.card(for: "s0") == nil)
        #expect(cache.card(for: "c\(CardPreviewCache.capacity)") != nil)
        cache.clear()
        #expect(cache.count == 0)
    }

    @Test func aCardFromAListDrawsAtOnceAndAsksForItsListsAlongside() async {
        let listed = Fixture.card("c1", slug: "a-walk", title: "A walk")
        let card = Gate<CardDetail>()
        let calls = Calls<String>()
        let model = CardModel(key: "a-walk", placeholder: listed, card: { _ in await card.wait() }, list: { list, id in
            await calls.record("\(list):\(id)")
            return list == .resonances ? [Fixture.card("r1")] : [Fixture.card("rel1")]
        })

        let loading = Task { await model.load() }
        // Before the card arrives: the list's copy on screen, the lists already asked for by id (not slug).
        #expect(model.placeholder?.title == "A walk")
        #expect(model.phase == .loading)
        #expect(await eventually { await calls.all.count == 2 })
        #expect(Set(await calls.all) == ["resonances:c1", "related:c1"])

        await card.open(Fixture.detail(Fixture.card("c1", slug: "a-walk", title: "A walk, edited")))
        await loading.value
        #expect(model.phase == .loaded)
        #expect(model.placeholder == nil)
        #expect(model.detail?.card.title == "A walk, edited")
        #expect(model.resonances.map(\.id) == ["r1"])
        #expect(model.related.map(\.id) == ["rel1"])
        // Nothing asked twice.
        #expect(await calls.all.count == 2)
    }

    @Test func withoutACopyTheListsWaitForTheCardsId() async {
        let calls = Calls<String>()
        let model = CardModel(key: "a-walk", card: { _ in Fixture.detail(Fixture.card("c1", slug: "a-walk"), isOwner: true) },
                              list: { list, id in
                                  await calls.record("\(list):\(id)")
                                  return []
                              })
        await model.load()
        #expect(model.phase == .loaded)
        #expect(Set(await calls.all) == ["resonances:c1", "related:c1", "links:c1"])
    }

    @Test func aCardThatIsGoneDropsTheListsCopy() async {
        var forgotten: [String] = []
        let model = CardModel(key: "a-walk", placeholder: Fixture.card("c1", slug: "a-walk"),
                              card: { _ in throw APIFailure(code: "not_found", message: "No such card.", status: 404) },
                              list: { _, _ in [] })
        model.onNotFound = { forgotten.append($0) }
        await model.load()
        #expect(model.phase == .notFound)
        #expect(model.placeholder == nil)
        #expect(forgotten == ["a-walk"])
    }
}
