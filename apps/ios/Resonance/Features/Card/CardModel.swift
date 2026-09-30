import DesignSystem
import Observation
import ResonanceKit

/// A card page's data: the card, then the lists around it (web: useCard,
/// useResonanceCards, useReferencedCard, useRelated, useLinkedToCard).
///
/// Opened from a list, the page starts from that list's copy of the card
/// (`placeholder`: byline, cover, title) while the card itself is asked for;
/// knowing its id, the lists under it are asked for at the same time.
@Observable
final class CardModel {
    enum Phase: Equatable { case loading, loaded, notFound, failed(String) }

    private(set) var phase: Phase = .loading
    private(set) var detail: CardDetail?
    /// The list's copy of the card, drawn until the card arrives; never trusted beyond that.
    private(set) var placeholder: FeedCard?
    /// The story, parsed once when it arrives.
    private(set) var blocks: [StoryBlock] = []
    private(set) var resonances: [FeedCard] = []
    private(set) var related: [FeedCard] = []
    private(set) var links: [FeedCard] = []

    let key: String
    /// Called with each card the server returns (the session's previews keep the freshest copy).
    @ObservationIgnored var onLoaded: (FeedCard) -> Void = { _ in }
    /// Called when the server says the card isn't here (for this reader).
    @ObservationIgnored var onNotFound: (String) -> Void = { _ in }
    private let fetchCard: @Sendable (String) async throws -> CardDetail
    private let fetchList: @Sendable (ReadingAPI.CardList, String) async throws -> [FeedCard]
    private var isLoading = false

    init(key: String, placeholder: FeedCard? = nil, card: @escaping @Sendable (String) async throws -> CardDetail,
         list: @escaping @Sendable (ReadingAPI.CardList, String) async throws -> [FeedCard]) {
        self.key = key
        self.placeholder = placeholder
        fetchCard = card
        fetchList = list
    }

    convenience init(key: String, api: ReadingAPI, placeholder: FeedCard? = nil) {
        self.init(key: key, placeholder: placeholder, card: { try await api.card($0) }, list: { try await api.cards($0, of: $1) })
    }

    /// The source card (if this one responds to another) and the responses,
    /// deduped — the web's ResonanceCards merges them the same way.
    var resonanceSection: [FeedCard] {
        let source = detail?.referenceCard.map { [$0.value1] } ?? []
        var seen = Set<String>()
        return (source + resonances).filter { seen.insert($0.id).inserted }
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        // The lists are asked for by the card's id (never a slug): known ahead
        // from the list's copy or an earlier load, they go out with the card.
        let knownId = detail?.card.id ?? placeholder?.id
        let fetchList = fetchList
        let early = knownId.map { id in Task { await Self.lists(of: id, fetchList) } }
        do {
            let detail = try await fetchCard(key)
            self.detail = detail
            blocks = StoryParser.parse(detail.story)
            placeholder = nil
            phase = .loaded
            onLoaded(detail.card)
            let id = detail.card.id
            async let links = detail.isOwner ? try? fetchList(.links, id) : []
            let lists: Lists
            if let early, knownId == id {
                lists = await early.value
            } else {
                early?.cancel()
                lists = await Self.lists(of: id, fetchList)
            }
            resonances = lists.resonances
            related = lists.related
            self.links = await links ?? []
        } catch let failure as APIFailure where failure.isNotFound {
            early?.cancel()
            placeholder = nil
            phase = .notFound
            onNotFound(key)
        } catch {
            early?.cancel()
            phase = .failed((error as? APIFailure)?.message ?? error.localizedDescription)
        }
    }

    private struct Lists: Sendable {
        var resonances: [FeedCard] = []
        var related: [FeedCard] = []
    }

    private static func lists(of id: String, _ fetch: @Sendable (ReadingAPI.CardList, String) async throws -> [FeedCard]) async -> Lists {
        async let resonances = try? fetch(.resonances, id)
        async let related = try? fetch(.related, id)
        return await Lists(resonances: resonances ?? [], related: related ?? [])
    }
}
