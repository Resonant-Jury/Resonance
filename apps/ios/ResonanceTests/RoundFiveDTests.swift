import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit
import Testing
@testable import Resonance

/// The two-pane Messages' lines (round 5 D4): the detail pane's bar line starts where the vertical
/// rule is, so the cut it starts from has to lie on the rule as drawn, wherever its wave is.
@Suite struct PaneLinesTests {
    @Test func theRulesCrossingIsOnTheRuleAsDrawn() {
        for height in [640.0, 812, 1032] {
            let rule = PaneRuleGeometry(height: height)
            // A hair's width round the drawn curve: the point found must be on it.
            let drawn = rule.path.strokedPath(StrokeStyle(lineWidth: 0.2))
            for y in stride(from: 0.0, through: height, by: 7.3) {
                let x = rule.x(at: y)
                #expect(drawn.contains(CGPoint(x: x, y: y)), "height \(height), y \(y): x \(x)")
                // 2 to either side of the gutter's middle at most.
                #expect(abs(x - Double(PaneLines.gutter) / 2) <= 2.0001)
            }
        }
    }

    @Test func theRuleStartsOnTheGuttersMiddle() {
        #expect(PaneRuleGeometry(height: 900).x(at: 0) == Double(PaneLines.gutter) / 2)
    }
}

/// A Resonance card embedded in a story is drawn as a chat shares it (round 5 D2): an anonymous one
/// shows the anonymous mark and name, never its author.
@MainActor @Suite struct EmbeddedCardBylineTests {
    @Test func anAnonymousCardNamesNoOne() {
        let byline = CardByline.of(Fixture.card("a", anonymous: true))
        #expect(byline.isAnonymous)
        #expect(byline.name == L10n.Card.anonymousAuthor)
        #expect(byline.imageURL == nil)
    }

    @Test func aNamedCardShowsItsAuthor() {
        let byline = CardByline.of(Fixture.card("b", by: "bob"))
        #expect(!byline.isAnonymous)
        #expect(byline.name == "bob")
    }
}

/// A bar's row clears the window's controls (an iPad's app in a window) by what the corner adds to
/// the plain safe area, never less than nothing — and by nothing where no controls are.
@Suite struct WindowControlsInsetTests {
    @Test func padsByWhatTheCornerAdds() {
        let plain = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0)
        let adapted = NSDirectionalEdgeInsets(top: 0, leading: 17.5, bottom: 0, trailing: 0)
        #expect(WindowControlsInset.added(adapted: adapted, plain: plain) == WindowControlsInset(leading: 18, trailing: 0))
        // Full screen, a phone, a row the controls don't reach: the regions agree.
        #expect(WindowControlsInset.added(adapted: plain, plain: plain) == .zero)
        // A safe area of its own (a landscape phone's notch) is the row's pad's business, not this.
        let notch = NSDirectionalEdgeInsets(top: 0, leading: 59, bottom: 0, trailing: 59)
        #expect(WindowControlsInset.added(adapted: notch, plain: notch) == .zero)
    }
}
