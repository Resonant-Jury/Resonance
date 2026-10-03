import Observation
import ResonanceKit

/// Cards a screen only draws a title and a cover of (the cards shared in a
/// conversation): asked for together, each once, in one request
/// (GET /api/v1/cards?keys=) — never a whole card with its story apiece.
@MainActor @Observable
final class CardSummaries {
    /// Where a card asked for stands (on its way, found, hidden from the reader, or not read).
    typealias Lookup = CardLookup<FeedCard>

    /// What the server answered, by the key asked (an id or a slug).
    private var found: [String: FeedCard] = [:]
    /// Keys the server answered without a card.
    private var missing: Set<String> = []
    /// Keys whose request failed, until they are asked again.
    private var failed: Set<String> = []
    @ObservationIgnored private var asked = Set<String>()
    @ObservationIgnored private let fetch: @Sendable ([String]) async throws -> [FeedCard]
    /// Called with the cards each answer brings (the session's previews keep them).
    @ObservationIgnored var onLoaded: ([FeedCard]) -> Void = { _ in }

    init(fetch: @escaping @Sendable ([String]) async throws -> [FeedCard]) {
        self.fetch = fetch
    }

    convenience init(api: ReadingAPI) {
        self.init { try await api.cards(keys: $0) }
    }

    /// The card, once it has arrived; nil while it's on its way, and for a
    /// card the reader may not see (gone, private, by someone they blocked).
    func card(_ key: String) -> FeedCard? { found[key] }

    /// Where the card asked for by `key` stands.
    func lookup(_ key: String) -> Lookup {
        if let card = found[key] { return .found(card) }
        if missing.contains(key) { return .hidden }
        if failed.contains(key) { return .failed }
        return .loading
    }

    /// A card already in hand (the one the person is about to send): drawn at once, never asked for.
    func remember(_ card: FeedCard) {
        for key in [card.id] + (card.slug.map { [$0] } ?? []) {
            found[key] = card
            asked.insert(key)
            missing.remove(key)
            failed.remove(key)
        }
    }

    /// Asks for the keys not asked for yet, together. A failed request
    /// (offline, a server error) lets the next call ask for them again.
    func load(_ keys: [String]) async {
        var seen = Set<String>()
        let wanted = keys.filter { !asked.contains($0) && seen.insert($0).inserted }
        guard !wanted.isEmpty else { return }
        asked.formUnion(wanted)
        failed.subtract(wanted)
        do {
            let cards = try await fetch(wanted)
            for key in wanted {
                if let card = cards.first(where: { $0.id == key || $0.slug == key }) { found[key] = card } else { missing.insert(key) }
            }
            onLoaded(cards)
        } catch {
            asked.subtract(wanted)
            failed.formUnion(wanted)
        }
    }
}
