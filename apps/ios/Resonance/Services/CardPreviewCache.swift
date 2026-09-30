import ResonanceKit

/// Cards the signed-in person has just seen in a list, so a card's page can
/// draw its byline, cover and title the moment it opens.
///
/// Only ever a placeholder: the page still asks the server for the card, and
/// the server's answer (which may be "not found" now) replaces it. Kept for
/// one account — the session empties it on sign-out or a switch of account,
/// and whenever the block list changes — and in memory only.
final class CardPreviewCache {
    /// Enough for the lists a reader moves between; the oldest go first.
    static let capacity = 300

    private var byId: [String: FeedCard] = [:]
    private var idBySlug: [String: String] = [:]
    /// Ids, least recently remembered first.
    private var order: [String] = []

    var count: Int { byId.count }

    func remember(_ card: FeedCard) {
        if let old = byId[card.id] {
            if let slug = old.slug, slug != card.slug { idBySlug[slug] = nil }
            order.removeAll { $0 == card.id }
        }
        byId[card.id] = card
        if let slug = card.slug { idBySlug[slug] = card.id }
        order.append(card.id)
        while order.count > Self.capacity { drop(order.removeFirst()) }
    }

    func remember(_ cards: [FeedCard]) {
        cards.forEach(remember)
    }

    /// The card a route names: its slug, or its id (older cards, notifications).
    func card(for key: String) -> FeedCard? {
        byId[key] ?? idBySlug[key].flatMap { byId[$0] }
    }

    /// The server says the reader can't see it (any more).
    func forget(_ key: String) {
        guard let id = byId[key]?.id ?? idBySlug[key] else { return }
        order.removeAll { $0 == id }
        drop(id)
    }

    func clear() {
        byId = [:]
        idBySlug = [:]
        order = []
    }

    private func drop(_ id: String) {
        if let slug = byId[id]?.slug { idBySlug[slug] = nil }
        byId[id] = nil
    }
}
