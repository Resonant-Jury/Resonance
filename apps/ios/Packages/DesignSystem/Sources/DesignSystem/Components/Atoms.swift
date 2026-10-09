import SwiftUI

// MARK: - Small atoms

public struct TagPill: View {
    /// TagPill.tsx's sizes: md on cards, lg in the writer.
    public enum Size: Sendable {
        case sm, md, lg

        var font: CGFloat { switch self { case .sm: 10; case .md: 11; case .lg: 13 } }
        var tracking: CGFloat { self == .lg ? 0.05 : 0.04 }
        var padX: CGFloat { switch self { case .sm: 10; case .md: 14; case .lg: 18 } }
        var padY: CGFloat { switch self { case .sm: 3; case .md: 4; case .lg: 7 } }
    }

    let text: String
    var fill: Color
    var seed: Double?
    var size: Size
    var outlined: Bool
    var onRemove: (() -> Void)?

    /// The web's TagPill: auto wobble and the given fill. A tag on a card (sm,
    /// md) sits inside a frame already, so the fill alone marks it; the
    /// writer's lg pill is a control on its own and keeps a faint ink outline.
    /// `outlined` overrides that (default: lg only) for a pill that sits on
    /// bare page paper rather than inside a framed card — the shelves'
    /// "anonymous" badge is cream-dark on the cream page and vanishes without
    /// its rim. `onRemove` adds its hand-drawn × (the writer's chosen tags).
    public init(_ text: String, fill: Color = Tokens.yellow, seed: Double? = nil, size: Size = .md, outlined: Bool? = nil, onRemove: (() -> Void)? = nil) {
        self.text = text
        self.fill = fill
        self.seed = seed
        self.size = size
        self.outlined = outlined ?? (size == .lg)
        self.onRemove = onRemove
    }

    /// TagPill's automatic seed: a hash of the label, so a tag always wobbles the same.
    static func autoSeed(_ s: String) -> Double {
        var hash: Int32 = 7
        for unit in s.utf16 { hash = (hash &<< 5) &- hash &+ Int32(unit) }
        return Double(abs(Int(hash)) % 9973 + 1)
    }

    /// sm: 10px uppercase at 0.04em, 3×10 padding; md: 11px, 4×14; lg: 13px at
    /// 0.05em, 7×18. The height comes from the line box, as on the web (≈19 / ≈22 / ≈32).
    public var body: some View {
        let font = size.font
        HStack(spacing: 6) {
            Text(text.uppercased())
                .font(AppFonts.body(font, weight: .semibold))
                .tracking(font * size.tracking)
                .foregroundStyle(Tokens.text)
                // CJK ink rides high in DM Sans' line box; the web nudges it 0.04em.
                .offset(y: font * 0.04)
            if let onRemove {
                Button(action: onRemove) {
                    TagRemoveGlyph()
                        .stroke(Tokens.text, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                        .frame(width: 10, height: 10)
                        .opacity(0.55)
                        .padding(.leading, 2)
                        .offset(y: font * 0.02)
                        .contentShape(Rectangle().inset(by: -8))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove tag")
            }
        }
        .padding(.horizontal, size.padX)
        .padding(.vertical, size.padY)
        .background {
            GeometryReader { geo in
                let shape = WobRectShape(radius: geo.size.height / 2, seed: seed ?? Self.autoSeed(text))
                shape.fill(fill)
                if outlined { shape.stroke(Tokens.tagStroke, lineWidth: Tokens.ink) }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// TagPill's remove ×: two slightly bowed strokes in a 10-unit box.
nonisolated struct TagRemoveGlyph: Shape {
    func path(in rect: CGRect) -> Path {
        let s = rect.width / 10
        func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: rect.minX + x * s, y: rect.minY + y * s) }
        var path = Path()
        path.move(to: p(1.6, 1.8))
        path.addCurve(to: p(8.2, 8.4), control1: p(3, 3), control2: p(5.2, 5.2))
        path.move(to: p(8.2, 1.8))
        path.addCurve(to: p(1.6, 8.4), control1: p(7, 3), control2: p(4.8, 5.2))
        return path
    }
}

public struct HandDrawnAvatar: View {
    let initials: String
    var imageURL: URL?
    var color: Color
    var size: CGFloat
    var seed: Double

    public init(initials: String, imageURL: URL? = nil, color: Color = Tokens.terracottaLight, size: CGFloat = 32, seed: Double = 7) {
        self.initials = initials
        self.imageURL = imageURL
        self.color = color
        self.size = size
        self.seed = seed
    }

    /// AVATAR_WOB: one lopsided turn per side, corners that drift (6% of the
    /// size), and the same curve for the fill, the photo's clip and the rim.
    public var body: some View {
        let shape = WobRectShape(radius: size * 0.4, seed: seed, mag: size * 0.022, options: WobRectOptions(
            curve: 1.3, cornerJitter: 3.2, cornerOffset: size * 0.06, segmentsH: .count(1), segmentsV: .count(1)))
        ZStack {
            shape.fill(color)
            Text(initials)
                .font(AppFonts.body(size * 0.35, weight: .bold))
                .foregroundStyle(Tokens.text)
            if let imageURL {
                OrganicAvatarPhoto(url: imageURL).clipShape(shape)
            }
        }
        .frame(width: size, height: size)
        .overlay { shape.stroke(Tokens.avatarStroke, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round)) }
        .accessibilityHidden(true)
    }
}

/// The web's Divider: a fixed number of gentle turns (7) stretched across
/// whatever width it gets, in the field-border ink at 35%.
public struct WavyDivider: View {
    var color: Color
    var seed: Double
    var amp: Double
    var steps: Int
    var lineWidth: CGFloat

    public init(color: Color = Tokens.dividerInk, seed: Double = 17, amp: Double = 1.4, steps: Int = 7,
                lineWidth: CGFloat = Tokens.inkLight) {
        self.color = color
        self.seed = seed
        self.amp = amp
        self.steps = steps
        self.lineWidth = lineWidth
    }

    public var body: some View {
        WavyRuleShape(seed: seed, amp: amp, steps: steps)
            .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            .frame(height: 6)
            .accessibilityHidden(true)
    }
}

/// `wavyLine(200, seed, amp, steps)` stretched to the width (the web's
/// `preserveAspectRatio="none"` rules): the turn count stays fixed however
/// wide the line is, unlike ResonanceGeometry's width-derived WavyLineShape.
public nonisolated struct WavyRuleShape: Shape {
    public var seed: Double
    public var amp: Double
    public var steps: Int

    public init(seed: Double, amp: Double = 1.4, steps: Int = 7) {
        self.seed = seed
        self.amp = amp
        self.steps = steps
    }

    public func path(in rect: CGRect) -> Path {
        // x scales linearly with the width, so drawing at the real width is
        // the stretched 200-unit line.
        wavyLine(Double(rect.width), seed: seed, amp: amp, steps: steps)
            .path(offsetX: Double(rect.minX), offsetY: Double(rect.midY))
    }
}

/// A pen's wavy underline at the box's real width (wavyPath.ts `penWave`): a
/// crest every ~4.5pt, alternating, each nudged by the seed; centred on the
/// box's middle.
public nonisolated struct PenWaveShape: Shape {
    public var seed: Double
    public var amp: Double

    public init(seed: Double, amp: Double = 1.2) {
        self.seed = seed
        self.amp = amp
    }

    public func path(in rect: CGRect) -> Path {
        penWave(Double(rect.width), seed: seed, amp: amp)
            .path(offsetX: Double(rect.minX), offsetY: Double(rect.midY))
    }
}

/// The web's OrganicLink (OrganicLink.tsx): a text link in terracotta with no
/// straight underline — a pen's wavy stroke sits under it instead, seeded from
/// the link's `href` so each link wobbles its own way (and the same way the
/// web's does). The stroke is `penWave` at the text's width — a crest every
/// ~4.5pt, 1.2 high — centred 0.2em under the baseline (under the letters, not
/// under the line box), INK wide, at 70% — 100% while pressed, like the web's
/// hover.
public struct OrganicLink: View {
    let title: String
    let href: String
    var size: CGFloat
    let action: () -> Void

    /// `href` is the site path the web's link would carry (`/en/privacy`): it
    /// only seeds the wobble here — `action` decides where the tap goes.
    public init(_ title: String, href: String, size: CGFloat = 16, action: @escaping () -> Void) {
        self.title = title
        self.href = href
        self.size = size
        self.action = action
    }

    public var body: some View {
        // The text size grows the line box the way it grows the text.
        let scale = TextScale.factor(relativeTo: .body)
        Button(action: action) {
            Text(title)
                .font(AppFonts.body(size))
                .foregroundStyle(Tokens.terracotta)
                // Short links stay whole (white-space: nowrap), so the stroke is one line.
                .lineLimit(1)
                .fixedSize()
                // The web's inline-block is a full CSS line box, taller over Han text (the
                // fallback face raises it); the text keeps the bottom.
                .frame(minHeight: AppFonts.normalLineBox(.body, size: size, text: title) * scale, alignment: .bottom)
        }
        .buttonStyle(OrganicLinkStyle(seed: Double(seedFromString(href)), drop: size * scale * 0.2))
        .accessibilityAddTraits(.isLink)
    }
}

private struct OrganicLinkStyle: ButtonStyle {
    let seed: Double
    /// How far under the baseline the stroke's centre sits.
    let drop: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(alignment: Alignment(horizontal: .leading, vertical: .firstTextBaseline)) {
                PenWaveShape(seed: seed)
                    .stroke(Tokens.terracotta, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
                    .frame(height: 6)
                    .alignmentGuide(.firstTextBaseline) { d in d[VerticalAlignment.center] - drop }
                    .opacity(configuration.isPressed ? 1 : 0.7)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            // A touch target past the text's own box, short of the neighbouring link's.
            .contentShape(Rectangle().inset(by: -8))
    }
}

/// The switch's numbers — the web's `TOGGLE` (ToggleSwitch.tsx) and Android's OrganicToggle draw
/// the same, so change all three together.
///
/// The track is a pill bowed by hand: a radius just under half the height (so each end may come
/// out a little rounder or flatter than the other) and one seeded turn in each long edge, bowing
/// up to 2.5pt in or out. The pen goes round it twice — the trace, and a lighter pass from
/// `seed + 1` — in the light pen. The knob is a lumpier circle than a button's dot (six arcs, ±1pt).
public nonisolated enum OrganicToggleSpec {
    public static let width: CGFloat = 50
    public static let height: CGFloat = 28
    public static let radius = 12.5
    public static let mag = 2.4
    public static let trackOptions = WobRectOptions(curve: 2.8, cornerJitter: 2, cornerOffset: 1.4,
                                                    segmentsH: .count(2), segmentsV: .count(1))
    /// The second pass is the same pill from the next seed, at this much of the pen's ink.
    public static let retraceSeed = 1.0
    public static let retraceOpacity = 0.4
    public static let knob: CGFloat = 20
    public static let pad: CGFloat = 4
    public static let knobSeed = 5.0
    public static let knobOptions = WobCircleOptions(segments: 6, mag: 1, cpJitter: 0.5)
    /// Faded like a disabled button while it can't be flipped.
    public static let disabledOpacity = 0.45
    /// How tall the tap target is: a finger's 44pt, reaching 8pt above and below the 28pt drawing,
    /// which keeps its own room in the row.
    public static let hitHeight: CGFloat = 44

    /// The track, its second pen pass and the knob (drawn at 0,0) for one seed.
    public static func shapes(seed: Double) -> (track: [PathCommand], retrace: [PathCommand], knob: [PathCommand]) {
        let r = Double(knob / 2)
        return (wobRect(Double(width), Double(height), radius, seed: seed, mag: mag, options: trackOptions),
                wobRect(Double(width), Double(height), radius, seed: seed + retraceSeed, mag: mag, options: trackOptions),
                wobCircle(r, r, r, seed: seed + knobSeed, options: knobOptions))
    }

    /// Where the knob's box sits: at the pad on the left when off, as far right when on.
    public static func knobOrigin(isOn: Bool) -> CGPoint {
        CGPoint(x: isOn ? width - knob - pad : pad, y: (height - knob) / 2)
    }

    /// Off: a pale paper well edged in a soft ink (text-muted, 5:1 on cream — WCAG 1.4.11 asks 3:1
    /// of an input's edge). On: terracotta, edged and knob-ringed in deep terracotta (6.6:1 on
    /// cream). The knob is cream either way (3.5:1 on the terracotta).
    public static func fill(isOn: Bool) -> Color { isOn ? Tokens.terracotta : Tokens.creamDark }
    public static func ink(isOn: Bool) -> Color { isOn ? Tokens.terracottaDeep : Tokens.textMuted }
}

/// The web's organic toggle (ToggleSwitch.tsx): a hand-drawn pill gone round twice in the light
/// pen, the buttons' grain on its well, and a lumpy cream knob that slides across. Its numbers are
/// ``OrganicToggleSpec``. It takes 50×28 in the row; its tap target is a finger's 44pt tall
/// (`hitHeight`), past the box above and below, as the pen reaches a few points past it.
public struct OrganicToggle: View {
    @Binding var isOn: Bool
    var label: String
    var seed: Double
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(isOn: Binding<Bool>, label: String, seed: Double = 9) {
        _isOn = isOn
        self.label = label
        self.seed = seed
    }

    public var body: some View {
        let spec = OrganicToggleSpec.self
        let shapes = spec.shapes(seed: seed)
        let track = shapes.track.path()
        let ink = spec.ink(isOn: isOn)
        let pen = StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round, lineJoin: .round)
        let knob = spec.knobOrigin(isOn: isOn)
        // Colours ease over 160ms, the knob glides over 200ms; under reduced motion it all snaps.
        let tint: Animation? = reduceMotion ? nil : .timingCurve(0.25, 0.1, 0.25, 1, duration: 0.16)
        let glide: Animation? = reduceMotion ? nil : .timingCurve(0.2, 0.8, 0.3, 1, duration: 0.2)
        ZStack(alignment: .topLeading) {
            ZStack {
                track.fill(spec.fill(isOn: isOn))
                // Both states carry the buttons' grain, so the switch sits in their family.
                GrainLayer(shape: TogglePath(path: track), mode: .tile, opacity: 0.38, tile: "grain-button", overflow: 4)
                shapes.retrace.path().stroke(ink.opacity(spec.retraceOpacity), style: pen)
                track.stroke(ink, style: pen)
            }
            .animation(tint, value: isOn)
            shapes.knob.path().fill(Tokens.cream)
                .overlay(shapes.knob.path().stroke(ink, style: StrokeStyle(lineWidth: Tokens.inkLight, lineJoin: .round)))
                .animation(tint, value: isOn)
                .frame(width: spec.knob, height: spec.knob)
                .offset(x: knob.x, y: knob.y)
                .animation(glide, value: isOn)
        }
        .frame(width: spec.width, height: spec.height, alignment: .topLeading)
        .opacity(isEnabled ? 1 : spec.disabledOpacity)
        .animation(tint, value: isEnabled)
        // The tap lands on 44pt (a finger's), the drawing keeps its 28 in the row: the pad grows the
        // target, the negative pad hands the room back.
        .padding(.vertical, (spec.hitHeight - spec.height) / 2)
        .contentShape(Rectangle())
        .onTapGesture { if isEnabled { isOn.toggle() } }
        .padding(.vertical, -(spec.hitHeight - spec.height) / 2)
        .sensoryFeedback(.selection, trigger: isOn)
        .accessibilityRepresentation { Toggle(label, isOn: $isOn) }
    }
}

/// A fixed path as a shape (the grain's clip), placed where the switch's box is.
private nonisolated struct TogglePath: Shape {
    let path: Path
    func path(in rect: CGRect) -> Path { path.offsetBy(dx: rect.minX, dy: rect.minY) }
}

/// SketchLoader: six dashes travelling nose-to-tail around the two-lap wobLoop,
/// each one ink-lighter than the one ahead — the pen never lifts. With a
/// `progress` the pen is at rest instead, the loop traced that far (0…1) in
/// the reduced-motion loader's ink: a pull to refresh draws it with the finger.
public struct SketchLoader: View {
    var size: CGFloat
    var color: Color
    var progress: Double?

    public init(size: CGFloat = 64, color: Color = Tokens.terracotta, progress: Double? = nil) {
        self.size = size
        self.color = color
        self.progress = progress
    }
    private let links: [Double] = [0.12, 0.19, 0.28, 0.4, 0.55, 0.95]
    private let seg = 0.12
    private let loopSeconds = 2.6
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public var body: some View {
        let c = Double(size / 2)
        let path = wobLoop(c, c, Double(size) * 0.34, Double(size) * 0.27, seed: 7,
                           options: WobLoopOptions(segments: 9, mag: Double(size) * 0.03, cpJitter: 0.7)).path()
        Group {
            if let progress {
                path.trimmedPath(from: 0, to: min(max(progress, 0), 1))
                    .stroke(color.opacity(0.7), style: StrokeStyle(lineWidth: size * 0.036, lineCap: .round, lineJoin: .round))
            } else if reduceMotion {
                // The web's reduced-motion loader: the pen at rest, the whole
                // two-lap loop drawn once as a calm double ring.
                path.stroke(color.opacity(0.7), style: StrokeStyle(lineWidth: size * 0.036, lineCap: .round, lineJoin: .round))
            } else {
                TimelineView(.animation) { timeline in
                    let t = timeline.date.timeIntervalSinceReferenceDate / loopSeconds
                    ZStack {
                        ForEach(links.indices, id: \.self) { k in
                            let head = (t + Double(k) * seg).truncatingRemainder(dividingBy: 1)
                            Dash(path: path, from: head, length: seg)
                                .stroke(color.opacity(links[k]), style: StrokeStyle(
                                    lineWidth: size * 0.036, lineCap: k == links.count - 1 ? .round : .butt, lineJoin: .round))
                        }
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Loading")
    }

    /// One dash of the caravan; wraps across the loop's closing point.
    private nonisolated struct Dash: Shape {
        let path: Path
        let from: Double
        let length: Double
        func path(in rect: CGRect) -> Path {
            let to = from + length
            if to <= 1 { return path.trimmedPath(from: from, to: to) }
            var p = path.trimmedPath(from: from, to: 1)
            p.addPath(path.trimmedPath(from: 0, to: to - 1))
            return p
        }
    }
}
