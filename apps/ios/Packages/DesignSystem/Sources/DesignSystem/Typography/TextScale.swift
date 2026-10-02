import Observation
import SwiftUI
import UIKit

/// How far the person's text size is let to grow the app's type.
///
/// Dynamic Type takes body text to 3.1× at its largest accessibility size, and
/// the interface (tab bar, pills, buttons, the cards' bands) is not drawn for
/// that — it turns hard to use, where Instagram and LINE hold their own type
/// back. So the system's factor `s` is halved above 1 and capped: 1.15 gives
/// 1.075, 1.3 gives 1.15, 1.5 gives 1.25, and nothing goes past 1.25. A text
/// size below the default is followed as it is. Android applies the same curve
/// to its font scale (`textScale`), so the two apps agree.
///
/// Every text the person reads takes the factor of its own text style — the
/// platform fonts (`AppFonts.font`) and the CSS-line-box text (`CSSText`, the
/// story prose) alike, so a card's title grows exactly as much as the rest.
public nonisolated enum TextScale {
    /// The most any text grows beyond its drawn size.
    public static let ceiling: CGFloat = 1.25

    /// The curve: the system's factor in, the factor the app applies out.
    public static func effective(system: CGFloat) -> CGFloat {
        system <= 1 ? system : min(1 + (system - 1) / 2, ceiling)
    }

    /// What the system itself would scale `style` by in `category` (1 at the
    /// default size). Each style keeps its own relative growth: titles grow
    /// less than body text, as they do on the system's own screens.
    public static func system(relativeTo style: UIFont.TextStyle, in category: UIContentSizeCategory) -> CGFloat {
        let traits = UITraitCollection(preferredContentSizeCategory: category)
        // 100 rather than 1: for one point the metrics answer in steps of a third (1, 1.33, 1.67…).
        return UIFontMetrics(forTextStyle: style).scaledValue(for: 100, compatibleWith: traits) / 100
    }

    /// The factor for `style` at the person's current text size. Reading it in
    /// a view's body makes the view re-run when the size changes.
    @MainActor public static func factor(relativeTo style: UIFont.TextStyle) -> CGFloat {
        effective(system: system(relativeTo: style, in: TextSizeSetting.shared.category))
    }
}

/// The person's text size, watched. A `Font(UIFont)` is a fixed size, not a
/// text style SwiftUI re-resolves when Dynamic Type changes, so a view that
/// sets one would keep the old size until something else re-ran it. Reading
/// `category` through `TextScale.factor` registers that dependency instead.
@MainActor @Observable final class TextSizeSetting {
    static let shared = TextSizeSetting()

    private(set) var category: UIContentSizeCategory

    private init() {
        category = UIApplication.shared.preferredContentSizeCategory
        Task {
            for await _ in NotificationCenter.default.notifications(named: UIContentSizeCategory.didChangeNotification) {
                category = UIApplication.shared.preferredContentSizeCategory
            }
        }
    }
}
