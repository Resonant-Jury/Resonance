import SwiftUI

// MARK: - Small atoms

public struct TagPill: View {
    let text: String
    var fill: Color
    var stroke: Color
    var seed: Double

    public init(_ text: String, fill: Color = Tokens.terracottaLight, stroke: Color = Tokens.terracotta, seed: Double = 5) {
        self.text = text
        self.fill = fill
        self.stroke = stroke
        self.seed = seed
    }

    public var body: some View {
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

public struct HandDrawnAvatar: View {
    let initials: String
    var color: Color
    var size: CGFloat
    var seed: Double

    public init(initials: String, color: Color = Tokens.terracottaLight, size: CGFloat = 32, seed: Double = 7) {
        self.initials = initials
        self.color = color
        self.size = size
        self.seed = seed
    }

    public var body: some View {
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

public struct WavyDivider: View {
    var color: Color
    var seed: Double
    var amp: Double

    public init(color: Color = Tokens.fieldBorder, seed: Double = 17, amp: Double = 1.4) {
        self.color = color
        self.seed = seed
        self.amp = amp
    }

    public var body: some View {
        WavyLineShape(seed: seed, amp: amp)
            .stroke(color, style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
            .frame(height: 6)
            .accessibilityHidden(true)
    }
}

/// The web's organic toggle (ToggleSwitch.tsx): wobbly pill track + wobbly knob.
public struct OrganicToggle: View {
    @Binding var isOn: Bool
    var label: String
    var seed: Double

    public init(isOn: Binding<Bool>, label: String, seed: Double = 9) {
        _isOn = isOn
        self.label = label
        self.seed = seed
    }

    public var body: some View {
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
public struct SketchLoader: View {
    var size: CGFloat
    var color: Color

    public init(size: CGFloat = 64, color: Color = Tokens.terracotta) {
        self.size = size
        self.color = color
    }
    private let links: [Double] = [0.12, 0.19, 0.28, 0.4, 0.55, 0.95]
    private let seg = 0.12
    private let loopSeconds = 2.6

    public var body: some View {
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
