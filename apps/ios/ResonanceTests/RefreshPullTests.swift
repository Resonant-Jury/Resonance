import DesignSystem
import Testing
import UIKit

/// What a pull to refresh draws (`RefreshPull`): the loop traced with the
/// pull and closed by the time the system starts the refresh, the dashes once
/// the finger lets go, fading out with the gap as the list eases back up —
/// and nothing over a list at rest.
@MainActor @Suite struct RefreshPullTests {
    @Test func aListAtRestOrScrolledIntoShowsNothing() {
        for gap: CGFloat in [0, -40, -600] {
            let pull = RefreshPull(gap: gap, pulling: true)
            #expect(pull.look == .none)
            #expect(pull.opacity == 0)
        }
        // A gap no finger made (a layout settling, a bar coming in) is no pull.
        #expect(RefreshPull(gap: 120).look == .none)
    }

    @Test func theLoopIsTracedWithThePullAndClosedBeforeTheSystemStarts() {
        var last = -1.0
        for gap in stride(from: 0, through: 240, by: 4) {
            let progress = RefreshPull(gap: CGFloat(gap), pulling: true).progress
            #expect(progress >= last)
            last = progress
        }
        #expect(RefreshPull(gap: 4, pulling: true).progress == 0)
        #expect(RefreshPull(gap: RefreshPull.reach, pulling: true).look == .tracing(1))
        // The system starts the refresh about 170 down: the loop is closed by then.
        #expect(RefreshPull(gap: 170, pulling: true).progress == 1)
        // Fading and growing in with the first part of the loop, never past full.
        #expect(RefreshPull(gap: 20, pulling: true).opacity < RefreshPull(gap: 50, pulling: true).opacity)
        #expect(RefreshPull(gap: 20, pulling: true).scale < 1 && RefreshPull(gap: 20, pulling: true).scale >= 0.8)
        #expect(RefreshPull(gap: 300, pulling: true).opacity == 1 && RefreshPull(gap: 300, pulling: true).scale == 1)
    }

    @Test func aPullLetGoOfBeforeTheLoopClosesUndrawsIt() {
        // Back the way it came, nothing started: the same loop, a little less each step.
        let out = RefreshPull(gap: 120, pulling: true), back = RefreshPull(gap: 60, pulling: true)
        guard case let .tracing(further) = out.look, case let .tracing(nearer) = back.look else {
            Issue.record("a pull is traced")
            return
        }
        #expect(nearer < further)
        #expect(RefreshPull(gap: 0, pulling: true).look == .none)
    }

    @Test func aRefreshStartedUnderTheFingerTravelsOnceItLetsGo() {
        #expect(RefreshPull(gap: 180, refreshing: true, holding: true).look == .tracing(1))
        let docked = RefreshPull(gap: RefreshPull.dock, refreshing: true)
        #expect(docked.look == .travelling)
        #expect(docked.opacity == 1)
        // Scrolled into while it runs: still running, out of sight with the gap.
        #expect(RefreshPull(gap: -80, refreshing: true).look == .travelling)
    }

    @Test func theFinishedRefreshFadesWithTheListEasingBackUp() {
        let leaving = RefreshPull(gap: RefreshPull.dock / 2, ending: true)
        #expect(leaving.look == .travelling)
        #expect(leaving.opacity == 0.5)
        #expect(RefreshPull(gap: 0, ending: true).look == .none)
        // Finished while still held: the loop, as the pull has it, until the finger lets go.
        #expect(RefreshPull(gap: 200, pulling: true, holding: true, ending: true).look == .tracing(1))
    }

    @Test func theLoaderSitsInTheMiddleOfTheGapThenRidesAboveTheList() {
        #expect(RefreshPull(gap: 0, pulling: true).center == 0)
        #expect(RefreshPull(gap: 36).center == 18)
        #expect(RefreshPull(gap: RefreshPull.dock).center == RefreshPull.dock / 2)
        // Pulled further than the room a refresh keeps: just above the list, never left behind at the top.
        #expect(RefreshPull(gap: 200).center == 200 - RefreshPull.dock / 2)
        #expect(RefreshPull(gap: -20).center == 0)
    }
}
