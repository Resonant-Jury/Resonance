import Observation
import ResonanceKit

/// Cards a screen only draws a title and a cover of (the cards shared in a
/// conversation): asked for together, each once, in one request
/// (GET /api/v1/cards?keys=) — never a whole card with its story apiece.
@MainActor @Observable
final class CardSummaries {
    /// What the server answered, by the key asked (an id or a slug).
    private var found: [String: FeedCard] = [:]
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

    /// Asks for the keys not asked for yet, together. A failed request
    /// (offline, a server error) lets the next call ask for them again.
    func load(_ keys: [String]) async {
        var seen = Set<String>()
        let missing = keys.filter { !asked.contains($0) && seen.insert($0).inserted }
        guard !missing.isEmpty else { return }
        asked.formUnion(missing)
        do {
            let cards = try await fetch(missing)
            for key in missing {
                if let card = cards.first(where: { $0.id == key || $0.slug == key }) { found[key] = card }
            }
            onLoaded(cards)
        } catch {
            asked.subtract(missing)
        }
    }
}
