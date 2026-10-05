import Foundation
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

    @Test func eachPageStartsWhereTheLastOneEnded() async {
        let (a, b, c) = (a, b, c)
        let asked = Calls<PageAfter?>()
        let model = FeedModel(feed: { after in
            await asked.record(after)
            switch after {
            case nil: return Fixture.page([a], next: "2026-09-01T08:00:00.000Z", token: "t1")
            case .token("t1"): return Fixture.page([b], next: "2026-08-01T08:00:00.000Z", token: "t2")
            default: return Fixture.page([c])
            }
        }, recommended: { [] }, patience: .milliseconds(10))

        await model.load()
        await model.loadMore()
        await model.loadMore()
        #expect(ids(model.cards) == ["a", "b", "c"])
        // By the page token, never the millisecond cursor (cards sharing it would be skipped).
        #expect(await asked.all == [nil, .token("t1"), .token("t2")])
        // The last page: nothing more to ask for.
        #expect(!model.canLoadMore)
        await model.loadMore()
        #expect(await asked.all.count == 3)
    }

    @Test func aServerWithoutPageTokensPagesByItsCursor() async {
        let (a, b) = (a, b)
        let asked = Calls<PageAfter?>()
        let model = FeedModel(feed: { after in
            await asked.record(after)
            return after == nil ? Fixture.page([a], next: "2026-09-01T08:00:00.000Z") : Fixture.page([b])
        }, recommended: { [] }, patience: .milliseconds(10))
        await model.load()
        await model.loadMore()
        #expect(ids(model.cards) == ["a", "b"])
        #expect(await asked.all == [nil, .cursor("2026-09-01T08:00:00.000Z")])
    }

    @Test func aPullKeepsTheFeedOnScreenAndTakesItsOwnPicks() async {
        let (a, x, b, c) = (a, x, b, c)
        let first = Gate<[FeedCard]>(), latest = Gate<FeedPage>()
        let pages = Calls<Int>(), picks = Calls<Int>()
        let model = FeedModel(feed: { _ in
            await pages.record(1)
            // The load's page at once; the pull's when the test says.
            if await pages.all.count == 1 { return Fixture.page([a]) }
            return await latest.wait()
        }, recommended: {
            await picks.record(1)
            // The first load's picks hang; the pull's come at once.
            if await picks.all.count == 1 { return await first.wait() }
            return [b]
        }, patience: .milliseconds(200))

        await model.load()
        #expect(ids(model.cards) == ["a"])
        let pulling = Task { await model.refresh() }
        #expect(await eventually {
            let (asked, picked) = (await pages.all.count, await picks.all.count)
            return asked == 2 && picked == 2
        })
        // While the server thinks, the feed stays: never the skeleton (a full load's `.loading`).
        #expect(model.phase == .loaded)
        #expect(ids(model.cards) == ["a"])

        await latest.open(Fixture.page([c, a]))
        await pulling.value
        // As after a fresh load: the pull's picks head the feed, the latest behind "load more".
        #expect(ids(model.cards) == ["b"])
        #expect(model.refreshFailure == nil)
        await model.loadMore()
        #expect(ids(model.cards) == ["b", "c", "a"])

        // The first load's picks, late: moot.
        await first.open([x])
        try? await Task.sleep(for: .milliseconds(50))
        #expect(!model.picksReady)
        #expect(ids(model.cards) == ["b", "c", "a"])
    }

    @Test func aPullThatBringsNothingBackKeepsTheFeedAndSaysSoQuietly() async {
        let (a, b, x) = (a, b, x)
        let failing = Flag()
        let model = FeedModel(feed: { _ in
            if failing.on { throw APIFailure.unexpected(status: 502) }
            return Fixture.page([a, b])
        }, recommended: {
            if failing.on { throw APIFailure.unexpected(status: 502) }
            return []
        }, patience: .milliseconds(10))
        await model.load()
        #expect(ids(model.cards) == ["a", "b"])

        failing.on = true
        await model.refresh()
        // Not the page's load error: the cards stay, and the failure is the feed's quiet line.
        #expect(model.phase == .loaded)
        #expect(ids(model.cards) == ["a", "b"])
        #expect(model.refreshFailure == .failed)
        #expect(model.refreshFailure?.message == L10n.Native.loadError)

        // The next pull that brings something clears it.
        failing.on = false
        await model.refresh()
        #expect(model.refreshFailure == nil)
        // So does any later answer (the app back after a while asks again behind the feed).
        failing.on = true
        await model.refresh()
        #expect(model.refreshFailure == .failed)
        failing.on = false
        await model.revalidate()
        #expect(model.refreshFailure == nil)

        // Picks alone still count as something.
        let picksOnly = FeedModel(feed: { _ in throw APIFailure.unexpected(status: 502) }, recommended: { [x] },
                                  patience: .milliseconds(10))
        await picksOnly.load()
        #expect(await eventually { picksOnly.phase == .loaded })
        await picksOnly.refresh()
        #expect(picksOnly.refreshFailure == nil)
        #expect(ids(picksOnly.cards) == ["x"])
    }

    @Test func refreshedFurtherDownTheReaderKeepsThePagesRead() async {
        // VoiceOver's Refresh on a card of the third page of the latest: the cards round it stay.
        let (a, b, c, x) = (a, b, c, x)
        let n = Fixture.card("n"), y = Fixture.card("y")
        let refreshed = Flag(), failing = Flag()
        let model = FeedModel(feed: { after in
            if failing.on { throw URLError(.notConnectedToInternet) }
            switch after {
            case nil: return refreshed.on ? Fixture.page([n, a], token: "t1") : Fixture.page([a], token: "t1")
            case .token("t1"): return Fixture.page([b], token: "t2")
            default: return Fixture.page([c])
            }
        }, recommended: {
            if failing.on { throw URLError(.notConnectedToInternet) }
            return refreshed.on ? [y] : [x]
        }, patience: .seconds(5))
        await model.load()
        await model.loadMore()
        await model.loadMore()
        await model.loadMore()
        #expect(ids(model.cards) == ["x", "a", "b", "c"])

        refreshed.on = true
        await model.refreshInPlace()
        // The new card on top of the pages read, all of them still there; the latest still showing.
        #expect(model.latestVisible)
        #expect(ids(model.cards) == ["y", "n", "a", "b", "c"])
        #expect(model.refreshFailure == nil)

        // Nothing back: the feed as it was, and why, quietly.
        failing.on = true
        await model.refreshInPlace()
        #expect(ids(model.cards) == ["y", "n", "a", "b", "c"])
        #expect(model.refreshFailure == .offline)
    }

    @Test func aPullWhileOfflineSaysSo() async {
        let a = a
        let offline = Flag()
        let model = FeedModel(feed: { _ in
            if offline.on { throw URLError(.notConnectedToInternet) }
            return Fixture.page([a])
        }, recommended: {
            if offline.on { throw URLError(.notConnectedToInternet) }
            return []
        }, patience: .milliseconds(10))
        await model.load()
        offline.on = true
        await model.refresh()
        #expect(ids(model.cards) == ["a"])
        #expect(model.refreshFailure == .offline)
        #expect(model.refreshFailure?.message == L10n.Native.offline)
    }

    @Test func aPullWithNothingOnScreenIsAnOrdinaryLoad() async {
        let model = FeedModel(feed: { _ in throw APIFailure.unexpected(status: 502) },
                              recommended: { throw APIFailure.unexpected(status: 502) }, patience: .milliseconds(10))
        await model.load()
        try? await Task.sleep(for: .milliseconds(50))
        #expect(model.phase == .failed("HTTP 502"))
        // Nothing to keep: the page's own error and retry, not the quiet line.
        await model.refresh()
        try? await Task.sleep(for: .milliseconds(50))
        #expect(model.phase == .failed("HTTP 502"))
        #expect(model.refreshFailure == nil)
    }

    @Test func picksThatMissThePullsPatienceWaitBehindTheHint() async {
        let (a, b, x) = (a, b, x)
        let pulled = Gate<[FeedCard]>()
        let asked = Calls<Int>()
        let model = FeedModel(feed: { _ in Fixture.page([a]) }, recommended: {
            await asked.record(1)
            return await asked.all.count == 1 ? [] : await pulled.wait()
        }, patience: .milliseconds(20))
        await model.load()
        #expect(ids(model.cards) == ["a"])

        await model.refresh()
        // The latest came and the picks didn't in time: the feed is the latest's.
        #expect(model.refreshFailure == nil)
        await pulled.open([x, b])
        #expect(await eventually { model.picksReady })
        #expect(ids(model.cards) == ["a"])
    }
}
