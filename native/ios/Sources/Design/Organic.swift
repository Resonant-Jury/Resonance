import ResonanceGeometry
import SwiftUI

// Native counterparts of the web's organic atoms. Geometry comes from the
// ResonanceGeometry port (identical paths to src/lib/design); colors from the
// generated Tokens; stroke widths from the one-pen INK tokens.

// MARK: - Grain

enum GrainMode: String, CaseIterable, Identifiable {
    case none, tile, shader
    var id: String { rawValue }
}

/// The web's feTurbulence parameters for each grain, keyed by tile name
/// (scripts/native/grain-tiles.ts renders the tiles from the same values).
struct GrainSpec {
    let frequency: Double
    let octaves: Int
    let seed: Int
    /// 0 = ShapeGrain (gray noise), 1 = GrainOverlay (black, alpha from noise).
    var shaderMode: Float = 0

    static func named(_ tile: String) -> GrainSpec {
        switch tile {
        case "grain-button": GrainSpec(frequency: 1.1, octaves: 2, seed: 3)
        case "grain-overlay": GrainSpec(frequency: 0.72, octaves: 4, seed: 0, shaderMode: 1)
        default: GrainSpec(frequency: 0.85, octaves: 2, seed: 3)
        }
    }
}

/// ShapeGrain: the web's feTurbulence noise, clipped to a shape.
/// `.tile` draws the pre-rendered spec-exact noise tile (scripts/native/grain-tiles.ts);
/// `.shader` computes the same noise per pixel on the GPU (Grain.metal).
struct GrainLayer<S: Shape>: View {
    let shape: S
    var mode: GrainMode
    var opacity: Double = 0.3
    var tile: String = "grain-card"

    var body: some View {
        switch mode {
        case .none:
            EmptyView()
        case .tile:
            Image(uiImage: GrainTiles.image(tile))
                .resizable(resizingMode: .tile)
                .opacity(opacity)
                .clipShape(shape)
                .allowsHitTesting(false)
        case .shader:
            let spec = GrainSpec.named(tile)
            shape.fill(.black)
                .turbulenceGrain(frequency: spec.frequency, octaves: spec.octaves, seed: spec.seed,
                                 opacity: opacity, mode: spec.shaderMode)
                .allowsHitTesting(false)
        }
    }
}

/// The pre-rendered noise tiles are loose @3x PNGs in the bundle; load once.
@MainActor
enum GrainTiles {
    private static var cache: [String: UIImage] = [:]
    static func image(_ name: String) -> UIImage {
        if let hit = cache[name] { return hit }
        let img = UIImage(named: name) ?? UIImage()
        cache[name] = img
        return img
    }
}

// MARK: - Surfaces

/// A hand-drawn filled surface with its ink outline — the StoryCard / Panel frame.
struct OrganicSurface: ViewModifier {
    var fill: Color
    var stroke: Color
    var radius: Double = 22
    var seed: Double = 1
    var grain: GrainMode = .tile
    var grainOpacity: Double = 0.3

    func body(content: Content) -> some View {
        let shape = WobRectShape(radius: radius, seed: seed)
        content.background {
            ZStack {
                shape.fill(fill)
                GrainLayer(shape: shape, mode: grain, opacity: grainOpacity)
                shape.stroke(stroke, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
            }
        }
    }
}

extension View {
    func organicSurface(fill: Color, stroke: Color, radius: Double = 22, seed: Double = 1,
                        grain: GrainMode = .tile, grainOpacity: Double = 0.3) -> some View {
        modifier(OrganicSurface(fill: fill, stroke: stroke, radius: radius, seed: seed,
                                grain: grain, grainOpacity: grainOpacity))
    }
}

// MARK: - Button

/// OrganicButton. On the web the fill reveal grows from the *cursor* on hover;
/// touch has no hover, so the same reveal grows from the *finger* on press —
/// plus a light haptic and a slight scale, which the web cannot do.
struct OrganicButton: View {
    enum Variant { case primary, ghost, outline }

    let title: String
    var icon: String? = nil
    var variant: Variant = .primary
    var action: () -> Void

    @State private var pressPoint: CGPoint? = nil
    @State private var revealed = false

    private var fill: Color {
        switch variant {
        case .primary: Tokens.terracotta
        case .ghost, .outline: .clear
        }
    }
    private var stroke: Color {
        switch variant {
        case .primary: Tokens.terracottaInk
        case .ghost: Tokens.ghostStroke
        case .outline: Tokens.terracotta
        }
    }
    private var textColor: Color {
        switch variant {
        case .primary: Tokens.cream
        case .ghost: Tokens.text
        case .outline: Tokens.terracotta
        }
    }

    var body: some View {
        let shape = WobRectShape(radius: 16, seed: variant == .primary ? 3 : 401, options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.3, segmentsH: .range(2, 3), segmentsV: .count(1)))
        HStack(spacing: 8) {
            if let icon { Image(systemName: icon).font(.system(size: 14, weight: .semibold)) }
            Text(title).font(AppFonts.body(15, weight: .semibold)).tracking(0.3)
        }
        .foregroundStyle(textColor)
        .padding(.horizontal, 26)
        .padding(.vertical, 13)
        .background {
            GeometryReader { geo in
                ZStack {
                    shape.fill(fill)
                    if variant == .primary {
                        GrainLayer(shape: shape, mode: .tile, opacity: 0.38, tile: "grain-button")
                    }
                    // Ink reveal from the touch point.
                    if let p = pressPoint {
                        let maxR = hypot(max(p.x, geo.size.width - p.x), max(p.y, geo.size.height - p.y))
                        Circle()
                            .fill(variant == .primary ? Color.black.opacity(0.14) : Tokens.terracotta.opacity(0.14))
                            .frame(width: revealed ? maxR * 2 : 0, height: revealed ? maxR * 2 : 0)
                            .position(p)
                            .clipShape(shape)
                    }
                    shape.stroke(stroke, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                }
            }
        }
        .scaleEffect(revealed ? 0.97 : 1)
        .contentShape(shape)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { g in
                    guard pressPoint == nil else { return }
                    pressPoint = g.startLocation
                    withAnimation(.linear(duration: 0.34)) { revealed = true }
                }
                .onEnded { _ in
                    action()
                    withAnimation(.easeOut(duration: 0.2)) { revealed = false }
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(200))
                        pressPoint = nil
                    }
                }
        )
        .sensoryFeedback(.impact(weight: .light), trigger: revealed) { _, new in new }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { action() }
    }
}

// MARK: - Small atoms

struct TagPill: View {
    let text: String
    var fill: Color = Tokens.terracottaLight
    var stroke: Color = Tokens.terracotta
    var seed: Double = 5

    var body: some View {
        Text(text)
            .font(AppFonts.body(11, weight: .semibold))
            .tracking(0.4)
            .foregroundStyle(Tokens.text)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background {
                let shape = WobRectShape(radius: 11, seed: seed, options: WobRectOptions(
                    curve: 1.4, segmentsH: .count(2), segmentsV: .count(1)))
                shape.fill(fill)
                shape.stroke(stroke, lineWidth: Tokens.inkLight)
            }
    }
}

struct HandDrawnAvatar: View {
    let initials: String
    var color: Color = Tokens.terracottaLight
    var size: CGFloat = 32
    var seed: Double = 7

    var body: some View {
        let shape = WobRectShape(radius: size * 0.4, seed: seed, mag: size * 0.022,
                                 options: WobRectOptions(curve: 1.2, segmentsH: .count(2), segmentsV: .count(2)))
        Text(initials)
            .font(AppFonts.body(size * 0.36, weight: .bold))
            .foregroundStyle(Tokens.text)
            .frame(width: size, height: size)
            .background { shape.fill(color) }
            .overlay { shape.stroke(Tokens.ghostStroke.opacity(0.7), lineWidth: Tokens.inkLight) }
            .accessibilityHidden(true)
    }
}

struct WavyDivider: View {
    var color: Color = Tokens.fieldBorder
    var seed: Double = 17
    var amp: Double = 1.4

    var body: some View {
        WavyLineShape(seed: seed, amp: amp)
            .stroke(color, style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
            .frame(height: 6)
            .accessibilityHidden(true)
    }
}

/// The web's organic toggle (ToggleSwitch.tsx): wobbly pill track + wobbly knob.
struct OrganicToggle: View {
    @Binding var isOn: Bool
    var label: String
    var seed: Double = 9

    var body: some View {
        let track = wobRect(50, 28, 14, seed: seed, mag: 1.1, options: WobRectOptions(
            curve: 1.5, cornerJitter: 0.6, segmentsH: .range(1, 2), segmentsV: .range(3, 4)))
        let knob = wobCircle(10, 10, 10, seed: seed + 5, options: WobCircleOptions(segments: 8, mag: 0.5, cpJitter: 0.3))
        ZStack(alignment: .topLeading) {
            track.path().fill(isOn ? Tokens.terracotta : Tokens.toggleOff)
            track.path().stroke(isOn ? Tokens.terracottaDeep : Tokens.toggleOffStroke, lineWidth: Tokens.ink)
            knob.path().fill(Tokens.cream)
                .overlay(knob.path().stroke(Tokens.textMuted.opacity(0.4), lineWidth: Tokens.inkLight))
                .frame(width: 20, height: 20)
                .offset(x: isOn ? 26 : 4, y: 4)
        }
        .frame(width: 50, height: 28)
        .animation(.spring(response: 0.25, dampingFraction: 0.75), value: isOn)
        .contentShape(Rectangle())
        .onTapGesture { isOn.toggle() }
        .sensoryFeedback(.selection, trigger: isOn)
        .accessibilityRepresentation { Toggle(label, isOn: $isOn) }
    }
}

/// SketchLoader: six dashes travelling nose-to-tail around the two-lap wobLoop,
/// each one ink-lighter than the one ahead — the pen never lifts.
struct SketchLoader: View {
    var size: CGFloat = 64
    var color: Color = Tokens.terracotta
    private let links: [Double] = [0.12, 0.19, 0.28, 0.4, 0.55, 0.95]
    private let seg = 0.12
    private let loopSeconds = 2.6

    var body: some View {
        let c = Double(size / 2)
        let path = wobLoop(c, c, Double(size) * 0.34, Double(size) * 0.27, seed: 7,
                           options: WobLoopOptions(segments: 9, mag: Double(size) * 0.03, cpJitter: 0.7)).path()
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
        .frame(width: size, height: size)
        .accessibilityLabel("Loading")
    }

    /// One dash of the caravan; wraps across the loop's closing point.
    private struct Dash: Shape {
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
