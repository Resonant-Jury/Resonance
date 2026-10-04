import ResonanceKit
import Testing
@testable import Resonance

/// A card opened from a list draws what the list knew at once, asks for the
/// card with everything its page shows in one request, and never outlives
/// the server's answer.
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

    @Test func aCardFromAListDrawsAtOnceThenItsWholePageArrivesInOneRequest() async {
        let listed = Fixture.card("c1", slug: "a-walk", title: "A walk")
        let card = Gate<CardDetail>()
        let calls = Calls<String>()
        let model = CardModel(key: "a-walk", placeholder: listed) { key in
            await calls.record(key)
            return await card.wait()
        }

        let loading = Task { await model.load() }
        // Before the card arrives: the list's copy on screen.
        #expect(model.placeholder?.title == "A walk")
        #expect(model.phase == .loading)

        let source = Fixture.card("src")
        await card.open(Fixture.detail(Fixture.card("c1", slug: "a-walk", title: "A walk, edited"), isOwner: true, reference: source,
                                       resonances: [Fixture.card("r1"), source], related: [Fixture.card("rel1")],
                                       links: [Fixture.card("l1")], embeds: [Fixture.card("e1", slug: "rain")]))
        await loading.value
        #expect(model.phase == .loaded)
        #expect(model.placeholder == nil)
        #expect(model.detail?.card.title == "A walk, edited")
        // The lists came with the card: the source first, each once.
        #expect(model.resonanceSection.map(\.id) == ["src", "r1"])
        #expect(model.related.map(\.id) == ["rel1"])
        #expect(model.links.map(\.id) == ["l1"])
        #expect(model.embeds.map(\.id) == ["e1"])
        // One request, by the key the page was opened with.
        #expect(await calls.all == ["a-walk"])
    }

    @Test func storyEmbedsDrawFromThePagesSummariesAndTheRestStayLinks() async {
        let model = CardModel(key: "a-walk") { _ in
            Fixture.detail(Fixture.card("c1", slug: "a-walk"), story: "[雨](/card/rain)\n\n[old](/card/legacy-id)\n\n[gone](/card/gone)",
                           embeds: [Fixture.card("e1", slug: "rain"), Fixture.card("legacy-id")])
        }
        var remembered: [String] = []
        model.onLoaded = { remembered.append($0.id) }
        await model.load()
        #expect(model.blocks.count == 3)
        // Matched by slug, or by id (a card from before slugs); decoded, without its query.
        #expect(model.embed(for: "/card/rain")?.id == "e1")
        #expect(model.embed(for: "/card/rain?from=story#top")?.id == "e1")
        #expect(model.embed(for: "/card/legacy-id")?.id == "legacy-id")
        // A card the reader can't see isn't in the list: the link is drawn as a plain link.
        #expect(model.embed(for: "/card/gone") == nil)
        #expect(model.embed(for: "https://example.com/card/rain") == nil)
        // The page's previews keep the card and its embeds, so opening one draws at once.
        #expect(remembered == ["c1", "e1", "legacy-id"])
    }

    @Test func aPageWithoutItsListsShowsNone() async {
        // An answer without the lists (a server that ignored `include`): the page, nothing under it.
        let model = CardModel(key: "a-walk") { _ in Fixture.detail(Fixture.card("c1", slug: "a-walk")) }
        await model.load()
        #expect(model.phase == .loaded)
        #expect(model.resonanceSection.isEmpty && model.related.isEmpty && model.links.isEmpty && model.embeds.isEmpty)
        #expect(model.embed(for: "/card/rain") == nil)
    }

    @Test func aCardThatIsGoneDropsTheListsCopy() async {
        var forgotten: [String] = []
        let model = CardModel(key: "a-walk", placeholder: Fixture.card("c1", slug: "a-walk")) { _ in
            throw APIFailure(code: "not_found", message: "No such card.", status: 404)
        }
        model.onNotFound = { forgotten.append($0) }
        await model.load()
        #expect(model.phase == .notFound)
        #expect(model.placeholder == nil)
        #expect(forgotten == ["a-walk"])
    }

    @Test func aCardForConnectionsOnlyGoesWithTheConnection() async {
        let state = Flag()   // on: the connection is gone (a take-back)
        let failing = Flag()
        let model = CardModel(key: "walk") { _ in
            if failing.on { throw APIFailure.unexpected(status: 502) }
            if state.on { throw APIFailure(code: "not_found", message: "No such card.", status: 404) }
            return Fixture.detail(Fixture.card("c1", slug: "walk", by: "bob", visibility: "connections"))
        }
        await model.load()
        // Seen through the connection with its author: their connection moving is this page's business.
        #expect(model.seenThroughConnection == "bob")

        // Read again and it fails (offline): the page stays, not the load error.
        failing.on = true
        await model.load()
        #expect(model.phase == .loaded)
        #expect(model.detail?.card.id == "c1")

        // The connection taken back: the card is no longer the reader's to see.
        failing.on = false
        state.on = true
        await model.load()
        #expect(model.phase == .notFound)
    }

    @Test func publicOrOwnCardsDontHangOnAConnection() async {
        let open = CardModel(key: "walk") { _ in Fixture.detail(Fixture.card("c1", by: "bob")) }
        await open.load()
        #expect(open.seenThroughConnection == nil)
        let mine = CardModel(key: "walk") { _ in Fixture.detail(Fixture.card("c1", by: "alice", visibility: "connections"), isOwner: true) }
        await mine.load()
        #expect(mine.seenThroughConnection == nil)
    }
}
