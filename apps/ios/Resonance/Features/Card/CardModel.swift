import DesignSystem
import Observation
import ResonanceKit

/// A card page's data: the card and the lists around it (web: useCard,
/// useResonanceCards, useReferencedCard, useRelated, useLinkedToCard), in one
/// request — the card brings its resonances, related cards, the cards linking
/// to it (yours only) and the cards its story embeds.
///
/// Opened from a list, the page starts from that list's copy of the card
/// (`placeholder`: byline, cover, title) while the card itself is asked for.
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
    /// The cards the story embeds that the reader may see, as the server summarised them.
    private(set) var embeds: [FeedCard] = []

    let key: String
    /// Called with each card the server returns whole (the card, its embeds:
    /// the session's previews keep the freshest copy).
    @ObservationIgnored var onLoaded: (FeedCard) -> Void = { _ in }
    /// Called when the server says the card isn't here (for this reader).
    @ObservationIgnored var onNotFound: (String) -> Void = { _ in }
    private let fetch: @Sendable (String) async throws -> CardDetail
    private var isLoading = false

    init(key: String, placeholder: FeedCard? = nil, fetch: @escaping @Sendable (String) async throws -> CardDetail) {
        self.key = key
        self.placeholder = placeholder
        self.fetch = fetch
    }

    convenience init(key: String, api: ReadingAPI, placeholder: FeedCard? = nil) {
        self.init(key: key, placeholder: placeholder) { try await api.card($0, include: ReadingAPI.CardInclude.page) }
    }

    /// The source card (if this one responds to another) and the responses,
    /// deduped — the web's ResonanceCards merges them the same way.
    var resonanceSection: [FeedCard] {
        let source = detail?.referenceCard.map { [$0.value1] } ?? []
        var seen = Set<String>()
        return (source + resonances).filter { seen.insert($0.id).inserted }
    }

    /// The card a story's `/card/{key}` link embeds, matched by slug or id;
    /// nil when the reader can't see it (any more), and the link stays a link.
    func embed(for href: String) -> FeedCard? {
        guard let key = CardKey.of(href: href) else { return nil }
        return embeds.first { $0.slug == key || $0.id == key }
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let detail = try await fetch(key)
            self.detail = detail
            blocks = StoryParser.parse(detail.story)
            resonances = detail.resonances?.cards ?? []
            related = detail.related?.cards ?? []
            links = detail.links?.cards ?? []
            embeds = detail.embeds?.cards ?? []
            placeholder = nil
            phase = .loaded
            onLoaded(detail.card)
            embeds.forEach(onLoaded)
        } catch let failure as APIFailure where failure.isNotFound {
            placeholder = nil
            phase = .notFound
            onNotFound(key)
        } catch {
            phase = .failed((error as? APIFailure)?.message ?? error.localizedDescription)
        }
    }
}
