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
        OrganicTabButton(item: item, index: index, selected: item.id == selection) { onSelect(item.id) }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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

/// A tab as the bar draws it: the glyph over its label, the chosen one inked terracotta
/// on a wash cut like torn paper; under a pointer, the wash half-shown.
struct OrganicTabButton<ID: Hashable>: View {
    let item: OrganicTabItem<ID>
    let index: Int
    let selected: Bool
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
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
                            .opacity(selected ? 1 : hovered ? 0.45 : 0)
                            .animation(.easeOut(duration: 0.16), value: selected)
                            .animation(.easeOut(duration: 0.16), value: hovered)
                    }
                Text(item.title).font(AppFonts.body(10.5, weight: selected ? .semibold : .regular)).lineLimit(1)
            }
            .foregroundStyle(selected ? Tokens.terracotta : Tokens.textMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(TabPressStyle())
        .onHover { hovered = $0 }
        .accessibilityLabel(item.badge > 0 ? "\(item.title), \(item.badge)" : item.title)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
        .accessibilityShowsLargeContentViewer { Label { Text(item.title) } icon: { OrganicIcon(item.icon) } }
    }
}

/// What a page's bar leaves for the window's own chrome on a tablet (round 5 B2): from medium up the
/// tab group sits on the window's centre line and the pen at its trailing end, drawn once above
/// every stack (``OrganicTopTabs``, ``OrganicPenButton``), so a page's bar spans the whole width
/// and keeps its leading content left of the group and its own actions 8 before the pen. Nil on a
/// phone (the bottom tab bar), in the writer and in a pane's own bar.
public nonisolated struct HeaderChrome: Equatable, Sendable {
    /// The tab group's width (measured where it is drawn).
    public var groupWidth: CGFloat
    /// The pen's room at the trailing end, and the 8 before it.
    public var trailingReserve: CGFloat

    public init(groupWidth: CGFloat, trailingReserve: CGFloat = HeaderChrome.penReserve) {
        self.groupWidth = groupWidth
        self.trailingReserve = trailingReserve
    }

    /// The header's row under the status bar (above its wave band).
    public static let rowHeight: CGFloat = 56
    /// The pen chip (56) and 8 before it.
    public static let penReserve: CGFloat = 64
    /// A pushed page's title is dropped when less than this is left for it beside the arrow.
    public static let titleMin: CGFloat = 72

    /// How wide the leading content may be in a window `width` wide: up to 16 short of the group,
    /// `L = (W − G) / 2 − P − 16`.
    public static func leadingRoom(width: CGFloat, groupWidth: CGFloat) -> CGFloat {
        max(0, (width - groupWidth) / 2 - LayoutClass.pad(width) - 16)
    }

    /// The room the labelled group may take before it gives way to glyphs: `W − 2 × (P + 152)`.
    public static func labelRoom(width: CGFloat) -> CGFloat {
        max(0, width - 2 * (LayoutClass.pad(width) + 152))
    }
}

extension EnvironmentValues {
    /// Set on every stack while the header carries the tabs (``HeaderChrome``).
    @Entry public var headerChrome: HeaderChrome? = nil
}

/// The tablet header's tab group (round 5 B2, iPadOS 18's tabs at the top of the window): the four
/// tabs in the bar's order on one hand-drawn capsule of the dialog's paper, the chosen one inked
/// terracotta on the bar's torn-paper wash; with their words on a wide window when they fit,
/// glyphs alone otherwise (their names kept for VoiceOver, the pointer's tooltip and the Large
/// Content Viewer). The same items, selection and haptics as the bar; the pen is drawn apart.
public struct OrganicTopTabs<ID: Hashable>: View {
    let items: [OrganicTabItem<ID>]
    let selection: ID
    let labels: Bool
    let room: CGFloat
    let label: String
    let onSelect: (ID) -> Void
    var onWidth: ((CGFloat) -> Void)?

    /// `items`: the bar's list (the pen among them is left out); `labels`: words allowed (expanded);
    /// `room`: the most the labelled group may take; `label`: the group's name for VoiceOver.
    public init(items: [OrganicTabItem<ID>], selection: ID, labels: Bool, room: CGFloat, label: String,
                onSelect: @escaping (ID) -> Void, onWidth: ((CGFloat) -> Void)? = nil) {
        self.items = items
        self.selection = selection
        self.labels = labels
        self.room = room
        self.label = label
        self.onSelect = onSelect
        self.onWidth = onWidth
    }

    public var body: some View {
        Group {
            if labels {
                ViewThatFits(in: .horizontal) {
                    track(labelled: true)
                    track(labelled: false)
                }
                .frame(width: max(room, 0))
            } else {
                track(labelled: false)
            }
        }
        .sensoryFeedback(.selection, trigger: selection)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private func track(labelled: Bool) -> some View {
        HStack(spacing: 2) {
            ForEach(Array(items.enumerated()).filter { !$0.element.isAction }, id: \.element.id) { index, item in
                TopTabButton(item: item, barIndex: index, selected: item.id == selection, labelled: labelled) { onSelect(item.id) }
            }
        }
        .padding(4)
        .frame(height: 40)
        .background { TopTabsTrack() }
        .fixedSize()
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { onWidth?($0) }
    }
}

/// The group's capsule: `wobRect(G, 40, R 18, seed 233, mag 1.2, {segmentsH max(3, round(G / 80)),
/// segmentsV 1, curve 1.3, cornerJitter 1.6, cornerOffset 1.6})` in the cream's darker shade with
/// the dialog paper's grain; no pen line (a control is a filled shape).
struct TopTabsTrack: View {
    var body: some View {
        let shape = TopTabsTrackShape()
        ZStack {
            shape.fill(Tokens.creamDark.opacity(0.7))
            GrainLayer(shape: shape, mode: .tile, opacity: 0.3, tile: "grain-card")
        }
        .accessibilityHidden(true)
    }
}

nonisolated struct TopTabsTrackShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = Double(rect.width)
        return WobRectShape(radius: 18, seed: 233, mag: 1.2, options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.6, cornerOffset: 1.6,
            segmentsH: .count(Double(max(3, Int((w / 80).rounded())))), segmentsV: .count(1)))
            .path(in: rect)
    }
}

/// The chosen tab's wash, fitted to its item: `wobRect(w, 32, R 12, seed, mag 3.2, {segmentsH w > 90 ? 3 : 2,
/// segmentsV 1, curve 1.2, cornerJitter 3.6, cornerOffset 3})`.
nonisolated struct TopTabWashShape: Shape {
    let seed: Double
    func path(in rect: CGRect) -> Path {
        WobRectShape(radius: 12, seed: seed, mag: 3.2, options: WobRectOptions(
            curve: 1.2, cornerJitter: 3.6, cornerOffset: 3, segmentsH: .count(rect.width > 90 ? 3 : 2), segmentsV: .count(1)))
            .path(in: rect)
    }
}

/// One tab of the header's group: glyph and words side by side (or the glyph alone, 48 wide), 32 tall.
struct TopTabButton<ID: Hashable>: View {
    let item: OrganicTabItem<ID>
    let barIndex: Int
    let selected: Bool
    let labelled: Bool
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                OrganicIcon(item.icon, size: labelled ? 20 : 22, strokeWidth: Tokens.ink)
                    .overlay(alignment: .topTrailing) {
                        if item.badge > 0 { UnreadBadge(count: item.badge).offset(x: 8, y: -7) }
                    }
                if labelled {
                    // The chosen weight's room kept either way, so choosing a tab never moves the others.
                    ZStack {
                        Text(item.title).font(AppFonts.body(14, weight: .semibold)).hidden()
                        Text(item.title).font(AppFonts.body(14, weight: selected ? .semibold : .medium))
                    }
                    .lineLimit(1)
                    .fixedSize()
                }
            }
            .padding(.horizontal, labelled ? 14 : 0)
            .frame(width: labelled ? nil : 48, height: 32)
            .background {
                TopTabWashShape(seed: Double(barIndex * 29 + 7))
                    .fill(Tokens.terracottaLight.opacity(0.55))
                    .opacity(selected ? 1 : hovered ? 0.45 : 0)
                    .animation(.easeOut(duration: 0.16), value: selected)
                    .animation(.easeOut(duration: 0.16), value: hovered)
            }
            .foregroundStyle(selected ? Tokens.terracotta : Tokens.textMuted)
            .contentShape(Rectangle())
        }
        .buttonStyle(TabPressStyle())
        .onHover { hovered = $0 }
        .help(item.title)
        .accessibilityLabel(item.badge > 0 ? "\(item.title), \(item.badge)" : item.title)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
        .accessibilityShowsLargeContentViewer { Label { Text(item.title) } icon: { OrganicIcon(item.icon) } }
    }
}

/// The pen on its own (the tablet header's trailing end): the bar's solid chip, 56 × 40.
public struct OrganicPenButton: View {
    let title: String
    let icon: IconName
    let action: () -> Void

    public init(title: String, icon: IconName, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            PenChip(icon: icon).contentShape(Rectangle())
        }
        .buttonStyle(PenPressStyle())
        .help(title)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isButton)
        .accessibilityShowsLargeContentViewer { Label { Text(title) } icon: { OrganicIcon(icon) } }
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
                // The verb's face (buttonFill): cream on plain terracotta was 3.5:1.
                shape.fill(Tokens.buttonFill)
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

    @Environment(\.headerChrome) private var chrome
    @Environment(\.window) private var window

    public var body: some View {
        if let chrome {
            // A tablet's full-width header (round 5 B2): the lockup left of the window's tab group (the mark
            // alone when the wordmark doesn't fit), the page's actions 8 before the window's pen.
            HStack(spacing: 0) {
                lockup
                    .frame(maxWidth: HeaderChrome.leadingRoom(width: window.width, groupWidth: chrome.groupWidth), alignment: .leading)
                Spacer(minLength: 12)
                trailing
            }
            .frame(minHeight: HeaderChrome.rowHeight)
            .padding(.leading, window.pad)
            .padding(.trailing, window.pad + chrome.trailingReserve)
            .padding(.bottom, HeaderEdge.height)
            .background { HeaderEdge(scrolled: scrolled) }
            .accessibilityElement(children: .contain)
        } else {
            HStack(spacing: 10) {
                mark
                words
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

    /// ResonanceIcon: the wave glyph in the accent, nudged down 7% to sit on the wordmark's visual centre.
    private var mark: some View {
        OrganicIcon(.wave, size: 38, color: Tokens.terracotta, strokeWidth: Tokens.ink)
            .offset(y: 38 * 0.07)
    }

    @ViewBuilder private var words: some View {
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
    }

    /// The mark and the words in the room left of the tab group: a title truncates; the wordmark
    /// that doesn't fit leaves the mark alone (named for VoiceOver).
    @ViewBuilder private var lockup: some View {
        if title != nil {
            HStack(spacing: 10) { mark; words }
        } else {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { mark; words.fixedSize() }
                mark.accessibilityElement().accessibilityLabel(Text(verbatim: "Resonance"))
            }
        }
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
    private var showsBack = true
    private var progress: CGFloat?
    private var inset: CGFloat = 0
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

    /// A bar whose `leading` takes it over for a while (a thread's search field) leaves the arrow out.
    public func backHidden(_ hidden: Bool) -> Self {
        var bar = self
        bar.showsBack = !hidden
        return bar
    }

    /// More room before the bar's content than the page's 20 (a pane's gutter), the paper still from the edge.
    public func leadingInset(_ inset: CGFloat) -> Self {
        var bar = self
        bar.inset = inset
        return bar
    }

    /// How far through the page's story the reader is (0…1; nil draws nothing): a terracotta pen
    /// line rides the bar's own wave from its left end (design §3).
    public func readingProgress(_ progress: CGFloat?) -> Self {
        var bar = self
        bar.progress = progress
        return bar
    }

    @Environment(\.headerChrome) private var chrome
    @Environment(\.window) private var window

    public var body: some View {
        if let chrome {
            // A tablet's full-width header (round 5 B2): the arrow and the title (or `leading`) left of the
            // window's tab group, truncating — the title dropped when too little is left for it — and the
            // page's actions 8 before the window's pen.
            let room = HeaderChrome.leadingRoom(width: window.width, groupWidth: chrome.groupWidth)
            HStack(spacing: 0) {
                HStack(spacing: 10) {
                    arrow
                    if room - (showsBack ? 41 : 0) >= HeaderChrome.titleMin { titleText }
                    leading
                }
                .frame(maxWidth: room, alignment: .leading)
                Spacer(minLength: 8)
                HStack(spacing: 0) { trailing }
                    .padding(.trailing, -12)
            }
            .frame(minHeight: HeaderChrome.rowHeight)
            .padding(.leading, window.pad + inset)
            .padding(.trailing, window.pad + chrome.trailingReserve)
            .padding(.bottom, HeaderEdge.height)
            .background { HeaderEdge(scrolled: scrolled, progress: progress) }
        } else {
            HStack(spacing: 10) {
                arrow
                titleText
                leading
                Spacer(minLength: 8)
                // Bare glyphs sit on the page's 20 margin, as the arrow does on the other side.
                HStack(spacing: 0) { trailing }
                    .padding(.trailing, -12)
            }
            .frame(minHeight: 44)
            .padding(.horizontal, 20)
            .padding(.leading, inset)
            .padding(.top, 4)
            .padding(.bottom, HeaderEdge.height)
            .background { HeaderEdge(scrolled: scrolled, progress: progress) }
        }
    }

    /// The arrow's own 8pt pad sits in the gutter (margin-left −8 on the web).
    @ViewBuilder private var arrow: some View {
        if showsBack {
            OrganicIconButton(.arrowRight, label: backLabel, size: 18, mirrored: true) { if let back { back() } else { dismiss() } }
                .padding(.leading, -13)
        }
    }

    @ViewBuilder private var titleText: some View {
        if !title.isEmpty {
            Text(title)
                .font(AppFonts.heading(22))
                .tracking(-0.02 * 22)
                .lineLimit(1)
                .foregroundStyle(Tokens.text)
                .accessibilityAddTraits(.isHeader)
        }
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
    /// Reading progress (the card page): the share of the wave inked in terracotta over the grey.
    var progress: CGFloat?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(scrolled: Bool = false, progress: CGFloat? = nil) {
        self.scrolled = scrolled
        self.progress = progress
    }

    /// Below this nothing is drawn: no lone dot of a round cap at the wave's start.
    public static let progressMin: CGFloat = 0.002

    public var body: some View {
        ZStack {
            HeaderEdgeShape(closed: true).fill(Tokens.cream)
            HeaderEdgeShape(closed: false)
                .stroke(Tokens.fieldBorderHover, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                .opacity(scrolled ? 1 : 0.5)
                .animation(.easeInOut(duration: 0.3), value: scrolled)
            if let progress {
                let p = min(max(progress, 0), 1)
                HeaderEdgeShape(closed: false)
                    .trim(from: 0, to: p)
                    .stroke(Tokens.terracotta, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                    .opacity(p < Self.progressMin ? 0 : 1)
                    // It follows the scroll; with motion allowed, a short ease takes the steps out.
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: p)
            }
        }
        .ignoresSafeArea(edges: .top)
        .accessibilityHidden(true)
    }
}

/// How far a reader is through a story (design §3), from the scroll view's geometry and the story
/// block's place in the scrolled content: 0 while the story's top is still below the bar's line,
/// 1 once its bottom has reached the screen's foot; nil (nothing drawn) when the story fits on
/// one screen.
public nonisolated enum ReadingProgress {
    /// `visibleTop`: the scrolled content's y at the bar's line (offset + top inset);
    /// `visibleHeight`: what shows between the bar and the bottom inset.
    public static func of(storyTop: CGFloat, storyHeight: CGFloat, visibleTop: CGFloat, visibleHeight: CGFloat) -> CGFloat? {
        guard storyHeight > visibleHeight, visibleHeight > 0 else { return nil }
        return min(max((visibleTop - storyTop) / (storyHeight - visibleHeight), 0), 1)
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
