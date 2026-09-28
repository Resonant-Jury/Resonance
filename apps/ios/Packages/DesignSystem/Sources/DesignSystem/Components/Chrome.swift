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

/// Floating hand-drawn tab bar: organic pill, ink outline, grain; the selected
/// tab sits on a wobbly wash (the web's active nav item). Re-implements what
/// the system bar gives for free: selection haptics, tab traits for
/// VoiceOver, and the Large Content Viewer on long press.
public struct OrganicTabBar<ID: Hashable>: View {
    let items: [OrganicTabItem<ID>]
    let selection: ID
    let onSelect: (ID) -> Void

    public init(items: [OrganicTabItem<ID>], selection: ID, onSelect: @escaping (ID) -> Void) {
        self.items = items
        self.selection = selection
        self.onSelect = onSelect
    }

    public var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if item.isAction {
                    actionButton(item, index: index)
                } else {
                    tabButton(item, index: index)
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .organicSurface(fill: Tokens.cardBg, stroke: Tokens.modalBorder, radius: 26, seed: 131, grain: .tile, grainOpacity: 0.25)
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func tabButton(_ item: OrganicTabItem<ID>, index: Int) -> some View {
        let selected = item.id == selection
        return Button { onSelect(item.id) } label: {
            VStack(spacing: 2) {
                OrganicIcon(item.icon, size: 24)
                    .overlay(alignment: .topTrailing) {
                        if item.badge > 0 {
                            WobCircleShape(seed: 17, options: WobCircleOptions(segments: 6, mag: 0.4, cpJitter: 0.3))
                                .fill(Tokens.terracotta)
                                .frame(width: 8, height: 8)
                                .offset(x: 2, y: -1)
                        }
                    }
                Text(item.title).font(AppFonts.body(10.5, weight: selected ? .semibold : .regular)).lineLimit(1)
            }
            .foregroundStyle(selected ? Tokens.terracotta : Tokens.textMuted)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background {
                if selected {
                    WobRectShape(radius: 16, seed: Double(index * 29 + 7), mag: 1.3)
                        .fill(Tokens.terracottaLight.opacity(0.45))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.badge > 0 ? "\(item.title), \(item.badge)" : item.title)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
        .accessibilityShowsLargeContentViewer { Label { Text(item.title) } icon: { OrganicIcon(item.icon) } }
    }

    /// The pen: a filled terracotta blob in the middle of the bar.
    private func actionButton(_ item: OrganicTabItem<ID>, index: Int) -> some View {
        Button { onSelect(item.id) } label: {
            OrganicIcon(item.icon, size: 24, color: Tokens.cream)
                .frame(width: 52, height: 44)
                .background {
                    let shape = WobRectShape(radius: 18, seed: 57, mag: 1.4)
                    ZStack {
                        shape.fill(Tokens.terracotta)
                        GrainLayer(shape: shape, mode: .tile, opacity: 0.38, tile: "grain-button")
                        shape.stroke(Tokens.terracottaInk, lineWidth: Tokens.ink)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(.isButton)
        .accessibilityShowsLargeContentViewer { Label { Text(item.title) } icon: { OrganicIcon(item.icon) } }
    }
}

/// Root-screen header: large Playfair title with the wavy pen line under it —
/// the web's AppHeader wave, moved from the bar into the content.
public struct OrganicLargeHeader<Trailing: View>: View {
    let title: String
    let trailing: Trailing

    public init(_ title: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.title = title
        self.trailing = trailing()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center) {
                Text(title)
                    .font(AppFonts.heading(30))
                    .foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 12)
                trailing
            }
            WavyDivider(color: Tokens.fieldBorderHover, seed: 7, amp: 1.6, lineWidth: Tokens.ink)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }
}

/// Pushed-screen bar: hand-drawn back button, centered title, trailing actions.
public struct OrganicInlineBar<Trailing: View>: View {
    let title: String
    let backLabel: String
    let trailing: Trailing
    @Environment(\.dismiss) private var dismiss

    public init(_ title: String, backLabel: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.title = title
        self.backLabel = backLabel
        self.trailing = trailing()
    }

    public var body: some View {
        ZStack {
            Text(title)
                .font(AppFonts.body(16, weight: .semibold))
                .lineLimit(1)
                .foregroundStyle(Tokens.text)
                .padding(.horizontal, 96)
                .accessibilityAddTraits(.isHeader)
            HStack {
                OrganicIconButton(.arrowRight, label: backLabel, mirrored: true) { dismiss() }
                Spacer()
                trailing
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, HeaderEdge.height)
        .background { HeaderEdge() }
    }
}

/// The web AppHeader's backdrop and bottom edge: the cream fill stops exactly
/// on the wavy pen line (the web masks its backdrop to the same curve), so
/// the line *is* the bar's edge — no band of fill below it, and content
/// scrolled beneath shows right up to the line. Reaches up under the status bar.
public struct HeaderEdge: View {
    /// Room under the bar's content for the wave (the web's HEADER_WAVE_H band).
    public static let height: CGFloat = 10

    public init() {}

    public var body: some View {
        ZStack {
            HeaderEdgeShape(closed: true).fill(Tokens.cream)
            HeaderEdgeShape(closed: false)
                .stroke(Tokens.fieldBorderHover, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
        }
        .ignoresSafeArea(edges: .top)
        .accessibilityHidden(true)
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

/// A round hand-drawn icon button with a 44pt hit area.
public struct OrganicIconButton: View {
    let icon: IconName
    let label: String
    /// Drawn flipped left-to-right (the web's back arrow is arrow-right mirrored).
    var mirrored: Bool
    let action: () -> Void

    public init(_ icon: IconName, label: String, mirrored: Bool = false, action: @escaping () -> Void) {
        self.icon = icon
        self.label = label
        self.mirrored = mirrored
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            OrganicIcon(icon, size: 20)
                .scaleEffect(x: mirrored ? -1 : 1)
                .foregroundStyle(Tokens.text)
                .frame(width: 40, height: 40)
                .background {
                    WobCircleShape(seed: Double(icon.rawValue.count * 13), options: WobCircleOptions(segments: 7, mag: 1.2, cpJitter: 0.5))
                        .stroke(Tokens.ghostStroke.opacity(0.8), lineWidth: Tokens.inkLight)
                        .padding(3)
                }
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
        viewControllers.count > 1
    }
}
