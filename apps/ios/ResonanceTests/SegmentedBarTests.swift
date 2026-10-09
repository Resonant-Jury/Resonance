import DesignSystem
import Testing
@testable import Resonance

/// The card page's actions are one segmented row sharing the column evenly, none narrower than its
/// words (a glyph alone taking only its own room); the bookmark in it flips at once.
@MainActor @Suite struct SegmentedBarTests {
    @Test func theBarIsSharedEvenlyNoSegmentNarrowerThanItsWords() {
        // Three that fit: even thirds.
        #expect(SegmentWidths.resolve(ideal: [80, 100, 60], flexible: [true, true, true], total: 360) == [120, 120, 120])
        // Words wider than a share keep their width, the rest share what is left.
        #expect(SegmentWidths.resolve(ideal: [80, 200, 60], flexible: [true, true, true], total: 360) == [80, 200, 80])
        // A glyph alone takes only its own room.
        #expect(SegmentWidths.resolve(ideal: [90, 110, 48], flexible: [true, true, false], total: 348) == [150, 150, 48])
        #expect(SegmentWidths.overflows(ideal: [110, 130, 120], room: 340))
        #expect(!SegmentWidths.overflows(ideal: [110, 130, 90], room: 340))
    }

    @Test func aChoicesUnchosenSideIsTheMutedInkDeepened() {
        // The publish panel's audience: color-mix(in oklch, text-muted, black 10%), a token like every mix.
        #expect(Tokens.segmentIdleInk == OKLCHColor.color(0.52 * 0.9, 0.04 * 0.9, 70))
    }

    @Test func aBookmarkFlipsAtOnceAndSettlesOnWhatTheWriteSays() {
        var mark = BookmarkState()
        mark.found(false)
        let saving = mark.flip()
        #expect(saving && mark.active)
        mark.settled(saving: saving, result: nil)
        #expect(!mark.active, "a failed write puts it back")
        _ = mark.flip()
        mark.settled(saving: true, result: true)
        #expect(mark.active)
    }
}
