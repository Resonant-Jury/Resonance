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
}
