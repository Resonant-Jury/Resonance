import Observation
import ResonanceKit

/// The home feed as the web runs it (home/page.tsx): today's recommendations
/// first; "load more" then reveals the latest public cards, deduped against
/// the picks, a page at a time.
@Observable
final class FeedModel {
    enum Phase: Equatable { case idle, loading, loaded, failed(String) }

    private(set) var phase: Phase = .idle
    private(set) var recommended: [FeedCard] = []
    private(set) var latest: [FeedCard] = []
    private(set) var showLatest = false
    private(set) var isLoadingMore = false
    private var nextCursor: String?
    private var hasMorePages = true

    private let api: ReadingAPI
    init(api: ReadingAPI) { self.api = api }

    /// What the feed shows, in order.
    var cards: [FeedCard] {
        let picks = Set(recommended.map(\.id))
        let rest = latest.filter { !picks.contains($0.id) }
        return latestVisible ? recommended + rest : recommended
    }

    /// With no picks there is nothing to hold back: the latest cards show at once.
    var latestVisible: Bool { recommended.isEmpty || showLatest }
    var canLoadMore: Bool { !latestVisible || hasMorePages }
    var isEmpty: Bool { phase == .loaded && cards.isEmpty }

    func load() async {
        phase = .loading
        async let picks = try? api.recommended()
        do {
            let page = try await api.feed()
            latest = page.cards
            nextCursor = page.nextCursor
            hasMorePages = page.nextCursor != nil
            recommended = await picks ?? []
            phase = .loaded
        } catch {
            recommended = await picks ?? []
            phase = recommended.isEmpty ? .failed((error as? APIFailure)?.message ?? error.localizedDescription) : .loaded
        }
    }

    func refresh() async {
        showLatest = false
        await load()
    }

    /// First reveals the latest cards; after that, fetches the next page.
    func loadMore() async {
        guard !isLoadingMore else { return }
        if !latestVisible {
            showLatest = true
            return
        }
        guard hasMorePages, let cursor = nextCursor else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        if let page = try? await api.feed(cursor: cursor) {
            let known = Set(latest.map(\.id))
            latest += page.cards.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
            hasMorePages = page.nextCursor != nil
        }
    }
}
