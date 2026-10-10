import DesignSystem
import ResonanceKit
import SwiftUI
import Testing
@testable import Resonance

/// The editor pane's grip at the split (round 5 E5): it resizes between 32 % and 50 %, past 32 % the
/// pane slides after the finger, under 18 % a release hides it, and a release between springs back.
@MainActor @Suite struct EditorSplitTests {
    let width: CGFloat = 1376

    /// The share shown with the boundary at `share` of the width from the trailing edge.
    private func at(_ share: CGFloat) -> EditorSplit.Drag {
        EditorSplit.drag(to: width * (1 - share), width: width)
    }

    @Test func between32And50PercentTheDragResizesThePane() {
        for share: CGFloat in [0.32, 0.4, 0.5] {
            let drag = at(share)
            #expect(abs(drag.width - share) < 0.0001 && abs(drag.shown - share) < 0.0001)
            #expect(!drag.hides)
        }
        // Past half the pane stops growing: the map keeps at least half.
        #expect(at(0.7).width == EditorSplit.maxFraction && at(0.7).shown == EditorSplit.maxFraction)
    }

    @Test func pastTheMinimumThePaneSlidesAfterTheFingerAtItsNarrowest() {
        let drag = at(0.25)
        #expect(drag.width == EditorSplit.minFraction)
        #expect(abs(drag.shown - 0.25) < 0.0001)
        #expect(!drag.hides)
        // Beyond the trailing edge nothing shows, never a negative share.
        #expect(EditorSplit.drag(to: width + 40, width: width).shown == 0)
    }

    @Test func under18PercentShownTheReleaseHidesThePane() {
        #expect(at(0.17).hides && at(0.05).hides && at(0).hides)
        #expect(!at(0.181).hides && !at(0.19).hides)
        #expect(EditorSplit.release(shown: 0.17) == .hide)
        #expect(EditorSplit.release(shown: 0) == .hide)
    }

    @Test func aReleaseBetween18And32PercentSpringsBackTo32() {
        #expect(EditorSplit.release(shown: 0.18) == .resize(EditorSplit.minFraction))
        #expect(EditorSplit.release(shown: 0.3) == .resize(EditorSplit.minFraction))
        #expect(EditorSplit.release(shown: 0.42) == .resize(0.42))
        #expect(EditorSplit.release(shown: 0.5) == .resize(0.5))
    }

    @Test func voiceOverStepsTheWidthWithinTheLimits() {
        #expect(abs(EditorSplit.adjusted(0.4, steps: 1) - 0.45) < 0.0001)
        #expect(EditorSplit.adjusted(0.48, steps: 1) == EditorSplit.maxFraction)
        #expect(EditorSplit.adjusted(0.34, steps: -1) == EditorSplit.minFraction)
    }

    @Test func aTapOrADragTowardTheLeadingSideShowsTheDockedPaneAgain() {
        #expect(EditorSplit.showsAgain(translation: .zero))
        #expect(EditorSplit.showsAgain(translation: CGSize(width: 3, height: -4)))
        #expect(EditorSplit.showsAgain(translation: CGSize(width: -40, height: 10)))
        // Drawn toward the edge, or only up and down: it stays docked.
        #expect(!EditorSplit.showsAgain(translation: CGSize(width: 30, height: 0)))
        #expect(!EditorSplit.showsAgain(translation: CGSize(width: -4, height: 60)))
    }
}

/// When the map's visible width settles beside the editor pane, the card the pane shows glides to the
/// centre of the map's visible area, at the same zoom (round 5 E5).
@MainActor @Suite struct MapCentringTests {
    let card = mapNodeRect(400, -120)

    @Test func theCardSitsAtTheCentreOfTheNarrowedMapAtTheSameZoom() {
        let camera = MapCamera(x: -35, y: 60, s: 0.8)
        // The map beside a pane at half of a 1376-wide window.
        let size = CGSize(width: 688, height: 1032)
        let centred = ThoughtMapStore.centred(camera, on: card, in: size)
        #expect(centred.s == camera.s)
        let middle = screenToWorld(centred, 344, 516)
        #expect(abs(middle.x - (card.x + card.w / 2)) < 0.0001 && abs(middle.y - (card.y + card.h / 2)) < 0.0001)
    }

    @Test func theGlideEasesOutAndEndsOnTheCentredCamera() {
        let from = MapCamera(x: 0, y: 0, s: 1.2)
        let to = MapCamera(x: -300, y: 120, s: 1.2)
        #expect(ThoughtMapStore.glided(from: from, to: to, progress: 0) == from)
        #expect(ThoughtMapStore.glided(from: from, to: to, progress: 1) == to)
        // Past the end it stays there.
        #expect(ThoughtMapStore.glided(from: from, to: to, progress: 1.4) == to)
        // Ease-out: more than half the way in the first half of the time; the zoom never changes.
        let half = ThoughtMapStore.glided(from: from, to: to, progress: 0.5)
        #expect(half.x < -150 && half.y > 60 && half.s == 1.2)
        #expect(ThoughtMapStore.glideDuration == 0.3)
    }
}

/// On a tablet a conversation opened from anywhere but the Messages tab is the Messages tab's
/// (round 5 E3); a phone pushes it where it is.
@MainActor @Suite struct ThreadPlacementTests {
    let thread = Route.thread(handle: "ios_ben", uid: "ios-ben", note: nil)

    @Test func aTabletOpensItInMessagesFromAnyOtherTab() {
        for layout: LayoutClass in [.medium, .expanded] {
            for tab: AppTab in [.feed, .notifications, .cardBox] {
                #expect(ThreadPlacement.opensInMessages(thread, from: tab, layout: layout))
            }
            let note = Route.thread(handle: "ios_ben", uid: nil, note: MessagingAPI.NoteRef(cardId: "c", noteId: "n"))
            #expect(ThreadPlacement.opensInMessages(note, from: .notifications, layout: layout))
        }
    }

    @Test func inTwoPanesTheMessagesTabsOwnPagesChooseItBesideTheList() {
        #expect(ThreadPlacement.opensInMessages(thread, from: .messages, layout: .expanded))
        // Medium: pushed over the list on the Messages stack, as it always was.
        #expect(!ThreadPlacement.opensInMessages(thread, from: .messages, layout: .medium))
    }

    @Test func aPhoneAndEveryOtherPageAreUnchanged() {
        for tab: AppTab in [.feed, .messages, .notifications, .cardBox] {
            #expect(!ThreadPlacement.opensInMessages(thread, from: tab, layout: .compact))
        }
        for route: Route in [.card("a-card"), .author("ios_ben"), .settings, .thoughtMap] {
            #expect(!ThreadPlacement.opensInMessages(route, from: .notifications, layout: .expanded))
        }
    }
}

/// A tablet's air under the header and its pull to refresh (round 5 E2).
@MainActor @Suite struct TabletAirTests {
    @Test func aTabletPagesFirstContentStarts32UnderTheHeadersLine() {
        // The scrolled content begins at the bar's foot, whose line rests its depth above it.
        #expect(HeaderEdge.lineDepth == 1.4 + Tokens.ink)
        #expect(abs(HeaderChrome.contentTop + HeaderEdge.lineDepth - 32) < 0.0001)
    }

    @Test func aTabletsLoaderAndItsGapAreHalfAgainAPhones() {
        let phone = RefreshPull(gap: RefreshPull.dock, refreshing: true)
        let tablet = RefreshPull(gap: RefreshPull.dock * RefreshPull.tablet, refreshing: true, factor: RefreshPull.tablet)
        #expect(phone.loaderSize == RefreshPull.size && tablet.loaderSize == RefreshPull.size * 1.5)
        #expect(tablet.kept == 90 && phone.kept == 60)
        // The list keeps 30 more open over the system's 60 while a tablet's refresh runs; a phone's none.
        #expect(RefreshPull.extraRoom(factor: RefreshPull.tablet) == 30 && RefreshPull.extraRoom(factor: 1) == 0)
        // Centred in the taller gap, then riding above the list as a phone's does.
        #expect(abs(tablet.center - 45) < 0.001)
        let pulled = RefreshPull(gap: 200, factor: RefreshPull.tablet)
        #expect(abs(pulled.center - 155) < 0.001)
        // Fading out with the taller gap as the list eases back up.
        #expect(RefreshPull(gap: 45, ending: true, factor: RefreshPull.tablet).opacity == 0.5)
    }
}
