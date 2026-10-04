import ResonanceKit
import Testing
@testable import Resonance

/// A person's page is one request: their profile brings the first page of
/// their cards and the cards linking to theirs; later pages follow its page token.
@MainActor @Suite struct ProfileModelTests {
    @Test func theProfileBringsItsCardsAndLinks() async {
        let asked = Calls<String>()
        let model = ProfileModel(handle: "bob", profile: { handle in
            await asked.record("profile:\(handle)")
            return Fixture.profile("bob", cards: Fixture.page([Fixture.card("c1"), Fixture.card("c2")], next: "2026-08-01T00:00:00.000Z",
                                                              token: "t1"),
                                   links: [Fixture.card("l1")])
        }, page: { handle, after in
            await asked.record("page:\(handle):\(after)")
            return Fixture.page([Fixture.card("c3")])
        })

        await model.load()
        #expect(model.phase == .loaded)
        #expect(model.profile?.author.handle == "bob")
        #expect(model.cards.map(\.id) == ["c1", "c2"])
        #expect(model.linked.map(\.id) == ["l1"])
        #expect(await asked.all == ["profile:bob"])

        // Scrolling on: the next page by the first page's token, then nothing more to ask.
        await model.loadMore()
        #expect(model.cards.map(\.id) == ["c1", "c2", "c3"])
        await model.loadMore()
        #expect(await asked.all == ["profile:bob", "page:bob:\(PageAfter.token("t1"))"])
    }

    @Test func aProfileWithoutItsListsShowsNoCards() async {
        // A blocked person's page answers without cards to show; so would a server that ignored `include`.
        let model = ProfileModel(handle: "bob", profile: { _ in Fixture.profile("bob") }, page: { _, _ in Fixture.page([Fixture.card("x")]) })
        await model.load()
        #expect(model.phase == .loaded)
        #expect(model.cards.isEmpty && model.linked.isEmpty)
        await model.loadMore()
        #expect(model.cards.isEmpty)
    }

    @Test func nobodyByThatNameIsNotFound() async {
        let model = ProfileModel(handle: "nobody", profile: { _ in throw APIFailure(code: "not_found", message: "x", status: 404) },
                                 page: { _, _ in Fixture.page([]) })
        await model.load()
        #expect(model.phase == .notFound)
    }

    @Test func connectedOrNoLongerThePageAsksAgainBehindWhatItShows() async {
        let connected = Flag(), failing = Flag()
        connected.on = true
        let model = ProfileModel(handle: "bob", profile: { _ in
            if failing.on { throw APIFailure.unexpected(status: 502) }
            // Connected, their card for connections only is on the page; a take-back later, it isn't.
            let cards = connected.on ? [Fixture.card("c1"), Fixture.card("conn", visibility: "connections")] : [Fixture.card("c1")]
            return Fixture.profile("bob", cards: Fixture.page(cards), connected: connected.on)
        }, page: { _, _ in Fixture.page([]) })
        await model.load()
        #expect(model.profile?.isConnected == true)
        #expect(model.cards.map(\.id) == ["c1", "conn"])

        // Asked again and it fails (offline): the page stays as it was, no error page.
        failing.on = true
        await model.revalidate()
        #expect(model.phase == .loaded)
        #expect(model.cards.map(\.id) == ["c1", "conn"])

        // The connection gone: the answer takes the page's place.
        failing.on = false
        connected.on = false
        await model.revalidate()
        #expect(model.phase == .loaded)
        #expect(model.profile?.isConnected == false)
        #expect(model.cards.map(\.id) == ["c1"])
    }

    @Test func whoseConnectionMovedIsWhoIsAskedAbout() {
        // The live list of connections, read twice: whose began or ended.
        #expect(ConversationsStore.moved(from: ["bob", "carol"], to: ["carol", "dave"]) == ["bob", "dave"])
        #expect(ConversationsStore.moved(from: ["bob"], to: ["bob"]).isEmpty)
        let moved = ConnectionsMove().next(["bob"])
        #expect(moved.concerns("bob"))
        #expect(!moved.concerns("carol"))
        #expect(!moved.concerns(nil))
        // The same person twice in a row is still two changes (the screens hear both).
        #expect(moved.next(["bob"]) != moved)
    }
}
