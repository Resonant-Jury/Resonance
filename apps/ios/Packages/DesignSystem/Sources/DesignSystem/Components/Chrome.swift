import SwiftUI
import UIKit

// Navigation chrome in the hand-drawn language. The skeleton stays the
// platform's (NavigationStack, edge swipe-back, tab semantics for VoiceOver);
// only the look is the brand's. Verified in spike S3.

/// One item of the organic tab bar.
public struct OrganicTabItem<ID: Hashable>: Identifiable {
    public let id: ID
    public let title: String
    public let icon: IconName
    /// A prominent action in the bar (the pen) rather than a tab.
    public var isAction: Bool
    public var badge: Int

    public init(id: ID, title: String, icon: IconName, isAction: Bool = false, badge: Int = 0) {
        self.id = id
        self.title = title
        self.icon = icon
        self.isAction = isAction
        self.badge = badge
    }
}

/// The tab bar, docked like the header and edged the same way: cream paper
/// that begins on a wavy pen line (``FooterEdge``), so the top and bottom
/// chrome are one pair and nothing floats or draws a frame. Tabs are the glyph
/// over its label; the selected one inks terracotta on a wash behind the
/// glyph cut like torn paper (wavy edges, lopsided corners, no rim). The pen
/// sits among them as a solid terracotta squircle the tabs' height — the one
/// filled thing in the bar, without a rim.
/// Re-implements what the system bar gives for free: selection haptics, tab
/// traits for VoiceOver, and the Large Content Viewer on long press.
public struct OrganicTabBar<ID: Hashable>: View {
    let items: [OrganicTabItem<ID>]
    let selection: ID
    let onSelect: (ID) -> Void

    /// The bar's height above the home indicator, without its wavy edge.
    public static var height: CGFloat { 60 }

    public init(items: [OrganicTabItem<ID>], selection: ID, onSelect: @escaping (ID) -> Void) {
        self.items = items
        self.selection = selection
        self.onSelect = onSelect
    }

    public var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if item.isAction {
                    actionButton(item)
                } else {
                    tabButton(item, index: index)
                }
            }
        }
        .padding(.horizontal, 6)
        .frame(height: Self.height)
        .padding(.top, HeaderEdge.height)
        .background { FooterEdge() }
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func tabButton(_ item: OrganicTabItem<ID>, index: Int) -> some View {
        let selected = item.id == selection
        return Button { onSelect(item.id) } label: {
            VStack(spacing: 3) {
                OrganicIcon(item.icon, size: 24)
                    .overlay(alignment: .topTrailing) {
                        // Where the web's chip hangs off its 34pt icon button.
                        if item.badge > 0 { UnreadBadge(count: item.badge).offset(x: 9, y: -8) }
                    }
                    .frame(width: 56, height: 32)
                    .background {
                        // A scrap of torn paper, not a pill: a radius well under half
                        // the height, wavy long edges and lopsided corners, each tab
                        // its own seed.
                        WobRectShape(radius: 12, seed: Double(index * 29 + 7), mag: 3.2, options: WobRectOptions(
                            curve: 1.2, cornerJitter: 3.6, cornerOffset: 3, segmentsH: .count(2), segmentsV: .count(1)))
                            .fill(Tokens.terracottaLight.opacity(0.55))
                            .opacity(selected ? 1 : 0)
                            .animation(.easeOut(duration: 0.16), value: selected)
                    }
                Text(item.title).font(AppFonts.body(10.5, weight: selected ? .semibold : .regular)).lineLimit(1)
            }
            .foregroundStyle(selected ? Tokens.terracotta : Tokens.textMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(TabPressStyle())
        .accessibilityLabel(item.badge > 0 ? "\(item.title), \(item.badge)" : item.title)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
        .accessibilityShowsLargeContentViewer { Label { Text(item.title) } icon: { OrganicIcon(item.icon) } }
    }

    /// The pen: a solid terracotta squircle as tall as a tab, the nib in cream; it darkens while pressed.
    private func actionButton(_ item: OrganicTabItem<ID>) -> some View {
        Button { onSelect(item.id) } label: {
            PenChip(icon: item.icon)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
        }
        .buttonStyle(PenPressStyle())
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(.isButton)
        .accessibilityShowsLargeContentViewer { Label { Text(item.title) } icon: { OrganicIcon(item.icon) } }
    }
}

/// A tab's press: the glyph's wash half-shown under the finger.
private struct TabPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.7 : 1)
    }
}

private struct PenPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .environment(\.penPressed, configuration.isPressed)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private extension EnvironmentValues {
    @Entry var penPressed = false
}

private struct PenChip: View {
    let icon: IconName
    @Environment(\.penPressed) private var pressed

    var body: some View {
        let shape = WobRectShape(radius: 17, seed: 3, mag: 1.1, options: WobRectOptions(
            curve: 1.3, cornerJitter: 3, cornerOffset: 2.4, segmentsH: .count(1), segmentsV: .count(1)))
        OrganicIcon(icon, size: 22, color: Tokens.cream)
            .frame(width: 56, height: 40)
            .background {
                shape.fill(Tokens.terracotta)
                GrainLayer(shape: shape, mode: .tile, opacity: 0.38, tile: "grain-button")
                shape.fill(Color.black.opacity(pressed ? 0.14 : 0))
            }
    }
}

/// The tab bar's backdrop and top edge — ``HeaderEdge`` turned over: the cream
/// begins on a wavy pen line (its own seed, 223) and runs down under the home
/// indicator, so content scrolled beneath shows right down to the line. The
/// line rests at half ink, like the header's before the page scrolls.
public struct FooterEdge: View {
    public init() {}

    public var body: some View {
        ZStack {
            FooterEdgeShape(closed: true).fill(Tokens.cream)
            FooterEdgeShape(closed: false)
                .stroke(Tokens.fieldBorderHover, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                .opacity(0.5)
        }
        .ignoresSafeArea(edges: .bottom)
        .accessibilityHidden(true)
    }
}

nonisolated struct FooterEdgeShape: Shape {
    var closed: Bool

    func path(in rect: CGRect) -> Path {
        let y0 = Double(rect.minY) + 1.4 + Double(Tokens.ink)
        let pts = wavyPoints(Double(rect.width), y0: y0, amp: 1.4, seed: 223, steps: 12)
            .map { CGPoint(x: Double(rect.minX) + $0.x, y: $0.y) }
        var p = Path()
        p.move(to: pts[0])
        for i in 1..<pts.count {
            let a = pts[i - 1], b = pts[i]
            let midX = (a.x + b.x) / 2
            p.addCurve(to: b, control1: CGPoint(x: midX, y: a.y), control2: CGPoint(x: midX, y: b.y))
        }
        if closed {
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            p.closeSubpath()
        }
        return p
    }
}

/// The web's unread chip (NotificationBell, MessagesEntry): a wobbly
/// terracotta tag with the count, wider once it takes two digits.
public struct UnreadBadge: View {
    let count: Int

    public init(count: Int) {
        self.count = count
    }

    public var body: some View {
        let h: CGFloat = 18
        Text("\(count)")
            .font(AppFonts.body(10, weight: .bold))
            .foregroundStyle(Tokens.cream)
            .frame(width: count > 9 ? 26 : 19, height: h)
            .background {
                WobRectShape(radius: h * 0.4, seed: 9, mag: 1.3, options: WobRectOptions(
                    curve: 1.5, cornerJitter: 3, cornerOffset: h * 0.06, segmentsH: .count(1), segmentsV: .count(1)))
                    .fill(Tokens.terracotta)
            }
            .accessibilityHidden(true)
    }
}

/// FloatingWriteButton's face: a wobbly terracotta rounded square — one
/// lopsided turn per side and drifting corners (the avatar's recipe) — with
/// the pen in cream.
public struct WriteButtonFace: View {
    let size: CGFloat
    let icon: IconName

    public init(size: CGFloat = 56, icon: IconName = .pen) {
        self.size = size
        self.icon = icon
    }

    public var body: some View {
        let shape = WobRectShape(radius: size * 0.4, seed: 3, mag: size * 0.022, options: WobRectOptions(
            curve: 1.3, cornerJitter: 3.2, cornerOffset: size * 0.06, segmentsH: .count(1), segmentsV: .count(1)))
        OrganicIcon(icon, size: 24, color: Tokens.cream)
            .frame(width: size, height: size)
            .background {
                shape.fill(Tokens.terracotta)
                shape.stroke(Tokens.terracottaInk, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
            }
    }
}

/// FloatingWriteButton: the pen fixed bottom-right of a browsing page (the
/// card page; on the tabs it lives in the bar).
public struct FloatingWriteButton: View {
    let label: String
    let action: () -> Void

    public init(label: String, action: @escaping () -> Void) {
        self.label = label
        self.action = action
    }

    public var body: some View {
        Button(action: action) { WriteButtonFace(size: 56) }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .padding(20)
    }
}

/// The root tabs' pinned bar (the web AppHeader on a phone): the brand
/// lockup on cream that ends on the wavy pen line, content scrolling under it.
/// A tab that names itself in the bar gives its `title`, which takes the
/// wordmark's place (the wave stays) and heads the screen for VoiceOver.
public struct OrganicBrandBar<Trailing: View>: View {
    let title: String?
    var scrolled: Bool
    let trailing: Trailing

    public init(title: String? = nil, scrolled: Bool = false, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.title = title
        self.scrolled = scrolled
        self.trailing = trailing()
    }

    public var body: some View {
        HStack(spacing: 10) {
            // ResonanceIcon: the wave glyph in the accent, nudged down 7% to
            // sit on the wordmark's visual centre.
            OrganicIcon(.wave, size: 38, color: Tokens.terracotta, strokeWidth: Tokens.ink)
                .offset(y: 38 * 0.07)
            if let title {
                Text(title)
                    .font(AppFonts.heading(22))
                    .tracking(-0.02 * 22)
                    .lineLimit(1)
                    .foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
            } else {
                Text(verbatim: "Resonance")
                    .font(AppFonts.heading(22))
                    .tracking(-0.02 * 22)
                    .foregroundStyle(Tokens.text)
            }
            Spacer(minLength: 12)
            trailing
        }
        .frame(minHeight: 44)
        .padding(.horizontal, 20)
        .padding(.top, 4)
        .padding(.bottom, HeaderEdge.height)
        .background { HeaderEdge(scrolled: scrolled) }
        .accessibilityElement(children: .contain)
    }
}

/// A root screen's page title (home's h1): Playfair 32 on a 1.1 line, set
/// tight, with an optional control at its end.
public struct OrganicLargeHeader<Trailing: View>: View {
    let title: String
    let trailing: Trailing

    public init(_ title: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.title = title
        self.trailing = trailing()
    }

    public var body: some View {
        let font = AppFonts.scaledUIFont(.heading, size: 32, weight: .bold)
        HStack(alignment: .center) {
            CSSText(title, font: font, lineHeight: 1.1, tracking: -0.02 * font.pointSize)
                .accessibilityAddTraits(.isHeader)
            trailing
        }
        .padding(.horizontal, 20)
    }
}

/// Pushed-screen bar (the web header taken over by a sub-screen): the bare
/// back arrow, then the screen's title set like the brand (or, with no title,
/// `leading` — the card page's author once the byline has scrolled away), then
/// any actions, as bare glyphs. The arrow goes back; a page that has something
/// to ask first takes it over with ``onBack(_:)``.
public struct OrganicInlineBar<Leading: View, Trailing: View>: View {
    let title: String
    let backLabel: String
    var scrolled: Bool
    let leading: Leading
    let trailing: Trailing
    private var back: (() -> Void)?
    @Environment(\.dismiss) private var dismiss

    public init(_ title: String, backLabel: String, scrolled: Bool = false,
                @ViewBuilder leading: () -> Leading, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.backLabel = backLabel
        self.scrolled = scrolled
        self.leading = leading()
        self.trailing = trailing()
    }

    /// What the arrow does instead of going back at once.
    public func onBack(_ action: @escaping () -> Void) -> Self {
        var bar = self
        bar.back = action
        return bar
    }

    public var body: some View {
        HStack(spacing: 10) {
            // The arrow's own 8pt pad sits in the gutter (margin-left −8 on the web).
            OrganicIconButton(.arrowRight, label: backLabel, size: 18, mirrored: true) { if let back { back() } else { dismiss() } }
                .padding(.leading, -13)
            if !title.isEmpty {
                Text(title)
                    .font(AppFonts.heading(22))
                    .tracking(-0.02 * 22)
                    .lineLimit(1)
                    .foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
            }
            leading
            Spacer(minLength: 8)
            // Bare glyphs sit on the page's 20 margin, as the arrow does on the other side.
            HStack(spacing: 0) { trailing }
                .padding(.trailing, -12)
        }
        .frame(minHeight: 44)
        .padding(.horizontal, 20)
        .padding(.top, 4)
        .padding(.bottom, HeaderEdge.height)
        .background { HeaderEdge(scrolled: scrolled) }
    }
}

extension OrganicInlineBar where Leading == EmptyView {
    public init(_ title: String, backLabel: String, scrolled: Bool = false, @ViewBuilder trailing: () -> Trailing) {
        self.init(title, backLabel: backLabel, scrolled: scrolled, leading: { EmptyView() }, trailing: trailing)
    }
}

extension OrganicInlineBar where Leading == EmptyView, Trailing == EmptyView {
    public init(_ title: String, backLabel: String, scrolled: Bool = false) {
        self.init(title, backLabel: backLabel, scrolled: scrolled, leading: { EmptyView() }, trailing: { EmptyView() })
    }
}

/// The web AppHeader's backdrop and bottom edge: the cream fill stops exactly
/// on the wavy pen line (the web masks its backdrop to the same curve), so
/// the line *is* the bar's edge — no band of fill below it, and content
/// scrolled beneath shows right up to the line. Reaches up under the status bar.
/// The line rests at half ink and darkens once the page has scrolled.
public struct HeaderEdge: View {
    /// Room under the bar's content for the wave (the web's HEADER_WAVE_H band).
    public static let height: CGFloat = 10
    var scrolled: Bool

    public init(scrolled: Bool = false) {
        self.scrolled = scrolled
    }

    public var body: some View {
        ZStack {
            HeaderEdgeShape(closed: true).fill(Tokens.cream)
            HeaderEdgeShape(closed: false)
                .stroke(Tokens.fieldBorderHover, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                .opacity(scrolled ? 1 : 0.5)
                .animation(.easeInOut(duration: 0.3), value: scrolled)
        }
        .ignoresSafeArea(edges: .top)
        .accessibilityHidden(true)
    }
}

extension View {
    /// Reports whether this scroll view has moved past the web header's 20pt
    /// threshold, for the bar's pen line.
    public func onHeaderScroll(_ scrolled: Binding<Bool>) -> some View {
        onScrollGeometryChange(for: Bool.self) { geo in
            geo.contentOffset.y + geo.contentInsets.top > 20
        } action: { _, isScrolled in
            scrolled.wrappedValue = isScrolled
        }
    }
}

/// The web header's curve (wavyPoints over the width, seed 211, 12 steps),
/// either as the stroke alone or as the fill from the top edge down to it.
nonisolated struct HeaderEdgeShape: Shape {
    var closed: Bool

    func path(in rect: CGRect) -> Path {
        let y0 = Double(rect.maxY) - 1.4 - Double(Tokens.ink)
        let pts = wavyPoints(Double(rect.width), y0: y0, amp: 1.4, seed: 211, steps: 12)
            .map { CGPoint(x: Double(rect.minX) + $0.x, y: $0.y) }
        var p = Path()
        if closed {
            p.move(to: CGPoint(x: rect.minX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            p.addLine(to: pts[pts.count - 1])
            for i in stride(from: pts.count - 2, through: 0, by: -1) {
                let a = pts[i + 1], b = pts[i]
                let midX = (a.x + b.x) / 2
                p.addCurve(to: b, control1: CGPoint(x: midX, y: a.y), control2: CGPoint(x: midX, y: b.y))
            }
            p.closeSubpath()
        } else {
            p.move(to: pts[0])
            for i in 1..<pts.count {
                let a = pts[i - 1], b = pts[i]
                let midX = (a.x + b.x) / 2
                p.addCurve(to: b, control1: CGPoint(x: midX, y: a.y), control2: CGPoint(x: midX, y: b.y))
            }
        }
        return p
    }
}

/// A bare hand-drawn icon control with a 44pt hit area — the web's header
/// buttons draw no frame around the glyph. The header's other actions (share,
/// ⋯) are bare glyphs too: a bar is chrome enough, so nothing in it draws a
/// frame of its own.
public struct OrganicIconButton: View {
    let icon: IconName
    let label: String
    var size: CGFloat
    /// Drawn flipped left-to-right (the web's back arrow is arrow-right mirrored).
    var mirrored: Bool
    let action: () -> Void

    public init(_ icon: IconName, label: String, size: CGFloat = 22, mirrored: Bool = false, action: @escaping () -> Void) {
        self.icon = icon
        self.label = label
        self.size = size
        self.mirrored = mirrored
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            OrganicIcon(icon, size: size)
                .scaleEffect(x: mirrored ? -1 : 1)
                .foregroundStyle(Tokens.text)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        // A press washes a wobbly squircle round the glyph, like every other control's.
        .buttonStyle(OrganicPressStyle())
        .accessibilityLabel(label)
    }
}

// MARK: - Swipe-back with hidden system bars

/// Hiding the navigation bar silently disables UIKit's edge swipe-back.
/// Re-enable it (and iOS 26's full-width content swipe) whenever there is
/// something to pop — the one piece of UIKit the organic chrome needs.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
        if #available(iOS 26.0, *) {
            interactiveContentPopGestureRecognizer?.delegate = self
        }
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard viewControllers.count > 1 else { return false }
        // A page with drags of its own (the thought map's canvas) goes back from the edge only.
        if #available(iOS 26.0, *), gestureRecognizer === interactiveContentPopGestureRecognizer,
           let top = topViewController, EdgeSwipeBack.pages.contains(top) {
            return false
        }
        // A page holding unsaved work doesn't leave by the swipe; it is asked instead, as the arrow does.
        if gestureRecognizer === interactivePopGestureRecognizer, let top = topViewController,
           let page = EdgeSwipeBack.guardOf(top), page.holds() {
            DispatchQueue.main.async { page.ask() }
            return false
        }
        return true
    }
}

/// Pages that go back from the screen's edge only (see `swipeBackFromEdgeOnly()`).
@MainActor enum EdgeSwipeBack {
    static let pages = NSHashTable<UIViewController>.weakObjects()
    /// Pages that take the swipe over while they hold something (see `takesSwipeBack(while:_:)`) keep their guard
    /// on the page itself, so it goes with the page: a table keyed weakly holds its values after the key is gone,
    /// and the guard's closures hold the writer's model — and its web view — with them.
    private static var guardKey: UInt8 = 0

    static func keep(_ page: SwipeBackGuard, on controller: UIViewController) {
        objc_setAssociatedObject(controller, &guardKey, page, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }

    static func guardOf(_ controller: UIViewController) -> SwipeBackGuard? {
        objc_getAssociatedObject(controller, &guardKey) as? SwipeBackGuard
    }

    /// The controller the navigation stack holds for the page `controller` sits in.
    static func page(of controller: UIViewController) -> UIViewController? {
        var page: UIViewController? = controller
        while let current = page, let parent = current.parent, !(parent is UINavigationController) {
            page = parent
        }
        guard let page, page.parent is UINavigationController else { return nil }
        return page
    }
}

/// What a page that takes the swipe over says: whether it does now, and what to do instead of going back.
@MainActor final class SwipeBackGuard {
    var holds: () -> Bool = { false }
    var ask: () -> Void = {}
}

extension View {
    /// iOS 26 lets a drag anywhere on a pushed page go back. On a page whose
    /// content is itself dragged — a canvas taking raw touches, like the
    /// thought map — that drag would leave the page, so this one keeps only
    /// the edge swipe.
    public func swipeBackFromEdgeOnly() -> some View {
        background(EdgeSwipeMarker(asks: nil).frame(width: 0, height: 0).accessibilityHidden(true))
    }

    /// A page that asks before it goes back (the writer, with words on it).
    /// While `holds()` is true the edge swipe leaves the page where it is and
    /// calls `ask` instead — the arrow's own question. The page goes back from
    /// the edge only, so a drag in its content never reads as leaving.
    public func takesSwipeBack(while holds: @escaping () -> Bool, _ ask: @escaping () -> Void) -> some View {
        background(EdgeSwipeMarker(asks: (holds, ask)).frame(width: 0, height: 0).accessibilityHidden(true))
    }
}

/// Finds the page it sits in (the controller the navigation stack holds) and files it under ``EdgeSwipeBack``.
private struct EdgeSwipeMarker: UIViewControllerRepresentable {
    /// Set by a page that takes the swipe over.
    let asks: (holds: () -> Bool, ask: () -> Void)?

    func makeUIViewController(context: Context) -> Marker { Marker(takesOver: asks != nil) }

    func updateUIViewController(_ controller: Marker, context: Context) {
        guard let asks else { return }
        controller.page.holds = asks.holds
        controller.page.ask = asks.ask
    }

    final class Marker: UIViewController {
        let page = SwipeBackGuard()
        private let takesOver: Bool

        init(takesOver: Bool) {
            self.takesOver = takesOver
            super.init(nibName: nil, bundle: nil)
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            guard let held = EdgeSwipeBack.page(of: self) else { return }
            EdgeSwipeBack.pages.add(held)
            if takesOver { EdgeSwipeBack.keep(page, on: held) }
        }
    }
}
