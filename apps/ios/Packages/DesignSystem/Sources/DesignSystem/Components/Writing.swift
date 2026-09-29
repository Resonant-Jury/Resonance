import NukeUI
import SwiftUI

/// HandDrawnBorder's auto wobble (its size sets the swing and the turns) with a
/// set bow — the writer's frames pass `curve={0.8}` (the title, the image
/// surface and the picture in it).
public nonisolated struct AutoWobRectShape: Shape {
    public var radius: Double
    public var seed: Double
    public var curve: Double

    public init(radius: Double = 16, seed: Double, curve: Double) {
        self.radius = radius
        self.seed = seed
        self.curve = curve
    }

    public func path(in rect: CGRect) -> Path {
        let w = Double(rect.width), h = Double(rect.height)
        guard w > 0, h > 0 else { return Path() }
        return WobRectShape(radius: radius, seed: seed, options: WobRectOptions(
            curve: curve, segmentsH: .count(Double(autoSegments(w))), segmentsV: .count(Double(autoSegments(h)))
        )).path(in: rect)
    }
}

/// The web's vertical Divider: a wavy pen rule that stands a few points clear
/// of its ends (18% of it, at most 6pt) and gains a turn every 34pt of height,
/// so a tall rule keeps the same density as a short one.
public struct OrganicVerticalRule: View {
    var seed: Double
    var amp: Double
    var color: Color
    var lineWidth: CGFloat

    public init(seed: Double = 17, amp: Double = 1.4, color: Color = Tokens.dividerInk, lineWidth: CGFloat = 1.2) {
        self.seed = seed
        self.amp = amp
        self.color = color
        self.lineWidth = lineWidth
    }

    public var body: some View {
        Canvas { ctx, size in
            let h = Double(size.height)
            guard h > 0 else { return }
            let inset = min(0.18, 6 / h)
            let length = h * (1 - inset * 2)
            let steps = max(2, Int((length / 34).rounded()))
            let path = wavyVertical(length, seed: seed, amp: amp, steps: steps).path(offsetX: Double(size.width / 2), offsetY: h * inset)
            ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        }
        .frame(width: amp * 2 + lineWidth * 2)
        .accessibilityHidden(true)
    }
}

/// HandDrawnImage: a picture that fills a wobbly frame (R 16, the size's own
/// wobble, a set bow) with the field's pen line on top, 16:10. `blur` and
/// `wash` show an unsettled picture (a streaming preview) in the same frame;
/// `onRemove` adds the dark ✕ chip in its corner.
public struct HandDrawnImage<Overlay: View>: View {
    public enum Source {
        case url(URL)
        case image(UIImage)
    }

    let source: Source
    let seed: Double
    let radius: Double
    let curve: Double
    let blur: CGFloat
    let wash: Color?
    let removeLabel: String
    let onRemove: (() -> Void)?
    let overlay: Overlay

    public init(_ source: Source, seed: Double = 31, radius: Double = 16, curve: Double = 0.8, blur: CGFloat = 0, wash: Color? = nil,
                removeLabel: String = "", onRemove: (() -> Void)? = nil, @ViewBuilder overlay: () -> Overlay = { EmptyView() }) {
        self.source = source
        self.seed = seed
        self.radius = radius
        self.curve = curve
        self.blur = blur
        self.wash = wash
        self.removeLabel = removeLabel
        self.onRemove = onRemove
        self.overlay = overlay()
    }

    public var body: some View {
        let frame = AutoWobRectShape(radius: radius, seed: seed, curve: curve)
        GeometryReader { geo in
            // Overscan past the box so the wobble's bulges land on pixels (BLEED 6, more under a blur).
            let bleed = 6 + blur * 2
            picture
                .blur(radius: blur)
                .frame(width: geo.size.width + bleed * 2, height: geo.size.height + bleed * 2)
                // The frame's own box, inside the overscanned picture.
                .clipShape(InsetShape(base: frame, inset: bleed))
                .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
        .overlay { if let wash { frame.fill(wash) } }
        .overlay { frame.stroke(Tokens.fieldBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round)) }
        .overlay { overlay }
        .overlay(alignment: .topTrailing) {
            if let onRemove {
                Button(action: onRemove) {
                    ZStack {
                        let chip = WobRectShape(radius: 34 * 0.4, seed: seed + 5, mag: 34 * 0.022, options: WobRectOptions(
                            curve: 1.3, cornerJitter: 3.2, cornerOffset: 34 * 0.06, segmentsH: .count(1), segmentsV: .count(1)))
                        chip.fill(Tokens.imageRemoveFill)
                        chip.stroke(Tokens.imageRemoveStroke, lineWidth: Tokens.ink)
                        OrganicIcon(.close, size: 16, color: Tokens.cream)
                    }
                    .frame(width: 34, height: 34)
                }
                .buttonStyle(.plain)
                .padding(12)
                .accessibilityLabel(removeLabel)
            }
        }
        .aspectRatio(16 / 10, contentMode: .fit)
    }

    @ViewBuilder private var picture: some View {
        switch source {
        case let .url(url):
            LazyImage(url: url) { state in
                if let image = state.image { image.resizable().scaledToFill() } else { Tokens.creamDark }
            }
        case let .image(image):
            Image(uiImage: image).resizable().scaledToFill()
        }
    }
}

/// A shape drawn in a rect `inset` smaller on every side (a clip for an overscanned view).
private nonisolated struct InsetShape<Base: Shape>: Shape {
    let base: Base
    let inset: CGFloat
    func path(in rect: CGRect) -> Path { base.path(in: rect.insetBy(dx: inset, dy: inset)) }
}

/// The writer's ✕ (WriteWorkspace's paneClose): a 36pt chip with a thin
/// field-border line on slightly uneven corners — a proper bordered button,
/// pinned above the scrolling page.
public struct OrganicCloseChip: View {
    let label: String
    let action: () -> Void

    public init(label: String, action: @escaping () -> Void) {
        self.label = label
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            // border-radius: 11px 13px 12px 14px
            let shape = UnevenRoundedRectangle(topLeadingRadius: 11, bottomLeadingRadius: 14, bottomTrailingRadius: 12, topTrailingRadius: 13)
            OrganicIcon(.close, size: 17, color: Tokens.textMuted)
                .frame(width: 36, height: 36)
                .background { shape.fill(Tokens.cream) }
                .overlay { shape.strokeBorder(Tokens.fieldBorder, lineWidth: 1) }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// SegmentedActionBar's boundaryPoints: a gently wobbly vertical boundary at
/// `x`, as points, so a segment's fill edge and the stroked divider share the
/// same geometry. It runs from -pad to h+pad so fills overshoot the bar and
/// the outer clip trims them flush; two interior anchors give a 1–2 turn wave.
public nonisolated func boundaryPoints(x: Double, h: Double, seed: Double, amp: Double, pad: Double) -> [CGPoint] {
    let steps = 3
    var rnd = Prng(seed: seed)
    func f(_ n: Double) -> Double { (n * 100).rounded() / 100 }
    var points = [CGPoint(x: f(x), y: -pad)]
    for k in 0...steps {
        let y = Double(k) / Double(steps) * h
        let off = k == 0 || k == steps ? 0 : (rnd.next() - 0.5) * 2 * amp
        points.append(CGPoint(x: f(x + off), y: f(y)))
    }
    points.append(CGPoint(x: f(x), y: f(h + pad)))
    return points
}

nonisolated extension Path {
    /// The points joined by straight lines (the boundary's stroke).
    public init(polyline points: [CGPoint]) {
        self.init()
        guard let first = points.first else { return }
        move(to: first)
        for p in points.dropFirst() { addLine(to: p) }
    }
}
