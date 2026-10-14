import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
@testable import Resonance

/// The wide card page's table of contents, the writer's toolbar wave, a reply's swipe, the cover
/// shimmer's colour and the bars' titles — the numbers each is drawn by, as the web has them.
@MainActor @Suite struct ReaderChromeTests {
    // MARK: Table of contents

    @Test func theContentsAreTheStorysOwnH2AndH3InOrderEachByItsPlace() {
        let blocks = StoryParser.parse("""
        # A title the web leaves out

        Words.

        ## One

        ### One and a half

        > ## A heading in a quote stays the quote's

        #### Too deep for the contents

        ##

        ## Two
        """)
        let entries = TocEntry.entries(blocks)
        #expect(entries.map(\.text) == ["One", "One and a half", "Two"])
        #expect(entries.map(\.level) == [2, 3, 2])
        // Each names the block the page scrolls to.
        for entry in entries {
            guard case .heading = blocks[entry.index] else {
                Issue.record("entry \(entry.text) points at a block that is no heading")
                continue
            }
            #expect(blocks[entry.index].headingText?.trimmingCharacters(in: .whitespaces) == entry.text)
        }
    }

    @Test func theStretchOfTheRuleIsTheWebsThumb() {
        // Everything shows, or the range is a sub-pixel's: no stretch at all.
        #expect(ScrollThumb(offset: 0, content: 300, visible: 300, track: 300) == nil)
        #expect(ScrollThumb(offset: 0, content: 306, visible: 300, track: 300) == nil)
        #expect(ScrollThumb(offset: 0, content: 400, visible: 0, track: 0) == nil)
        // A third of the list in view: a third of the track, at the top, then at the foot.
        let top = ScrollThumb(offset: 0, content: 900, visible: 300, track: 300)
        #expect(top?.length == 100)
        #expect(top?.top == 0)
        #expect(top?.range == 600)
        #expect(ScrollThumb(offset: 600, content: 900, visible: 300, track: 300)?.top == 200)
        #expect(ScrollThumb(offset: 300, content: 900, visible: 300, track: 300)?.top == 100)
        // Never shorter than 36, and an overscroll holds it at the ends.
        #expect(ScrollThumb(offset: 0, content: 30_000, visible: 300, track: 300)?.length == 36)
        #expect(ScrollThumb(offset: -40, content: 900, visible: 300, track: 300)?.top == 0)
        #expect(ScrollThumb(offset: 700, content: 900, visible: 300, track: 300)?.top == 200)
    }

    @Test func draggingTheStretchAsksForTheOffsetThatPutsItThere() {
        let thumb = ScrollThumb(offset: 0, content: 900, visible: 300, track: 300)!
        #expect(thumb.offset(forThumbTop: 0, track: 300) == 0)
        #expect(thumb.offset(forThumbTop: 100, track: 300) == 300)
        #expect(thumb.offset(forThumbTop: 200, track: 300) == 600)
        // Past either end of the track: the list's own ends.
        #expect(thumb.offset(forThumbTop: -50, track: 300) == 0)
        #expect(thumb.offset(forThumbTop: 260, track: 300) == 600)
        // The inverse of the stretch's place.
        let mid = ScrollThumb(offset: 240, content: 900, visible: 300, track: 300)!
        #expect(abs(mid.offset(forThumbTop: mid.top, track: 300) - 240) < 0.001)
    }

    @Test func aListFadesOnlyTowardWhereItCanStillScroll() {
        func ends(_ offset: CGFloat, _ content: CGFloat) -> [Bool] {
            let e = ScrollEdgeFades.edges(offset: offset, content: content, visible: 300)
            return [e.above, e.below]
        }
        #expect(ends(0, 300) == [false, false])
        #expect(ends(0, 600) == [false, true])
        #expect(ends(150, 600) == [true, true])
        #expect(ends(300, 600) == [true, false])
        // A point's range is no scroll.
        #expect(ends(0, 301) == [false, false])
    }

    // MARK: The writer

    @Test func theToolbarWaveTakesATurnPerEightyPoints() {
        // The web's ruleSteps: 4 to 12 turns, the old ten until measured.
        #expect(ToolbarWave.steps(width: 0) == 10)
        #expect(ToolbarWave.steps(width: 340) == 4)
        #expect(ToolbarWave.steps(width: 362) == 5)
        #expect(ToolbarWave.steps(width: 400) == 5)
        #expect(ToolbarWave.steps(width: 760) == 10)
        #expect(ToolbarWave.steps(width: 2000) == 12)
        #expect(ToolbarWave.steps(width: 120) == 4)
    }

    // MARK: A reply's swipe

    @Test func aReplysSwipeGivesWithResistanceAndTakesPastItsThreshold() {
        #expect(ReplySwipeMath.pulled(-20) == 0)
        #expect(ReplySwipeMath.pulled(40) == 40)
        #expect(ReplySwipeMath.pulled(500) == ReplySwipeMath.maxPull)
        #expect(ReplySwipeMath.shown(40) == 40)
        #expect(ReplySwipeMath.shown(56) == 56)
        #expect(abs(ReplySwipeMath.shown(86) - 65) < 0.001)
        #expect(!ReplySwipeMath.takes(55))
        #expect(ReplySwipeMath.takes(56))
        #expect(ReplySwipeMath.progress(28) == 0.5)
        #expect(ReplySwipeMath.progress(100) == 1)
        // Let go, the message is drawn exactly where it stands.
        #expect(ReplySwipeMath.shown(ReplySwipeMath.pulled(0)) == 0)
    }

    @Test func aListSetAsideFromItsEdgeIsNoticed() {
        // The owner's thread: the whole list 16 to the left, their face cut by the screen's edge.
        #expect(ReplySwipeMath.drifted(offsetX: 16))
        #expect(ReplySwipeMath.drifted(offsetX: -3))
        #expect(!ReplySwipeMath.drifted(offsetX: 0))
        #expect(!ReplySwipeMath.drifted(offsetX: 0.25))
    }

    // MARK: The cover's shimmer

    @Test func aCardsShimmerMeetsTheCreamInOKLabNotByHue() {
        // A lavender card's light stays lavender (it swung through red to pink by hue), a blue
        // one's blue (it went green), on the line between the card's shade and the cream.
        let lavender = SkeletonBlock.highlightOKLCH(290)
        #expect(abs(lavender.H - 297.3) < 0.5)
        let blue = SkeletonBlock.highlightOKLCH(215)
        #expect(blue.H > 200 && blue.H < 230)
        #expect(abs(lavender.L - (0.88 + 0.965) / 2) < 0.0001)
        // Mixing pulls the chroma in: under the average of the two, as a straight line in OKLab does.
        #expect(lavender.C < (0.08 + 0.015) / 2)
        // No hue: the theme's terracotta-light, oklch(88% .08 55), with the cream.
        let theme = SkeletonBlock.highlightOKLCH(nil)
        #expect(theme.H == SkeletonBlock.highlightOKLCH(55).H)
        #expect(abs(theme.H - 58.2) < 0.5)
    }

    // MARK: Bars

    @Test func aCJKTitleBesideTheArrowIsLiftedByTheFacesOwnMetrics() {
        // Playfair's line box has its middle 0.416em over the baseline, the ideographs' em box
        // 0.38em: at the phone bar's 20 the title goes up by about 0.7pt, level with the arrow.
        let lift = BarTitleMetrics.arrowLift(size: 20)
        #expect(lift > 0.6 && lift < 0.8)
        #expect(abs(BarTitleMetrics.arrowLift(size: 40) - 2 * lift) < 0.0001)
    }

    @Test func aTabletHeadersContextIsAStepOverTheInlineTitle() {
        #expect(HeaderContextTitle.size == 19)
    }
}
