import Observation

/// Opens the writing screen from anywhere (the pen in the tab bar, a card's
/// Resonate, "write a card" prompts), and hands a published card back to the
/// tabs so they can show it.
@Observable
final class WriteLauncher {
    /// What the writer starts from.
    struct Request: Equatable {
        /// Writing a resonance: the card this one answers.
        var referenceCardId: String?
    }

    var isPresented = false
    private(set) var request: Request?
    /// The card just published (its slug or id), for the tabs to open once the writer is gone.
    var publishedCard: String?

    func open(_ request: Request = Request()) {
        self.request = request
        isPresented = true
    }

    func finish(publishedCard: String) {
        self.publishedCard = publishedCard
        isPresented = false
    }
}
