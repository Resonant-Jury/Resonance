import DesignSystem
import Foundation
import Observation
import ResonanceKit

/// A card page's data: the card and the lists around it (web: useCard,
/// useResonanceCards, useReferencedCard, useRelated, useLinkedToCard), in one
/// request — the card brings its resonances, related cards, the cards linking
/// to it (yours only) and the cards its story embeds.
///
/// Opened from a list, the page starts from that list's copy of the card
/// (`placeholder`: byline, cover, title) while the card itself is asked for.
/// Read again once shown (an edit, a connection gone), it stays on the page
/// should that read fail; only a card that is gone takes the page with it.
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
    /// The pages of the story's standalone links, as the server read them, by their links' keys.
    private(set) var linkPreviews: [String: LinkPreview] = [:]

    let key: String
    /// Called with each card the server returns whole (the card, its embeds:
    /// the session's previews keep the freshest copy).
    @ObservationIgnored var onLoaded: (FeedCard) -> Void = { _ in }
    /// Called when the server says the card isn't here (for this reader).
    @ObservationIgnored var onNotFound: (String) -> Void = { _ in }
    private let fetch: @Sendable (String) async throws -> CardDetail
    /// The API's origin: a preview's picture is a path of it.
    private let origin: URL
    private var isLoading = false

    init(key: String, placeholder: FeedCard? = nil, origin: URL = URL(string: "https://resonance.channel")!,
         fetch: @escaping @Sendable (String) async throws -> CardDetail) {
        self.key = key
        self.placeholder = placeholder
        self.origin = origin
        self.fetch = fetch
    }

    convenience init(key: String, api: ReadingAPI, origin: URL, placeholder: FeedCard? = nil) {
        self.init(key: key, placeholder: placeholder, origin: origin) { try await api.card($0, include: ReadingAPI.CardInclude.page) }
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

    /// The page of a link standing alone in the story (`StoryBlock.soleLink`), when the server read
    /// one for it; nil leaves the paragraph as it is written.
    func linkPreview(href: String?, text: String) -> LinkPreview? {
        StoryLinks.key(href: href, text: text).flatMap { linkPreviews[$0] }
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
            linkPreviews = StoryLinks.previews(detail.linkPreviews, origin: origin)
            placeholder = nil
            phase = .loaded
            onLoaded(detail.card)
            embeds.forEach(onLoaded)
        } catch let failure as APIFailure where failure.isNotFound {
            placeholder = nil
            phase = .notFound
            onNotFound(key)
        } catch {
            // Read again while shown (offline, a server error): the page stays as it was.
            guard detail == nil else { return }
            phase = .failed((error as? APIFailure)?.message ?? error.localizedDescription)
        }
    }

    /// Whose connection the reader sees this card through: its author, when it is someone
    /// else's card for connections only — gone from the reader once that connection is.
    var seenThroughConnection: String? {
        guard let detail, !detail.isOwner, detail.card.visibility == .connections else { return nil }
        return detail.card.author?.value1.id
    }
}
