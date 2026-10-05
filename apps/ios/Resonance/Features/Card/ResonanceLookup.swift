import Observation

/// Whether the reader has answered a card already — their resonance to it, a draft or published —
/// as the button under the story needs to know before it offers 共振 (a second resonance must not
/// be begun by accident). A lookup that fails is tried again by itself, a little later, and then
/// on the reader's tap: the button never stays dimmed for good (a read refused for a moment just
/// after signing in once left it so).
@MainActor @Observable
final class ResonanceLookup {
    enum State: Equatable {
        /// Not answered yet: the button waits, dimmed.
        case looking
        /// Answered: the reader's resonance, or none.
        case found(DraftService.Resonance?)
        /// It couldn't be asked (after its retries): the button is there to tap, which asks again.
        case failed
    }

    private(set) var state: State = .looking
    /// A tap's own lookup is on its way (the button inks while it is).
    private(set) var asking = false
    /// A tap's lookup failed too: a quiet line says so (the button stays, to try again).
    private(set) var tapFailed = false
    /// The pauses before each retry of a failed lookup.
    @ObservationIgnored private let retries: [Duration]

    init(retries: [Duration] = [.seconds(1), .seconds(3)]) {
        self.retries = retries
    }

    /// Looks (again: after a change, coming back to the page) — keeping an answer already had on
    /// screen meanwhile — and tries a failure again after each of `retries` before it is `failed`.
    func look(_ find: @MainActor () async throws -> DraftService.Resonance?) async {
        if state == .failed { state = .looking }
        for pause in [Duration.zero] + retries {
            if pause > .zero {
                try? await Task.sleep(for: pause)
                if Task.isCancelled { return }
            }
            do {
                state = .found(try await find())
                tapFailed = false
                return
            } catch {
                if Task.isCancelled { return }
            }
        }
        if case .found = state { return }
        state = .failed
    }

    /// The reader tapped 共振 after the lookup failed: asked once more, at once. True when it is now
    /// known that they haven't answered the card (the picker can open).
    func askOnTap(_ find: @MainActor () async throws -> DraftService.Resonance?) async -> Bool {
        guard !asking else { return false }
        asking = true
        defer { asking = false }
        do {
            let mine = try await find()
            state = .found(mine)
            tapFailed = false
            return mine == nil
        } catch {
            tapFailed = !Task.isCancelled
            return false
        }
    }
}
