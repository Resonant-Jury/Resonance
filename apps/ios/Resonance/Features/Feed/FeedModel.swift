import Observation
import ResonanceKit

/// The home feed as the web runs it (home/page.tsx): today's recommendations
/// first; "load more" then reveals the latest public cards, deduped against
/// the picks, a page at a time.
///
/// The two are asked for together, but the feed never waits long for the
/// picks: the latest cards show as soon as they arrive (after a short
/// `patience`, so picks that are nearly there still lead). Picks that arrive
/// once the latest cards are on screen don't rearrange them — they wait
/// behind a hint (`picksReady`) until the reader asks for them.
///
/// A cold start draws the feed the last run kept (`FeedKeeping`) at once and
/// asks the server again behind it (`revalidate`); so does a return to the
/// app after a while. Whatever is drawn leaves out people the reader has
/// blocked, as the block list is now.
@Observable
final class FeedModel {
    enum Phase: Equatable { case idle, loading, loaded, failed(String) }

    private(set) var phase: Phase = .idle
    /// Today's picks on screen, heading the feed.
    private(set) var recommended: [FeedCard] = []
    private(set) var latest: [FeedCard] = []
    private(set) var showLatest = false
    private(set) var isLoadingMore = false
    /// Picks that arrived after the latest cards were already showing.
    private(set) var heldPicks: [FeedCard] = []
    private var nextCursor: String?
    private var hasMorePages = true
    /// The first page of the latest cards has arrived (it may fail while the picks show).
    private var latestLoaded = false
    /// Pages after the first that "load more" added since the first page arrived.
    private var extraPages = 0
    /// What each load answers to; a newer load (a refresh, a retry) makes older answers moot.
    private var generation = 0
    /// Picks from the current load that arrived before the feed was shown (nil: still on their way).
    private var arrivedPicks: [FeedCard]?
    /// The latest cards waiting out `patience` for the picks.
    @ObservationIgnored private var patienceWait: Task<Void, Never>?

    private let fetchFeed: @Sendable (String?) async throws -> FeedPage
    private let fetchRecommended: @Sendable () async throws -> [FeedCard]
    private let patience: Duration
    private let keeping: FeedKeeping?
    private let blocked: () -> Set<String>

    /// How long the latest cards wait for picks that haven't arrived yet.
    static let defaultPatience: Duration = .milliseconds(800)

    init(feed: @escaping @Sendable (String?) async throws -> FeedPage, recommended: @escaping @Sendable () async throws -> [FeedCard],
         patience: Duration = FeedModel.defaultPatience, keeping: FeedKeeping? = nil, blocked: @escaping () -> Set<String> = { [] }) {
        fetchFeed = feed
        fetchRecommended = recommended
        self.patience = patience
        self.keeping = keeping
        self.blocked = blocked
    }

    convenience init(api: ReadingAPI, keeping: FeedKeeping? = nil, blocked: @escaping () -> Set<String> = { [] }) {
        self.init(feed: { try await api.feed(cursor: $0) }, recommended: { try await api.recommended() },
                  keeping: keeping, blocked: blocked)
    }

    /// What the feed shows, in order.
    var cards: [FeedCard] {
        let picks = Set(recommended.map(\.id))
        let rest = latest.filter { !picks.contains($0.id) }
        return visible(latestVisible ? recommended + rest : recommended)
    }

    /// With no picks there is nothing to hold back: the latest cards show at once.
    var latestVisible: Bool { recommended.isEmpty || showLatest }
    var canLoadMore: Bool { !latestVisible || hasMorePages }
    var isEmpty: Bool { phase == .loaded && cards.isEmpty }
    /// Today's picks are here, waiting for the reader (the hint above the feed).
    var picksReady: Bool { !visible(heldPicks).isEmpty }

    /// Returns once there is something to show (or nothing will come); the
    /// picks may still be on their way, however long they take. On a cold
    /// start the kept feed shows at once and this returns once the server
    /// has answered behind it.
    func load() async {
        if phase == .idle, showKept() {
            await revalidate()
            return
        }
        generation += 1
        let asked = generation
        phase = .loading
        recommended = []
        heldPicks = []
        arrivedPicks = nil
        latestLoaded = false
        extraPages = 0
        nextCursor = nil
        hasMorePages = true
        let deadline = ContinuousClock.now.advanced(by: patience)
        // Unstructured on purpose: leaving the screen doesn't abandon them.
        let fetchRecommended = fetchRecommended
        Task { [weak self] in
            let picks = try? await fetchRecommended()
            if let picks { self?.keep(picks: picks, for: asked) }
            self?.picksArrived(picks ?? [], for: asked)
        }
        do {
            let page = try await fetchFeed(nil)
            guard asked == generation else { return }
            keeping?.keepLatest(page)
            latest = page.cards
            nextCursor = page.nextCursor
            hasMorePages = page.nextCursor != nil
            latestLoaded = true
            // Picks that are nearly there still lead the feed: wait for them until the
            // deadline (they end the wait when they come — `picksArrived`).
            if phase == .loading, arrivedPicks == nil {
                let wait = Task<Void, Never> { try? await Task.sleep(until: deadline) }
                patienceWait = wait
                await withTaskCancellationHandler { await wait.value } onCancel: { wait.cancel() }
                patienceWait = nil
            }
            guard asked == generation, phase == .loading else { return }
            show(picks: arrivedPicks ?? [])
        } catch {
            guard asked == generation, phase == .loading else { return }
            if Task.isCancelled {
                // The screen went away mid-load: start over when it's back.
                phase = .idle
                return
            }
            latest = []
            if let picks = arrivedPicks, !picks.isEmpty {
                show(picks: picks)
            } else {
                // Picks still on their way can stand in for the feed when they come (`picksArrived`).
                phase = .failed((error as? APIFailure)?.message ?? error.localizedDescription)
            }
        }
    }

    func refresh() async {
        showLatest = false
        await load()
    }

    /// Asks the server again without taking down what's on screen (the kept
    /// feed of a cold start, a feed left a while ago). Each answer takes its
    /// part's place as it comes; a failed one leaves its part as it was. Picks
    /// that come to a feed led by the latest cards wait behind the hint, as
    /// late picks do. Nothing shown yet: an ordinary `load` (unless one is on its way).
    func revalidate() async {
        switch phase {
        case .loaded: break
        case .loading: return
        case .idle, .failed: return await load()
        }
        generation += 1
        let asked = generation
        // Unstructured on purpose, as in `load`: leaving the screen doesn't abandon them.
        let (fetchFeed, fetchRecommended) = (fetchFeed, fetchRecommended)
        let picks = Task { [weak self] in
            guard let picks = try? await fetchRecommended() else { return }
            self?.freshPicks(picks, for: asked)
        }
        let latest = Task { [weak self] in
            guard let page = try? await fetchFeed(nil) else { return }
            self?.freshLatest(page, for: asked)
        }
        await picks.value
        await latest.value
    }

    /// The hint's tap: the held picks head the feed, over the cards already read.
    func revealPicks() {
        guard !heldPicks.isEmpty else { return }
        recommended = heldPicks
        heldPicks = []
        showLatest = true
    }

    /// First reveals the latest cards; after that, fetches the next page.
    func loadMore() async {
        guard !isLoadingMore else { return }
        if !latestVisible {
            showLatest = true
            if latestLoaded { return }
        }
        isLoadingMore = true
        defer { isLoadingMore = false }
        if !latestLoaded {
            // The first page failed while the picks showed: ask again.
            guard let page = try? await fetchFeed(nil) else { return }
            keeping?.keepLatest(page)
            latest = page.cards
            nextCursor = page.nextCursor
            hasMorePages = page.nextCursor != nil
            latestLoaded = true
            extraPages = 0
            return
        }
        guard hasMorePages, let cursor = nextCursor else { return }
        if let page = try? await fetchFeed(cursor) {
            let known = Set(latest.map(\.id))
            latest += page.cards.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
            hasMorePages = page.nextCursor != nil
            extraPages += 1
        }
    }

    /// The kept feed, drawn as the server last answered it. False when nothing was kept.
    private func showKept() -> Bool {
        guard let keeping else { return false }
        let page = keeping.latest()
        let picks = keeping.picks() ?? []
        guard page != nil || !picks.isEmpty else { return false }
        generation += 1
        recommended = picks
        heldPicks = []
        latest = page?.cards ?? []
        nextCursor = page?.nextCursor
        hasMorePages = page.map { $0.nextCursor != nil } ?? true
        latestLoaded = page != nil
        extraPages = 0
        phase = .loaded
        return true
    }

    private func freshPicks(_ picks: [FeedCard], for asked: Int) {
        guard asked == generation else { return }
        keeping?.keepPicks(picks)
        if recommended.isEmpty, !picks.isEmpty, !latest.isEmpty {
            // The latest cards lead what's on screen: don't move them.
            heldPicks = picks
        } else {
            recommended = picks
        }
    }

    private func freshLatest(_ page: FeedPage, for asked: Int) {
        guard asked == generation else { return }
        keeping?.keepLatest(page)
        if extraPages == 0 {
            latest = page.cards
            nextCursor = page.nextCursor
            hasMorePages = page.nextCursor != nil
        } else {
            // The reader has read on past the first page: the new cards go on top, the rest stay.
            let fresh = Set(page.cards.map(\.id))
            latest = page.cards + latest.filter { !fresh.contains($0.id) }
        }
        latestLoaded = true
    }

    private func keep(picks: [FeedCard], for asked: Int) {
        guard asked == generation else { return }
        keeping?.keepPicks(picks)
    }

    /// Cards by people the reader has blocked never show, whenever they were kept.
    private func visible(_ cards: [FeedCard]) -> [FeedCard] {
        let blocked = blocked()
        guard !blocked.isEmpty else { return cards }
        return cards.filter { card in card.author.map { !blocked.contains($0.value1.id) } ?? true }
    }

    private func picksArrived(_ picks: [FeedCard], for asked: Int) {
        guard asked == generation else { return }
        switch phase {
        case .loading:
            arrivedPicks = picks
            // Here first: they lead now, and the latest cards wait behind "load more".
            // (Latest already here and waiting out its patience: show both at once.)
            if !picks.isEmpty || latestLoaded { show(picks: picks) }
            patienceWait?.cancel()
        case .loaded:
            // The latest cards are on screen: don't move them. The picks wait for the reader.
            if recommended.isEmpty, !picks.isEmpty { heldPicks = picks }
        case .failed:
            // The latest cards failed; the picks are something to read.
            if !picks.isEmpty {
                recommended = picks
                phase = .loaded
            }
        case .idle:
            break
        }
    }

    private func show(picks: [FeedCard]) {
        recommended = picks
        phase = .loaded
    }
}

/// Where the feed's answers are kept between launches (`APICache`, this
/// account's): the latest first page and today's picks, read on a cold start
/// and written whenever the server answers.
struct FeedKeeping {
    var latest: () -> FeedPage?
    var picks: () -> [FeedCard]?
    var keepLatest: (FeedPage) -> Void
    var keepPicks: ([FeedCard]) -> Void

    init(latest: @escaping () -> FeedPage?, picks: @escaping () -> [FeedCard]?,
         keepLatest: @escaping (FeedPage) -> Void, keepPicks: @escaping ([FeedCard]) -> Void) {
        self.latest = latest
        self.picks = picks
        self.keepLatest = keepLatest
        self.keepPicks = keepPicks
    }

    /// `uid`'s, in `cache`.
    init(_ cache: APICache, uid: String) {
        self.init(latest: { cache.value(.latest, uid: uid) }, picks: { cache.value(.recommended, uid: uid) },
                  keepLatest: { cache.save($0, as: .latest, uid: uid) }, keepPicks: { cache.save($0, as: .recommended, uid: uid) })
    }
}
