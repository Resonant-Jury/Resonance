import SwiftUI

// MARK: - Segmented action bar

/// One segment of a ``SegmentedActionBar``: a glyph and its words, its own face (`fill`, nil: the
/// bar's), the ink of its words and glyph, and the ink a press spreads over it.
public struct SegmentSpec: Identifiable {
    public let id: String
    public var icon: IconName?
    /// The glyph drawn filled (a bookmark that is on).
    public var iconFilled: Bool
    public var label: String
    /// What VoiceOver calls it, when not its words (the note's full 寄一張小紙條給作者 behind 寄小紙條).
    public var accessibilityLabel: String?
    public var fill: Color?
    public var ink: Color
    public var pressInk: Color
    /// Drops its words for its glyph alone when the bar has no room for every label (the words stay
    /// its name for VoiceOver).
    public var collapsible: Bool
    /// One option of a choice (the publish panel's audience): whether it is the chosen one.
    public var selected: Bool?
    /// Working on the last tap: the pen inks where its glyph was, and a tap does nothing.
    public var working: Bool
    public let action: () -> Void

    public init(id: String, icon: IconName? = nil, iconFilled: Bool = false, label: String, accessibilityLabel: String? = nil,
                fill: Color? = nil, ink: Color = Tokens.buttonOnTonal, pressInk: Color = Tokens.terracotta.opacity(0.14),
                collapsible: Bool = false, selected: Bool? = nil, working: Bool = false, action: @escaping () -> Void) {
        self.id = id
        self.icon = icon
        self.iconFilled = iconFilled
        self.label = label
        self.accessibilityLabel = accessibilityLabel
        self.fill = fill
        self.ink = ink
        self.pressInk = pressInk
        self.collapsible = collapsible
        self.selected = selected
        self.working = working
        self.action = action
    }

    /// The verb's segment (共振): the solid face, cream words, a press that darkens.
    public static func verb(id: String, icon: IconName?, label: String, working: Bool = false,
                            action: @escaping () -> Void) -> SegmentSpec {
        SegmentSpec(id: id, icon: icon, label: label, fill: Tokens.buttonFill, ink: Tokens.cream,
                    pressInk: .black.opacity(0.14), working: working, action: action)
    }
}

/// Several actions fused into one filled bar (SegmentedActionBar.tsx), split by hand-drawn seams.
/// Its segments are buttons, so like every button it is a filled shape with no pen line (an
/// outline marks a floating surface, a container or an input): the bar wears the tonal face
/// (`fill`), a segment may bring its own (the verb's `buttonFill`), the seams between them are cut
/// in the paper's colour, and the buttons' grain lies over it all.
///
/// It spans its column in one row, the segments sharing it evenly (none narrower than its words);
/// when every label no longer fits, the `collapsible` segments show their glyph alone.
public struct SegmentedActionBar: View {
    let segments: [SegmentSpec]
    var seed: Double
    var fill: Color
    var seam: Color

    public init(_ segments: [SegmentSpec], seed: Double = 71, fill: Color = Tokens.buttonTonal, seam: Color = Tokens.cream) {
        self.segments = segments
        self.seed = seed
        self.fill = fill
        self.seam = seam
    }

    public var body: some View {
        // The first row whose words all fit: every label, else the collapsible ones as their glyph.
        ViewThatFits(in: .horizontal) {
            row(collapsed: false)
            if segments.contains(where: \.collapsible) { row(collapsed: true) }
        }
        .accessibilityElement(children: .contain)
    }

    private func row(collapsed: Bool) -> some View {
        SegmentRowLayout(flexible: segments.map { !(collapsed && $0.collapsible) }) {
            ForEach(Array(segments.enumerated()), id: \.element.id) { i, spec in
                SegmentButton(spec: spec, iconOnly: collapsed && spec.collapsible, index: i, count: segments.count,
                              barSeed: seed, barFill: fill, seam: seam)
            }
        }
        .clipShape(SegmentedBarShape(seed: seed))
    }
}

/// The bar's outline, measured: a long, calm pill (SegmentedActionBar.tsx's outerPath).
public nonisolated struct SegmentedBarShape: Shape {
    public var seed: Double

    public init(seed: Double) {
        self.seed = seed
    }

    public func path(in rect: CGRect) -> Path {
        let h = Double(rect.height)
        return WobRectShape(radius: 16, seed: seed, mag: Double(min(rect.width, rect.height)) * 0.05, options: WobRectOptions(
            curve: 1.2, cornerJitter: 1.2, cornerOffset: h * 0.04, segmentsH: .range(7, 9), segmentsV: .range(2, 3)))
            .path(in: rect)
    }
}

/// How the bar's width is shared (CSS `flex: 1 1 0` with each segment's words as its least): the
/// flexible segments split what the fixed ones leave evenly, a segment whose words need more than
/// its share keeps its own width and the rest share what is left.
public nonisolated enum SegmentWidths {
    public static func resolve(ideal: [CGFloat], flexible: [Bool], total: CGFloat) -> [CGFloat] {
        var widths = ideal
        var open = Set(ideal.indices.filter { flexible[$0] })
        var room = total - ideal.indices.filter { !flexible[$0] }.reduce(0) { $0 + ideal[$1] }
        while !open.isEmpty {
            let share = room / CGFloat(open.count)
            let held = open.filter { ideal[$0] > share }
            if held.isEmpty {
                for i in open { widths[i] = share }
                break
            }
            for i in held {
                widths[i] = ideal[i]
                room -= ideal[i]
                open.remove(i)
            }
        }
        return widths
    }

    /// The widths the segments ask for side by side do not fit the room: the collapsible ones go
    /// to their glyph.
    public static func overflows(ideal: [CGFloat], room: CGFloat) -> Bool {
        ideal.reduce(0, +) > room + 0.5
    }
}

/// One row of segments: at its ideal size the segments' own widths side by side (what
/// `ViewThatFits` weighs), offered a width it fills it, shared by ``SegmentWidths``.
struct SegmentRowLayout: Layout {
    let flexible: [Bool]

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified) }
        let height = ideal.map(\.height).max() ?? 0
        let natural = ideal.reduce(0) { $0 + $1.width }
        guard let width = proposal.width, width.isFinite else { return CGSize(width: natural, height: height) }
        return CGSize(width: max(width, natural), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified) }
        let widths = SegmentWidths.resolve(ideal: ideal.map(\.width), flexible: flexible, total: bounds.width)
        var x = bounds.minX
        for (i, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: x, y: bounds.minY), proposal: ProposedViewSize(width: widths[i], height: bounds.height))
            x += widths[i]
        }
    }
}

/// A segment: its words centred on its share of the bar, and under them its region of the face —
/// cut from its neighbours by the same seeded wavy seams, reaching past the bar on its outer sides
/// (the bar's outline trims it) — with the grain, the press's wash and the seam on its left.
private struct SegmentButton: View {
    let spec: SegmentSpec
    let iconOnly: Bool
    let index: Int
    let count: Int
    let barSeed: Double
    let barFill: Color
    let seam: Color

    var body: some View {
        Button(action: { if !spec.working { spec.action() } }) {
            HStack(spacing: 8) {
                if spec.working {
                    SketchLoader(size: 16, color: spec.ink).accessibilityHidden(true)
                } else if let icon = spec.icon {
                    OrganicIcon(icon, size: 16, color: spec.ink, strokeWidth: spec.iconFilled ? 2 : 1.6,
                                fill: spec.iconFilled ? spec.ink : nil)
                }
                if !iconOnly {
                    Text(spec.label)
                        .font(AppFonts.body(14, weight: .semibold))
                        .foregroundStyle(spec.ink)
                        .lineLimit(1)
                        .fixedSize()
                }
            }
            .padding(.horizontal, iconOnly ? 16 : 12)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(SegmentPressStyle(region: region, fill: spec.fill ?? barFill, pressInk: spec.pressInk,
                                       seam: index > 0 ? SegmentRegion.leftSeam(seed: seamSeed(index - 1)) : nil, seamColor: seam))
        .accessibilityLabel(spec.accessibilityLabel ?? spec.label)
        .accessibilityAddTraits(spec.selected == true ? .isSelected : [])
        .accessibilityAddTraits(spec.working ? .updatesFrequently : [])
    }

    /// SegmentedActionBar.tsx: the seam after segment i is seeded `seed + i·37 + 11`.
    private func seamSeed(_ i: Int) -> Double { barSeed + Double(i * 37 + 11) }

    private var region: SegmentRegion {
        SegmentRegion(left: index == 0 ? nil : seamSeed(index - 1), right: index == count - 1 ? nil : seamSeed(index))
    }
}

/// A segment's share of the face in its own frame: its left and right edges the wavy seams it
/// shares with its neighbours (`nil`: the bar's end, pushed out past the outline), top and bottom
/// past the bar too, so the bar's outline is what trims it.
nonisolated struct SegmentRegion: Shape {
    let left: Double?
    let right: Double?

    static func pad(_ h: Double) -> Double { max(12, h * 0.3) }

    static func seam(x: Double, h: Double, seed: Double) -> [CGPoint] {
        boundaryPoints(x: x, h: h, seed: seed, amp: 1.6, pad: pad(h))
    }

    /// The wavy seam on a segment's left, as a stroke.
    static func leftSeam(seed: Double) -> SeamShape { SeamShape(seed: seed) }

    func path(in rect: CGRect) -> Path {
        let w = Double(rect.width), h = Double(rect.height), pad = Self.pad(h)
        let leftEdge = left.map { Self.seam(x: 0, h: h, seed: $0) } ?? [CGPoint(x: -pad, y: -pad), CGPoint(x: -pad, y: h + pad)]
        let rightEdge = right.map { Self.seam(x: w, h: h, seed: $0) } ?? [CGPoint(x: w + pad, y: -pad), CGPoint(x: w + pad, y: h + pad)]
        var p = Path()
        p.move(to: leftEdge[0])
        for pt in leftEdge.dropFirst() { p.addLine(to: pt) }
        for pt in rightEdge.reversed() { p.addLine(to: pt) }
        p.closeSubpath()
        return p.offsetBy(dx: rect.minX, dy: rect.minY)
    }
}

/// The seam at a segment's left edge, as the pen draws it.
nonisolated struct SeamShape: Shape {
    let seed: Double

    func path(in rect: CGRect) -> Path {
        Path(polyline: SegmentRegion.seam(x: 0, h: Double(rect.height), seed: seed)).offsetBy(dx: rect.minX, dy: rect.minY)
    }
}

/// A segment's face and its press: the region filled, the buttons' grain, the press's wash
/// spreading and lifting on the ink every control shares, and the seam cut on its left.
private struct SegmentPressStyle: ButtonStyle {
    let region: SegmentRegion
    let fill: Color
    let pressInk: Color
    let seam: SeamShape?
    let seamColor: Color

    func makeBody(configuration: Configuration) -> some View {
        SegmentFace(isPressed: configuration.isPressed, region: region, fill: fill, pressInk: pressInk, seam: seam,
                    seamColor: seamColor) { configuration.label }
    }
}

private struct SegmentFace<Label: View>: View {
    let isPressed: Bool
    let region: SegmentRegion
    let fill: Color
    let pressInk: Color
    let seam: SeamShape?
    let seamColor: Color
    @ViewBuilder let label: Label
    @State private var ink: Double = 0
    @State private var pressedAt: Date?
    @State private var generation = 0
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        label
            .background {
                region.fill(fill)
                GrainLayer(shape: region, mode: .tile, opacity: 0.38, tile: "grain-button", overflow: 16)
                region.fill(pressInk).opacity(ink)
                if let seam {
                    seam.stroke(seamColor, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                }
            }
            .opacity(isEnabled ? 1 : 0.45)
            .onChange(of: isPressed) { _, pressed in
                if pressed {
                    generation += 1
                    pressedAt = .now
                    withAnimation(InkTiming.spread) { ink = 1 }
                } else {
                    // A quick tap still shows the whole spread before it lifts.
                    let wait = max(0, 0.3 - (pressedAt.map { Date.now.timeIntervalSince($0) } ?? 1))
                    let mine = generation
                    Task { @MainActor in
                        if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
                        guard generation == mine else { return }
                        withAnimation(InkTiming.lift) { ink = 0 }
                    }
                }
            }
            .sensoryFeedback(.impact(weight: .light), trigger: isPressed) { _, new in new }
    }
}
