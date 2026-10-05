import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// 共振 under a story waits to know whether the reader has answered the card already — and never
/// stays dimmed for good when that can't be read for a moment: the lookup is tried again by
/// itself, then on the reader's tap.
@MainActor @Suite struct ResonanceLookupTests {
    struct Refused: Error {}

    @Test func aLookupThatFailsForAMomentIsTriedAgainByItself() async {
        let lookup = ResonanceLookup(retries: [.milliseconds(5), .milliseconds(5)])
        var asked = 0
        await lookup.look {
            asked += 1
            // Refused just after signing in; answered the next time.
            if asked == 1 { throw Refused() }
            return nil
        }
        #expect(asked == 2)
        #expect(lookup.state == .found(nil))
    }

    @Test func oneThatKeepsFailingIsATapAwayNeverDimmedForGood() async {
        let lookup = ResonanceLookup(retries: [.milliseconds(5)])
        await lookup.look { throw Refused() }
        // Not "looking" (dimmed, untappable) any more: there to tap.
        #expect(lookup.state == .failed)

        // Tapped while it still can't be read: a quiet line, and the button stays to try again.
        #expect(await !lookup.askOnTap { throw Refused() })
        #expect(lookup.tapFailed)
        #expect(lookup.state == .failed)

        // Tapped again, and answered: none yet, so the picker opens.
        #expect(await lookup.askOnTap { nil })
        #expect(lookup.state == .found(nil))
        #expect(!lookup.tapFailed)
    }

    @Test func aTapThatFindsTheReadersResonanceOpensNoPicker() async {
        let lookup = ResonanceLookup(retries: [])
        await lookup.look { throw Refused() }
        let mine = DraftService.Resonance(id: "r1", published: true)
        #expect(await !lookup.askOnTap { mine })
        // The button becomes 已共振 instead: no second resonance begun.
        #expect(lookup.state == .found(mine))
    }

    @Test func lookingAgainKeepsTheAnswerMeanwhileButNotOneItCouldntAskAgain() async {
        let lookup = ResonanceLookup(retries: [.milliseconds(5)])
        let mine = DraftService.Resonance(id: "r1", published: false)
        await lookup.look { mine }
        // Asked again (after a change): what was known stays on screen while it is asked.
        let gate = Gate<Bool>()
        let again = Task { await lookup.look { _ = await gate.wait(); throw Refused() } }
        try? await Task.sleep(for: .milliseconds(30))
        #expect(lookup.state == .found(mine))
        // It can't be asked: the draft may have been deleted by the change — never 修改 on a card that
        // isn't there. 共振 instead, which asks again on a tap.
        await gate.open(true)
        await again.value
        #expect(lookup.state == .failed)
    }

    /// A read that never answers — and doesn't hear that it is no longer wanted, as Firestore's
    /// doesn't — the way a hung connection leaves it.
    @MainActor final class Hung {
        private(set) var asked = 0
        private var waiting: [CheckedContinuation<DraftService.Resonance?, Never>] = []
        func read() async -> DraftService.Resonance? {
            asked += 1
            return await withCheckedContinuation { waiting.append($0) }
        }
        func release() {
            waiting.forEach { $0.resume(returning: nil) }
            waiting = []
        }
    }

    @Test(.timeLimit(.minutes(1))) func aLookupThatHangsIsAFailureTooNeverADimmedButtonForGood() async {
        let lookup = ResonanceLookup(retries: [.milliseconds(5)], patience: .milliseconds(60))
        let hung = Hung()
        defer { hung.release() }
        await lookup.look { await hung.read() }
        // Each try gave up after its patience, and was tried again: then there to tap.
        #expect(hung.asked == 2)
        #expect(lookup.state == .failed)

        // A tap whose read hangs as well: the button stops inking, a quiet line says so.
        #expect(await !lookup.askOnTap { await hung.read() })
        #expect(!lookup.asking)
        #expect(lookup.tapFailed)
        #expect(lookup.state == .failed)

        // The hung reads answering late change nothing; the next tap is answered.
        hung.release()
        try? await Task.sleep(for: .milliseconds(20))
        #expect(lookup.state == .failed)
        #expect(await lookup.askOnTap { nil })
        #expect(lookup.state == .found(nil))
    }

    @Test(.timeLimit(.minutes(1))) func aLookupLeftBehindEndsAtOnceThoughItsReadHangs() async {
        let lookup = ResonanceLookup(retries: [.seconds(60)], patience: .seconds(60))
        let hung = Hung()
        defer { hung.release() }
        let ended = Flag()
        // The page moved on (another card, a change): the lookup for the old one is cancelled, and
        // ends then — not when its read finally answers.
        let left = Task { await lookup.look { await hung.read() }; ended.on = true }
        #expect(await eventually { hung.asked == 1 })
        left.cancel()
        #expect(await eventually(within: .seconds(2)) { ended.on })
        #expect(lookup.state == .looking)
    }
}
