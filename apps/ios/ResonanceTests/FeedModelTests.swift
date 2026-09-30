import ResonanceKit
import Testing
@testable import Resonance

/// The home feed never waits on today's picks: the latest cards show as soon
/// as they arrive, picks that come in time lead, and picks that come later
/// wait behind the hint instead of moving what's on screen.
@MainActor @Suite struct FeedModelTests {
    let a = Fixture.card("a"), b = Fixture.card("b"), c = Fixture.card("c"), x = Fixture.card("x")

    private func ids(_ cards: [FeedCard]) -> [String] { cards.map(\.id) }

    @Test func picksThatComeInTimeLeadTheFeed() async {
        let (a, b, c, x) = (a, b, c, x)
        let model = FeedModel(feed: { _ in Fixture.page([a, b, c]) }, recommended: { [x, b] }, patience: .seconds(5))

        let started = ContinuousClock.now
        await model.load()

        #expect(model.phase == .loaded)
        #expect(ids(model.cards) == ["x", "b"])
        #expect(!model.latestVisible)
        #expect(!model.picksReady)
        // The picks ended the wait: nobody sat out the whole patience.
        #expect(ContinuousClock.now - started < .seconds(4))

        // "Load more" reveals the latest cards, deduped against the picks.
        await model.loadMore()
        #expect(ids(model.cards) == ["x", "b", "a", "c"])
    }

    @Test func latePicksWaitBehindTheHintWithoutMovingTheFeed() async {
        let (a, b, c, x) = (a, b, c, x)
        let picks = Gate<[FeedCard]>()
        let model = FeedModel(feed: { _ in Fixture.page([a, b, c]) }, recommended: { await picks.wait() },
                              patience: .milliseconds(30))

        await model.load()
        // The latest cards didn't wait for the picks.
        #expect(model.phase == .loaded)
        #expect(ids(model.cards) == ["a", "b", "c"])
        #expect(!model.picksReady)

        await picks.open([x, b])
        #expect(await eventually { model.picksReady })
        // On screen, nothing moved.
        #expect(ids(model.cards) == ["a", "b", "c"])

        // Asked for, they head the feed over the cards already read.
        model.revealPicks()
        #expect(!model.picksReady)
        #expect(model.latestVisible)
        #expect(ids(model.cards) == ["x", "b", "a", "c"])
    }

    @Test func picksHereFirstLeadWhileTheLatestAreSlow() async {
        let (a, x) = (a, x)
        let latest = Gate<FeedPage>()
        let model = FeedModel(feed: { _ in await latest.wait() }, recommended: { [x] }, patience: .seconds(5))

        let loading = Task { await model.load() }
        #expect(await eventually { model.phase == .loaded })
        #expect(ids(model.cards) == ["x"])

        await latest.open(Fixture.page([a, x]))
        await loading.value
        // The latest cards arrived behind "load more": the picks on screen stay as they were.
        #expect(ids(model.cards) == ["x"])
        #expect(model.canLoadMore)
        await model.loadMore()
        #expect(ids(model.cards) == ["x", "a"])
    }

    @Test func emptyPicksShowNoHint() async {
        let (a, b) = (a, b)
        let picks = Gate<[FeedCard]>()
        let model = FeedModel(feed: { _ in Fixture.page([a, b]) }, recommended: { await picks.wait() },
                              patience: .milliseconds(10))

        await model.load()
        await picks.open([])
        try? await Task.sleep(for: .milliseconds(50))
        #expect(!model.picksReady)
        #expect(ids(model.cards) == ["a", "b"])
    }

    @Test func picksStandInWhenTheLatestFail() async {
        let x = x
        let model = FeedModel(feed: { _ in throw APIFailure.unexpected(status: 502) }, recommended: { [x] },
                              patience: .milliseconds(10))

        await model.load()
        #expect(await eventually { model.phase == .loaded })
        #expect(ids(model.cards) == ["x"])
    }

    @Test func nothingToShowIsAFailure() async {
        let model = FeedModel(feed: { _ in throw APIFailure.unexpected(status: 502) },
                              recommended: { throw APIFailure.unexpected(status: 502) }, patience: .milliseconds(10))

        await model.load()
        try? await Task.sleep(for: .milliseconds(50))
        #expect(model.phase == .failed("HTTP 502"))
    }

    @Test func aRefreshIgnoresTheLastLoadsLatePicks() async {
        let (a, x, b) = (a, x, b)
        let first = Gate<[FeedCard]>()
        let asked = Calls<Int>()
        let model = FeedModel(feed: { _ in Fixture.page([a]) }, recommended: {
            await asked.record(1)
            // The first load's picks hang; the refresh's come at once.
            if await asked.all.count == 1 { return await first.wait() }
            return [b]
        }, patience: .milliseconds(200))

        await model.load()
        #expect(ids(model.cards) == ["a"])
        await model.refresh()
        #expect(ids(model.cards) == ["b"])

        await first.open([x])
        try? await Task.sleep(for: .milliseconds(50))
        #expect(!model.picksReady)
        #expect(ids(model.cards) == ["b"])
    }
}
