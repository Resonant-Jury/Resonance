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
/// app after a while. A pull to refresh (`refresh`) asks again with the feed
/// kept on screen, and keeps it there — saying so quietly — when nothing
/// comes back. Whatever is drawn leaves out people the reader has blocked, as
/// the block list is now.
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
    /// The last pull to refresh brought nothing back (and why): the feed on screen stayed as it
    /// was. Cleared when the next answer arrives.
    private(set) var refreshFailure: RefreshFailure?
    /// Where the next page of the latest cards starts (its page token, or an older server's cursor).
    private var nextPage: PageAfter?
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
    /// The refresh still putting its answers together (its `generation`), and the picks it has
    /// had meanwhile (`.some(nil)`: they failed).
    @ObservationIgnored private var refreshing: Int?
    @ObservationIgnored private var refreshPicks: [FeedCard]??

    private let fetchFeed: @Sendable (PageAfter?) async throws -> FeedPage
    private let fetchRecommended: @Sendable () async throws -> [FeedCard]
    private let patience: Duration
    private let keeping: FeedKeeping?
    private let blocked: () -> Set<String>

    /// How long the latest cards wait for picks that haven't arrived yet.
    static let defaultPatience: Duration = .milliseconds(800)

    init(feed: @escaping @Sendable (PageAfter?) async throws -> FeedPage, recommended: @escaping @Sendable () async throws -> [FeedCard],
         patience: Duration = FeedModel.defaultPatience, keeping: FeedKeeping? = nil, blocked: @escaping () -> Set<String> = { [] }) {
        fetchFeed = feed
        fetchRecommended = recommended
        self.patience = patience
        self.keeping = keeping
        self.blocked = blocked
    }

    convenience init(api: ReadingAPI, keeping: FeedKeeping? = nil, blocked: @escaping () -> Set<String> = { [] }) {
        self.init(feed: { try await api.feed(after: $0) }, recommended: { try await api.recommended() },
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
        refreshFailure = nil
        recommended = []
        heldPicks = []
        arrivedPicks = nil
        latestLoaded = false
        extraPages = 0
        nextPage = nil
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
            nextPage = page.next
            hasMorePages = page.next != nil
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

    /// Pulled to refresh: both are asked for again, with the feed kept on screen meanwhile (no
    /// skeleton). The answers take their places as a fresh load's do — today's picks heading the
    /// feed and the first page of the latest cards behind "load more" (picks nearly there still
    /// lead; later ones wait behind the hint, as late picks do) — and one that fails leaves its
    /// part as it was. When nothing comes back the feed stays as it is and `refreshFailure` says
    /// why. Nothing on screen yet: an ordinary load, its failure the page's.
    func refresh() async {
        guard phase == .loaded else {
            showLatest = false
            refreshFailure = nil
            return await load()
        }
        generation += 1
        let asked = generation
        refreshing = asked
        refreshPicks = nil
        defer { if refreshing == asked { refreshing = nil } }
        let deadline = ContinuousClock.now.advanced(by: patience)
        // Unstructured on purpose, as in `load`: leaving the screen doesn't abandon them.
        let (fetchFeed, fetchRecommended) = (fetchFeed, fetchRecommended)
        let picks = Task { [weak self] () -> [FeedCard]? in
            let picks = try? await fetchRecommended()
            self?.refreshedPicks(picks, for: asked)
            return picks
        }
        var failure: Error?
        let page: FeedPage?
        do {
            page = try await fetchFeed(nil)
        } catch {
            page = nil
            failure = error
        }
        guard asked == generation else { return }
        guard let page else {
            // Let go of (the screen went away): the feed stays as it is, with nothing to say.
            if Task.isCancelled { return }
            // The latest didn't come: whatever this refresh brings now is the picks.
            let picks = await picks.value
            guard asked == generation else { return }
            refreshing = nil
            if let picks {
                takeRefreshed(picks: picks)
            } else {
                refreshFailure = RefreshFailure(failure)
            }
            return
        }
        if refreshPicks == nil {
            // Picks that are nearly there still lead (they end the wait when they come).
            let wait = Task<Void, Never> { try? await Task.sleep(until: deadline) }
            patienceWait = wait
            await withTaskCancellationHandler { await wait.value } onCancel: { wait.cancel() }
            patienceWait = nil
            guard asked == generation else { return }
        }
        refreshing = nil
        refreshFailure = nil
        keeping?.keepLatest(page)
        latest = page.cards
        nextPage = page.next
        hasMorePages = page.next != nil
        latestLoaded = true
        extraPages = 0
        if case let picks?? = refreshPicks { takeRefreshed(picks: picks) }
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

    /// Refreshed where the reader is, away from the list's top (VoiceOver's Refresh further down):
    /// both are asked for again and each answer takes its part's place as `revalidate`'s do — the
    /// new latest cards on top of the pages read (all of them kept), the latest left showing, picks
    /// for a feed the latest cards lead waiting behind the hint — so the cards round the reader's
    /// place stay. When nothing comes back the feed stays as it is and `refreshFailure` says why.
    /// Nothing on screen yet: an ordinary refresh.
    func refreshInPlace() async {
        guard phase == .loaded else { return await refresh() }
        generation += 1
        let asked = generation
        // Unstructured on purpose, as in `load`: leaving the screen doesn't abandon them.
        let (fetchFeed, fetchRecommended) = (fetchFeed, fetchRecommended)
        let picks = Task { [weak self] () -> Bool in
            guard let picks = try? await fetchRecommended() else { return false }
            self?.freshPicks(picks, for: asked)
            return true
        }
        let latest = Task { [weak self] () -> Error? in
            do {
                let page = try await fetchFeed(nil)
                self?.freshLatest(page, for: asked)
                return nil
            } catch {
                return error
            }
        }
        let pickedUp = await picks.value
        let failure = await latest.value
        guard asked == generation, !pickedUp, let failure else { return }
        refreshFailure = RefreshFailure(failure)
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
            nextPage = page.next
            hasMorePages = page.next != nil
            latestLoaded = true
            extraPages = 0
            return
        }
        guard hasMorePages, let after = nextPage else { return }
        if let page = try? await fetchFeed(after) {
            let known = Set(latest.map(\.id))
            latest += page.cards.filter { !known.contains($0.id) }
            nextPage = page.next
            hasMorePages = page.next != nil
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
        nextPage = page?.next
        hasMorePages = page.map { $0.next != nil } ?? true
        latestLoaded = page != nil
        extraPages = 0
        phase = .loaded
        return true
    }

    private func freshPicks(_ picks: [FeedCard], for asked: Int) {
        guard asked == generation else { return }
        refreshFailure = nil
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
        refreshFailure = nil
        keeping?.keepLatest(page)
        if extraPages == 0 {
            latest = page.cards
            nextPage = page.next
            hasMorePages = page.next != nil
        } else {
            // The reader has read on past the first page: the new cards go on top, the rest stay.
            let fresh = Set(page.cards.map(\.id))
            latest = page.cards + latest.filter { !fresh.contains($0.id) }
        }
        latestLoaded = true
    }

    /// The refresh's picks: held for it while it puts its answers together, taken as late picks are after.
    private func refreshedPicks(_ picks: [FeedCard]?, for asked: Int) {
        guard asked == generation else { return }
        if refreshing == asked {
            refreshPicks = .some(picks)
            patienceWait?.cancel()
            return
        }
        guard let picks else { return }
        freshPicks(picks, for: asked)
    }

    /// Picks a refresh brought in time: they head the feed, as after a fresh load (the latest
    /// cards behind "load more" again); none at all leave the latest showing.
    private func takeRefreshed(picks: [FeedCard]) {
        keeping?.keepPicks(picks)
        refreshFailure = nil
        recommended = picks
        heldPicks = []
        showLatest = false
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

/// Why a pull to refresh brought nothing back: the phone is offline, or anything else (the server).
enum RefreshFailure: Equatable {
    case offline, failed

    init(_ error: Error?) {
        self = error.map(APIFailure.isOffline) == true ? .offline : .failed
    }

    /// What the feed says, quietly, above what it kept.
    var message: String {
        switch self {
        case .offline: L10n.Native.offline
        case .failed: L10n.Native.loadError
        }
    }
}
