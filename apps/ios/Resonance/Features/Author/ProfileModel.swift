import Observation
import ResonanceKit

/// An author's page data (web: useProfileByHandle), their cards paged.
@Observable
final class ProfileModel {
    enum Phase: Equatable { case loading, loaded, notFound, failed(String) }

    private(set) var phase: Phase = .loading
    private(set) var profile: Profile?
    private(set) var cards: [FeedCard] = []
    private(set) var linked: [FeedCard] = []
    private var nextCursor: String?
    private var loadingMore = false

    let handle: String
    private let api: ReadingAPI

    init(handle: String, api: ReadingAPI) {
        self.handle = handle
        self.api = api
    }

    func load() async {
        do {
            async let profile = api.profile(handle)
            async let page = api.profileCards(handle, limit: 12)
            async let linked = try? api.profileLinks(handle)
            self.profile = try await profile
            let first = try await page
            cards = first.cards
            nextCursor = first.nextCursor
            self.linked = await linked ?? []
            phase = .loaded
        } catch let failure as APIFailure where failure.isNotFound {
            phase = .notFound
        } catch {
            phase = .failed((error as? APIFailure)?.message ?? error.localizedDescription)
        }
    }

    func loadMore() async {
        guard !loadingMore, let cursor = nextCursor else { return }
        loadingMore = true
        defer { loadingMore = false }
        if let page = try? await api.profileCards(handle, limit: 12, cursor: cursor) {
            cards += page.cards
            nextCursor = page.nextCursor
        }
    }
}
