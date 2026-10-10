import SwiftUI

/// The width classes (design §8): the web's breakpoints, decided from the window's measured width —
/// never the device or `UIScreen` (an iPad window can be any width from a third of the screen up).
public nonisolated enum LayoutClass: Sendable, Equatable {
    case compact, medium, expanded

    /// compact < 600 ≤ medium < 900 ≤ expanded.
    public static func of(_ width: CGFloat) -> LayoutClass {
        width < Tokens.bpMedium ? .compact : width < Tokens.bpExpanded ? .medium : .expanded
    }

    /// The writer and the thought map side by side (the web's ≥ 1200 workspace).
    public static func writerSplit(_ width: CGFloat) -> Bool { width >= Tokens.bpWide }

    /// The side rail stands in for the tab bar from medium up.
    public var sideRail: Bool { self != .compact }

    /// The page's side padding for a window `width` (the web's `--page-pad-x`: clamp(20, 4vw, 48)).
    public static func pad(_ width: CGFloat) -> CGFloat { min(max(width * 0.04, 20), 48) }

    /// How many bordered cards across: 2 or 3 on expanded (3 from 960 of content), bands (1) otherwise.
    public static func feedColumns(_ layout: LayoutClass, contentWidth: CGFloat) -> Int {
        layout == .expanded ? (contentWidth >= Tokens.feedThreeColMin ? 3 : 2) : 1
    }

    /// The widest a chat bubble's row may be in a thread list `listWidth` wide.
    public static func bubbleMax(_ listWidth: CGFloat) -> CGFloat {
        min((listWidth - 32) * 0.72, Tokens.bubbleMax)
    }

    /// The bordered grid's content width beside the rail: at most 1200 with the page's pads inside it.
    public static func feedContentWidth(window: CGFloat, rail: CGFloat) -> CGFloat {
        max(0, min(window - rail, 1200) - 2 * pad(window))
    }

    /// The side inset that keeps content in a centred `measure` column inside `width`, never under `pad`.
    public static func columnInset(_ width: CGFloat, measure: CGFloat = Tokens.measure, pad: CGFloat) -> CGFloat {
        max(pad, (width - measure) / 2)
    }

    /// Which column (of `columns`) the card at `index` goes in: row-major, as the web's CardLinkGrid.
    public static func column(of index: Int, columns: Int) -> Int { columns > 0 ? index % columns : 0 }
}

/// The window as the app's root measured it, handed to every page.
public nonisolated struct WindowLayout: Sendable, Equatable {
    public var width: CGFloat
    public var height: CGFloat

    public init(width: CGFloat, height: CGFloat) {
        self.width = width
        self.height = height
    }

    public var layoutClass: LayoutClass { .of(width) }
    public var sideRail: Bool { layoutClass.sideRail }
    public var pad: CGFloat { LayoutClass.pad(width) }
    /// What the pages beside the rail (or above the tab bar) have across.
    public var contentWidth: CGFloat { max(0, width - (sideRail ? Tokens.sideRailW : 0)) }
    public var writerSplit: Bool { LayoutClass.writerSplit(width) }

    /// A phone in portrait: what every view assumed before windows could be wide.
    public static let phone = WindowLayout(width: 390, height: 844)
}

extension EnvironmentValues {
    /// The window's measured size (set once at the root, from its geometry).
    @Entry public var window: WindowLayout = .phone
}

extension View {
    /// Keeps the scrolled content in a centred reading column of `measure` (plus the 20 of the content's
    /// own sides) on a window wider than a phone, while the scroll view stays the full width — its
    /// indicator at the window's edge. A compact window is left exactly as it was.
    public func readableColumn(_ measure: CGFloat = Tokens.measure) -> some View {
        modifier(ReadableColumn(measure: measure))
    }
}

private struct ReadableColumn: ViewModifier {
    let measure: CGFloat
    @Environment(\.window) private var window

    func body(content: Content) -> some View {
        if window.layoutClass == .compact {
            content
        } else {
            content.frame(maxWidth: measure + 40).frame(maxWidth: .infinity)
        }
    }
}

/// Where a card page's article and its author rail sit (design §11): on an expanded window a centred
/// container of at most 1200 (the page's pads inside) holding the article (its text ≤ 720) and, 48
/// past it, the 260 rail; narrower, one centred column of at most 760. `article` counts the
/// article's own 20 sides; `leading` and `railX` are from the page's leading edge.
public nonisolated struct CardPageLayout: Sendable, Equatable {
    public var rail: Bool
    public var article: CGFloat
    public var leading: CGFloat
    public var railX: CGFloat

    public init(rail: Bool, article: CGFloat, leading: CGFloat, railX: CGFloat) {
        self.rail = rail
        self.article = article
        self.leading = leading
        self.railX = railX
    }

    /// `width`: what the page has across (beside the side rail); `window`: the window's width.
    public static func of(width: CGFloat, window: CGFloat) -> CardPageLayout {
        guard LayoutClass.of(window) == .expanded else {
            let article = min(width, 760)
            return CardPageLayout(rail: false, article: article, leading: (width - article) / 2, railX: 0)
        }
        let inner = min(width, 1200) - 2 * LayoutClass.pad(window)
        let text = max(0, min(720, inner - 48 - Tokens.cardRailW))
        let start = (width - (text + 48 + Tokens.cardRailW)) / 2
        return CardPageLayout(rail: true, article: text + 40, leading: start - 20, railX: start + text + 48)
    }
}

extension View {
    /// The hardware keyboard's Esc (and ⌘.) does `action` — a modal or a menu closes, as its backdrop
    /// does. A control nobody sees holds the shortcut (VoiceOver's escape is the view's own action).
    public func onEscapeKey(_ action: @escaping () -> Void) -> some View {
        background {
            Button("", action: action)
                .keyboardShortcut(.cancelAction)
                .opacity(0)
                .frame(width: 0, height: 0)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

extension View {
    /// A page head over a grid of cards (a card box, a profile): on a window wider than a phone it
    /// lines up with the grid — the same centred 1200 and the page's pad — rather than the window's
    /// edge. A compact window is left exactly as it was.
    public func alignedWithCardGrid(phonePadding: CGFloat = 20) -> some View {
        modifier(GridAligned(phonePadding: phonePadding))
    }
}

private struct GridAligned: ViewModifier {
    let phonePadding: CGFloat
    @Environment(\.window) private var window

    func body(content: Content) -> some View {
        if window.layoutClass == .compact {
            content.padding(.horizontal, phonePadding)
        } else {
            content
                .padding(.horizontal, window.pad)
                .frame(maxWidth: 1200, alignment: .leading)
                .frame(maxWidth: .infinity)
        }
    }
}
