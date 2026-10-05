import Observation

/// Whether the reader has answered a card already — their resonance to it, a draft or published —
/// as the button under the story needs to know before it offers 共振 (a second resonance must not
/// be begun by accident). A lookup that fails — or hangs, which is a failure once `patience` has
/// run out — is tried again by itself, a little later, and then on the reader's tap: the button
/// never stays dimmed for good (a read refused for a moment just after signing in once left it so).
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

    typealias Find = @MainActor () async throws -> DraftService.Resonance?

    private(set) var state: State = .looking
    /// A tap's own lookup is on its way (the button inks while it is).
    private(set) var asking = false
    /// A tap's lookup failed too: a quiet line says so (the button stays, to try again).
    private(set) var tapFailed = false
    /// The pauses before each retry of a failed lookup.
    @ObservationIgnored private let retries: [Duration]
    /// How long one read may take before it counts as failed.
    @ObservationIgnored private let patience: Duration

    init(retries: [Duration] = [.seconds(1), .seconds(3)], patience: Duration = .seconds(8)) {
        self.retries = retries
        self.patience = patience
    }

    /// Looks (again: after a change, coming back to the page) — keeping an answer already had on
    /// screen meanwhile — and tries a failure again after each of `retries` before it is `failed`.
    /// One that can't be asked again doesn't keep the earlier answer: the draft it named may have
    /// been deleted since (修改 on a card that isn't there), and 共振 asks again on a tap.
    func look(_ find: @escaping Find) async {
        if state == .failed { state = .looking }
        for pause in [Duration.zero] + retries {
            if pause > .zero {
                try? await Task.sleep(for: pause)
                if Task.isCancelled { return }
            }
            do {
                state = .found(try await answer(find))
                tapFailed = false
                return
            } catch {
                if Task.isCancelled { return }
            }
        }
        state = .failed
    }

    /// The reader tapped 共振 after the lookup failed: asked once more, at once. True when it is now
    /// known that they haven't answered the card (the picker can open). One that hangs ends with
    /// `patience` too: the button never inks for good.
    func askOnTap(_ find: @escaping Find) async -> Bool {
        guard !asking else { return false }
        asking = true
        defer { asking = false }
        do {
            let mine = try await answer(find)
            state = .found(mine)
            tapFailed = false
            return mine == nil
        } catch {
            tapFailed = !Task.isCancelled
            return false
        }
    }

    /// `find`'s answer, or a failure once `patience` has run out without one: a read that hangs
    /// (Firestore waiting on a connection that doesn't come, deaf to cancellation) fails like any
    /// other. The read is left to end when it does; a late answer is not used.
    private func answer(_ find: @escaping Find) async throws -> DraftService.Resonance? {
        let first = FirstAnswer()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { done in
                first.waiting = done
                let read = Task {
                    do { first.give(.success(try await find())) } catch { first.give(.failure(error)) }
                }
                let timer = Task { [patience] in
                    try? await Task.sleep(for: patience)
                    first.give(.failure(TookTooLong()))
                }
                first.running = [read, timer]
            }
        } onCancel: {
            Task { @MainActor in first.give(.failure(CancellationError())) }
        }
    }

    struct TookTooLong: Error {}

    /// Whichever comes first — the read's answer, the deadline, the lookup cancelled — is the answer;
    /// the rest are stopped and ignored.
    @MainActor private final class FirstAnswer {
        var waiting: CheckedContinuation<DraftService.Resonance?, Error>?
        var running: [Task<Void, Never>] = []

        func give(_ result: Result<DraftService.Resonance?, Error>) {
            guard let waiting else { return }
            self.waiting = nil
            waiting.resume(with: result)
            running.forEach { $0.cancel() }
        }
    }
}
