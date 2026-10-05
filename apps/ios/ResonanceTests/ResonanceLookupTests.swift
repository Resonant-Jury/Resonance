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

    @Test func lookingAgainKeepsTheAnswerOnScreen() async {
        let lookup = ResonanceLookup(retries: [.milliseconds(5)])
        let mine = DraftService.Resonance(id: "r1", published: false)
        await lookup.look { mine }
        // Asked again (after a change) and it fails: what was known stays.
        await lookup.look { throw Refused() }
        #expect(lookup.state == .found(mine))
    }
}
