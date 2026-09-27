import Observation
import ResonanceKit

/// A card page's data: the card, then the lists around it (web: useCard,
/// useResonanceCards, useReferencedCard, useRelated, useLinkedToCard).
@Observable
final class CardModel {
    enum Phase: Equatable { case loading, loaded, notFound, failed(String) }

    private(set) var phase: Phase = .loading
    private(set) var detail: CardDetail?
    private(set) var resonances: [FeedCard] = []
    private(set) var related: [FeedCard] = []
    private(set) var links: [FeedCard] = []

    let key: String
    private let api: ReadingAPI

    init(key: String, api: ReadingAPI) {
        self.key = key
        self.api = api
    }

    /// The source card (if this one responds to another) and the responses,
    /// deduped — the web's ResonanceCards merges them the same way.
    var resonanceSection: [FeedCard] {
        let source = detail?.referenceCard.map { [$0.value1] } ?? []
        var seen = Set<String>()
        return (source + resonances).filter { seen.insert($0.id).inserted }
    }

    func load() async {
        do {
            let detail = try await api.card(key)
            self.detail = detail
            phase = .loaded
            let id = detail.card.id
            async let resonances = try? api.cards(.resonances, of: id)
            async let related = try? api.cards(.related, of: id)
            async let links = detail.isOwner ? try? api.cards(.links, of: id) : []
            self.resonances = await resonances ?? []
            self.related = await related ?? []
            self.links = await links ?? []
        } catch let failure as APIFailure where failure.isNotFound {
            phase = .notFound
        } catch {
            phase = .failed((error as? APIFailure)?.message ?? error.localizedDescription)
        }
    }
}
