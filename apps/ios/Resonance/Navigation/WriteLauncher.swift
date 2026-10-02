import Observation

/// Opens the writing screen from anywhere (the pen in the tab bar, a card's
/// Resonate or Edit, a draft in the card box, "write a card" prompts) — the tab
/// view pushes it on the current tab's stack — and tells the tabs what a visit
/// wrote so they can show it.
@Observable
final class WriteLauncher {
    /// What the writer starts from.
    struct Request: Hashable {
        /// Writing a resonance: the card this one answers.
        var referenceCardId: String?
        /// Editing one of your cards: a draft, or a published card's revision (write/[id]).
        var cardId: String?
        /// Whether the card opens once the writer is gone (false when its own page is underneath).
        var showsCard = true
        /// Words to start from (a note grown into a resonance).
        var story: String?
    }

    /// What a visit of the writer (or a card's ⋯) wrote: the card, and the card it
    /// answers when it is a resonance.
    struct Change: Equatable {
        var cardId: String?
        var referenceCardId: String?

        /// Whether a page showing `cardId` may show something else now: the card
        /// itself, or one of its resonances (an unknown card counts).
        func concerns(_ cardId: String) -> Bool {
            self.cardId == nil || self.cardId == cardId || referenceCardId == cardId
        }
    }

    /// A writer asked for and not yet pushed: the tab view takes it from here.
    var requested: Request?
    /// Counts the visits that wrote something (saved, published, revised,
    /// discarded; a card's visibility or deletion), so screens showing cards can
    /// refresh. A visit that wrote nothing doesn't count.
    private(set) var changes = 0 {
        didSet { onChange?() }
    }
    /// The latest of those changes (which card).
    private(set) var lastChange: Change?
    /// Told of every change before any screen refreshes for it (drafts are
    /// written straight to Firestore, where the HTTP cache can't see them).
    @ObservationIgnored var onChange: (() -> Void)?

    func open(_ request: Request = Request()) {
        requested = request
    }

    /// Edit one of your cards.
    func edit(_ cardId: String, showsCard: Bool = true) {
        open(Request(cardId: cardId, showsCard: showsCard))
    }

    /// The writer is going: `change` is what the visit wrote (a draft saved on
    /// the way out, a card published, revised or its revision dropped) — nil
    /// when nothing was written, and no screen needs to read again.
    func leave(_ change: Change?) {
        if let change { record(change) }
    }

    /// A card changed outside the writer (its ⋯ menu: visibility, delete).
    func noteChange(_ change: Change) {
        record(change)
    }

    private func record(_ change: Change) {
        lastChange = change
        changes += 1
    }
}
