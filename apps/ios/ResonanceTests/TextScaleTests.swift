import DesignSystem
import Testing
import UIKit

@MainActor @Suite struct TextScaleTests {
    private func close(_ a: CGFloat, _ b: CGFloat) -> Bool { abs(a - b) < 0.001 }

    /// The owner's rule: follow a smaller size, half of what a larger one adds, never past 1.25.
    @Test func curveHalvesTheSystemsGrowthAndCapsIt() {
        #expect(close(TextScale.effective(system: 0.8), 0.8))
        #expect(close(TextScale.effective(system: 1), 1))
        #expect(close(TextScale.effective(system: 1.15), 1.075))
        #expect(close(TextScale.effective(system: 1.3), 1.15))
        #expect(close(TextScale.effective(system: 1.5), 1.25))
        #expect(close(TextScale.effective(system: 2), 1.25))
        #expect(close(TextScale.effective(system: 3.1), 1.25))
    }

    @Test func curveNeverJumpsOrShrinksAsTheSystemGrows() {
        var last: CGFloat = 0
        for step in 0...400 {
            let value = TextScale.effective(system: 0.7 + CGFloat(step) * 0.01)
            #expect(value >= last)
            last = value
        }
        #expect(close(TextScale.effective(system: 1.0001), 1.00005))
    }

    @Test func systemFactorIsThatOfTheStylesOwnCurve() {
        #expect(close(TextScale.system(relativeTo: .body, in: .large), 1))
        #expect(close(TextScale.system(relativeTo: .title1, in: .large), 1))
        // Body is 17pt at the default size and about 22.4pt at xxxLarge.
        let large = TextScale.system(relativeTo: .body, in: .extraExtraExtraLarge)
        #expect(large > 1.25 && large < 1.4)
        #expect(TextScale.system(relativeTo: .body, in: .extraSmall) < 1)
        // Titles grow less than body text at the same setting.
        let body = TextScale.system(relativeTo: .body, in: .accessibilityExtraExtraExtraLarge)
        let title = TextScale.system(relativeTo: .title1, in: .accessibilityExtraExtraExtraLarge)
        #expect(title < body)
        #expect(body > 2)
    }

    @Test func everyTextSizeEndsUpWithinTheCap() {
        let categories: [UIContentSizeCategory] = [
            .extraSmall, .small, .medium, .large, .extraLarge, .extraExtraLarge, .extraExtraExtraLarge,
            .accessibilityMedium, .accessibilityLarge, .accessibilityExtraLarge,
            .accessibilityExtraExtraLarge, .accessibilityExtraExtraExtraLarge,
        ]
        for style in [UIFont.TextStyle.body, .title1] {
            for category in categories {
                let factor = TextScale.effective(system: TextScale.system(relativeTo: style, in: category))
                #expect(factor <= TextScale.ceiling)
            }
        }
        // xxxLarge, the largest setting before the accessibility ones: half its growth.
        let system = TextScale.system(relativeTo: .body, in: .extraExtraExtraLarge)
        #expect(close(TextScale.effective(system: system), 1 + (system - 1) / 2))
        // The first accessibility size is already past the cap.
        #expect(close(TextScale.effective(system: TextScale.system(relativeTo: .body, in: .accessibilityMedium)), TextScale.ceiling))
    }

    /// CSS-line-box text takes the same factor as the platform fonts.
    @Test func scaledFontsFollowTheCurrentTextSize() {
        let factor = TextScale.factor(relativeTo: .body)
        let font = AppFonts.scaledUIFont(.body, size: 14)
        #expect(close(font.pointSize, 14 * factor))
        #expect(close(AppFonts.scaledUIFont(.heading, size: 18, relativeTo: .body).pointSize, 18 * factor))
        // The fixed face is what the thought map measures with.
        #expect(close(AppFonts.uiFont(.body, size: 14).pointSize, 14))
    }
}
