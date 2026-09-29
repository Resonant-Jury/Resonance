import Observation

/// Opens the writing screen from anywhere (the pen in the tab bar, a card's
/// Resonate or Edit, a draft in the card box, "write a card" prompts), and
/// hands the card back to the tabs so they can show it.
@Observable
final class WriteLauncher {
    /// What the writer starts from.
    struct Request: Equatable {
        /// Writing a resonance: the card this one answers.
        var referenceCardId: String?
        /// Editing one of your cards: a draft, or a published card's revision (write/[id]).
        var cardId: String?
        /// Whether the card opens once the writer is gone (false when its own page is underneath).
        var showsCard = true
    }

    var isPresented = false
    private(set) var request: Request?
    /// The card to open once the writer is gone (its slug or id).
    var publishedCard: String?
    /// Counts the writer's visits that may have changed a card (saved,
    /// published, revised, discarded), so screens showing cards can refresh.
    private(set) var changes = 0

    func open(_ request: Request = Request()) {
        self.request = request
        isPresented = true
    }

    /// Edit one of your cards.
    func edit(_ cardId: String, showsCard: Bool = true) {
        open(Request(cardId: cardId, showsCard: showsCard))
    }

    /// The writer is done with this card; `key` is where it lives now.
    func finish(card key: String) {
        changes += 1
        if request?.showsCard ?? true { publishedCard = key }
        isPresented = false
    }

    /// The writer closed without sending anything out (the draft or revision is saved).
    func close() {
        changes += 1
        isPresented = false
    }

    /// A card changed outside the writer (its ⋯ menu: visibility, delete).
    func noteChange() {
        changes += 1
    }
}
