import ResonanceKit
import Testing
@testable import Resonance

/// A person's page is one request: their profile brings the first page of
/// their cards and the cards linking to theirs; later pages follow its cursor.
@MainActor @Suite struct ProfileModelTests {
    @Test func theProfileBringsItsCardsAndLinks() async {
        let asked = Calls<String>()
        let model = ProfileModel(handle: "bob", profile: { handle in
            await asked.record("profile:\(handle)")
            return Fixture.profile("bob", cards: Fixture.page([Fixture.card("c1"), Fixture.card("c2")], next: "2026-08-01T00:00:00.000Z"),
                                   links: [Fixture.card("l1")])
        }, page: { handle, cursor in
            await asked.record("page:\(handle):\(cursor)")
            return Fixture.page([Fixture.card("c3")])
        })

        await model.load()
        #expect(model.phase == .loaded)
        #expect(model.profile?.author.handle == "bob")
        #expect(model.cards.map(\.id) == ["c1", "c2"])
        #expect(model.linked.map(\.id) == ["l1"])
        #expect(await asked.all == ["profile:bob"])

        // Scrolling on: the next page by the first page's cursor, then nothing more to ask.
        await model.loadMore()
        #expect(model.cards.map(\.id) == ["c1", "c2", "c3"])
        await model.loadMore()
        #expect(await asked.all == ["profile:bob", "page:bob:2026-08-01T00:00:00.000Z"])
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
}
