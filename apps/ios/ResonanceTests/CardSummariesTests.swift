import ResonanceKit
import Testing
@testable import Resonance

/// The cards shared in a conversation are read together: one request for
/// every card the messages share, never a card's whole page apiece.
@MainActor @Suite struct CardSummariesTests {
    struct Offline: Error {}

    @Test func everyCardSharedIsAskedForInOneRequest() async {
        let asked = Calls<[String]>()
        let summaries = CardSummaries { keys in
            await asked.record(keys)
            // The server leaves out what the reader may not see (c2: private, or by someone they blocked).
            return keys.filter { $0 != "c2" }.map { Fixture.card($0, title: "Card \($0)") }
        }
        var remembered: [String] = []
        summaries.onLoaded = { remembered += $0.map(\.id) }

        // Thread order, a card shared twice.
        await summaries.load(["c1", "c2", "c1", "c3"])
        #expect(await asked.all == [["c1", "c2", "c3"]])
        #expect(summaries.card("c1")?.title == "Card c1")
        #expect(summaries.card("c3")?.title == "Card c3")
        #expect(summaries.card("c2") == nil)
        #expect(remembered == ["c1", "c3"])

        // A new message sharing one more card: only that one is asked for; none twice.
        await summaries.load(["c1", "c2", "c3", "c4"])
        await summaries.load(["c1", "c4"])
        #expect(await asked.all == [["c1", "c2", "c3"], ["c4"]])
        #expect(summaries.card("c4") != nil)
    }

    @Test func aFailedRequestIsAskedAgainNextTime() async {
        let asked = Calls<[String]>()
        let summaries = CardSummaries { keys in
            await asked.record(keys)
            // Offline the first time.
            if await asked.all.count == 1 { throw Offline() }
            return keys.map { Fixture.card($0) }
        }
        await summaries.load(["c1"])
        #expect(summaries.card("c1") == nil)
        await summaries.load(["c1"])
        #expect(summaries.card("c1") != nil)
        #expect(await asked.all == [["c1"], ["c1"]])
    }

    @Test func aCardIsFoundByTheKeyItWasSharedBy() async {
        // Messages share a card by id; a slug finds it too.
        let summaries = CardSummaries { _ in [Fixture.card("c1", slug: "a-walk")] }
        await summaries.load(["a-walk"])
        #expect(summaries.card("a-walk")?.id == "c1")
    }

    @Test func eachCardSaysWhereItStands() async {
        let gate = Gate<Void>()
        let asked = Calls<[String]>()
        let summaries = CardSummaries { keys in
            await asked.record(keys)
            if await asked.all.count == 1 {
                await gate.wait()
                return [Fixture.card("c1", slug: "a-walk")]
            }
            throw Offline()
        }
        // Asked for and not answered yet: a placeholder of the card's size.
        let first = Task { await summaries.load(["a-walk", "gone"]) }
        #expect(await eventually { await asked.all.count == 1 })
        #expect(summaries.lookup("a-walk") == .loading)
        #expect(summaries.lookup("never-asked") == .loading)
        await gate.open(())
        await first.value
        #expect(summaries.lookup("a-walk") == .found(Fixture.card("c1", slug: "a-walk")))
        // The server left it out: the reader may not see it (or it's gone) — a link falls back to its preview.
        #expect(summaries.lookup("gone") == .hidden)
        // Offline: not "hidden", and asked again next time.
        await summaries.load(["c9"])
        #expect(summaries.lookup("c9") == .failed)
        await summaries.load(["c9"])
        #expect(await asked.all == [["a-walk", "gone"], ["c9"], ["c9"]])
    }

    @Test func aCardInHandIsNeverAskedFor() async {
        let asked = Calls<[String]>()
        let summaries = CardSummaries { keys in
            await asked.record(keys)
            return []
        }
        // The card the person is sending: drawn at once, by its id or its slug.
        summaries.remember(Fixture.card("c1", slug: "a-walk"))
        await summaries.load(["c1", "a-walk"])
        #expect(summaries.lookup("c1") == .found(Fixture.card("c1", slug: "a-walk")))
        #expect(summaries.card("a-walk")?.id == "c1")
        #expect(await asked.all.isEmpty)
    }
}
