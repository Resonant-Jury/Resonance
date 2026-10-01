import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// A cold start draws the feed the last run kept — at once, without the
/// people blocked since — then the server's answers take its place as they
/// come; and coming back to the app after a while asks again.
@MainActor @Suite struct KeptFeedTests {
    let a = Fixture.card("a"), b = Fixture.card("b"), c = Fixture.card("c"), x = Fixture.card("x"), y = Fixture.card("y")
    let cache = APICache(root: FileManager.default.temporaryDirectory.appending(path: "KeptFeedTests-\(UUID().uuidString)"))

    init() {
        cache.retainOnly("alice")
    }

    private func ids(_ cards: [FeedCard]) -> [String] { cards.map(\.id) }

    @Test func aColdStartDrawsWhatTheLastRunKeptThenTheServersAnswer() async {
        let (a, b, c, x, y) = (a, b, c, x, y)
        // The last run: the server answered, and the feed kept what it said.
        let first = FeedModel(feed: { _ in Fixture.page([a, b], next: "2026-09-01T00:00:00.000Z") }, recommended: { [x] },
                              patience: .seconds(5), keeping: FeedKeeping(cache, uid: "alice"))
        await first.load()
        #expect(await eventually { cache.value(.recommended, uid: "alice")?.map(\.id) == ["x"] })

        // This run: the server is slow to answer.
        let latest = Gate<FeedPage>(), picks = Gate<[FeedCard]>()
        let model = FeedModel(feed: { _ in await latest.wait() }, recommended: { await picks.wait() },
                              keeping: FeedKeeping(cache, uid: "alice"))
        let loading = Task { await model.load() }
        // Drawn at once, as the last run left it: no skeleton, no wait.
        #expect(await eventually(within: .milliseconds(200)) { model.phase == .loaded })
        #expect(ids(model.cards) == ["x"])
        #expect(model.canLoadMore)

        // Today's picks take the place of the kept ones, the latest cards theirs behind "load more".
        await picks.open([y])
        await latest.open(Fixture.page([c, a]))
        await loading.value
        #expect(ids(model.cards) == ["y"])
        await model.loadMore()
        #expect(ids(model.cards) == ["y", "c", "a"])
        // And what the server said is what the next cold start draws.
        #expect(cache.value(.latest, uid: "alice")?.cards.map(\.id) == ["c", "a"])
        #expect(cache.value(.recommended, uid: "alice")?.map(\.id) == ["y"])
    }

    @Test func nothingKeptIsAnOrdinaryLoad() async {
        let (a, x) = (a, x)
        let model = FeedModel(feed: { _ in Fixture.page([a]) }, recommended: { [x] }, patience: .seconds(5),
                              keeping: FeedKeeping(cache, uid: "alice"))
        await model.load()
        #expect(ids(model.cards) == ["x"])
        #expect(await eventually { cache.value(.latest, uid: "alice")?.cards.map(\.id) == ["a"] })
    }

    @Test func peopleBlockedSinceNeverShowFromWhatWasKept() async {
        let mallory = Fixture.card("m", by: "mallory"), anon = Fixture.card("n", anonymous: true), a = a
        cache.save(Fixture.page([mallory, a, anon]), as: .latest, uid: "alice")
        var blocked: Set<String> = ["mallory"]
        let latest = Gate<FeedPage>(), picks = Gate<[FeedCard]>()
        let model = FeedModel(feed: { _ in await latest.wait() }, recommended: { await picks.wait() },
                              keeping: FeedKeeping(cache, uid: "alice"), blocked: { blocked })
        let loading = Task { await model.load() }
        #expect(await eventually { model.phase == .loaded })
        #expect(ids(model.cards) == ["a", "n"])

        // Blocked while it shows: gone from it at once.
        blocked.insert("bob")
        #expect(ids(model.cards) == ["n"])
        await picks.open([])
        await latest.open(Fixture.page([anon]))
        await loading.value
    }

    @Test func aFailedAnswerLeavesWhatIsShown() async {
        cache.save(Fixture.page([a, b]), as: .latest, uid: "alice")
        let model = FeedModel(feed: { _ in throw APIFailure.unexpected(status: 502) },
                              recommended: { throw APIFailure.unexpected(status: 502) },
                              keeping: FeedKeeping(cache, uid: "alice"))
        await model.load()
        #expect(model.phase == .loaded)
        #expect(ids(model.cards) == ["a", "b"])
        #expect(cache.value(.latest, uid: "alice")?.cards.map(\.id) == ["a", "b"])
    }

    @Test func picksForAFeedLedByTheLatestWaitBehindTheHint() async {
        let (b, c, x) = (b, c, x)
        // Yesterday's picks are gone with their UTC day; the latest cards were kept.
        cache.save(Fixture.page([b, c]), as: .latest, uid: "alice")
        let model = FeedModel(feed: { _ in Fixture.page([b, c]) }, recommended: { [x] },
                              keeping: FeedKeeping(cache, uid: "alice"))
        await model.load()
        #expect(ids(model.cards) == ["b", "c"])
        #expect(model.picksReady)
        model.revealPicks()
        #expect(ids(model.cards) == ["x", "b", "c"])
    }

    @Test func comingBackAsksAgainBehindWhatIsShown() async throws {
        let (a, b) = (a, b)
        let asked = Calls<Int>(), second = Gate<FeedPage>()
        let model = FeedModel(feed: { _ in
            await asked.record(1)
            return await asked.all.count == 1 ? Fixture.page([a]) : await second.wait()
        }, recommended: { [] }, patience: .milliseconds(10))
        await model.load()
        #expect(ids(model.cards) == ["a"])

        let revalidating = Task { await model.revalidate() }
        #expect(await eventually { await asked.all.count == 2 })
        // While the server thinks, the feed stays as it was: never a skeleton.
        #expect(model.phase == .loaded)
        #expect(ids(model.cards) == ["a"])
        await second.open(Fixture.page([b, a]))
        await revalidating.value
        #expect(ids(model.cards) == ["b", "a"])
    }

    @Test func theScreensAskAgainAfterAQuarterHourOrOnANewUTCDay() {
        let format = ISO8601DateFormatter()
        let last = ForegroundRefresh(last: format.date(from: "2026-10-02T10:00:00Z")!)
        #expect(!last.isStale(at: format.date(from: "2026-10-02T10:14:00Z")!))
        #expect(last.isStale(at: format.date(from: "2026-10-02T10:16:00Z")!))
        // Today's picks change at midnight UTC, however recently the feed was asked for.
        let late = ForegroundRefresh(last: format.date(from: "2026-10-02T23:58:00Z")!)
        #expect(late.isStale(at: format.date(from: "2026-10-03T00:01:00Z")!))
    }
}
