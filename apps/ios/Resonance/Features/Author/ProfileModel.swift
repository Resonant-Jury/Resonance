import Observation
import ResonanceKit

/// An author's page data (web: useProfileByHandle): the profile with the
/// first page of their cards and the cards linking to theirs, in one request;
/// later pages of cards as the list scrolls.
@Observable
final class ProfileModel {
    enum Phase: Equatable { case loading, loaded, notFound, failed(String) }

    /// The first page's size, and each later one's.
    static let pageSize = 12

    private(set) var phase: Phase = .loading
    private(set) var profile: Profile?
    private(set) var cards: [FeedCard] = []
    private(set) var linked: [FeedCard] = []
    /// Where their next page of cards starts (its page token, or an older server's cursor).
    private var nextPage: PageAfter?
    private var loadingMore = false

    let handle: String
    private let fetchProfile: @Sendable (String) async throws -> Profile
    private let fetchPage: @Sendable (String, PageAfter) async throws -> FeedPage

    /// `profile` asks for the page in one request; `page` for the cards after one.
    init(handle: String, profile: @escaping @Sendable (String) async throws -> Profile,
         page: @escaping @Sendable (_ handle: String, _ after: PageAfter) async throws -> FeedPage) {
        self.handle = handle
        fetchProfile = profile
        fetchPage = page
    }

    convenience init(handle: String, api: ReadingAPI) {
        let size = Self.pageSize
        self.init(handle: handle,
                  profile: { try await api.profile($0, include: ReadingAPI.ProfileInclude.page, limit: size) },
                  page: { try await api.profileCards($0, limit: size, after: $1) })
    }

    func load() async {
        do {
            let profile = try await fetchProfile(handle)
            self.profile = profile
            cards = profile.cards?.cards ?? []
            nextPage = profile.cards?.next
            linked = profile.links?.cards ?? []
            phase = .loaded
        } catch let failure as APIFailure where failure.isNotFound {
            phase = .notFound
        } catch {
            phase = .failed((error as? APIFailure)?.message ?? error.localizedDescription)
        }
    }

    func loadMore() async {
        guard !loadingMore, let after = nextPage else { return }
        loadingMore = true
        defer { loadingMore = false }
        if let page = try? await fetchPage(handle, after) {
            cards += page.cards
            nextPage = page.next
        }
    }
}
