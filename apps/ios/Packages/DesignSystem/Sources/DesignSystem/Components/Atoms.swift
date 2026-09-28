import SwiftUI

// MARK: - Small atoms

public struct TagPill: View {
    let text: String
    var fill: Color
    var seed: Double?

    /// The web's TagPill: auto wobble, the given fill, a faint ink outline.
    public init(_ text: String, fill: Color = Tokens.yellow, seed: Double? = nil) {
        self.text = text
        self.fill = fill
        self.seed = seed
    }

    /// TagPill's automatic seed: a hash of the label, so a tag always wobbles the same.
    static func autoSeed(_ s: String) -> Double {
        var hash: Int32 = 7
        for unit in s.utf16 { hash = (hash &<< 5) &- hash &+ Int32(unit) }
        return Double(abs(Int(hash)) % 9973 + 1)
    }

    public var body: some View {
        Text(text)
            .font(AppFonts.body(12, weight: .semibold))
            .tracking(0.2)
            .foregroundStyle(Tokens.text)
            .padding(.horizontal, 11)
            .frame(minHeight: 24)
            .background {
                GeometryReader { geo in
                    let shape = WobRectShape(radius: geo.size.height / 2, seed: seed ?? Self.autoSeed(text))
                    shape.fill(fill)
                    shape.stroke(Color(.displayP3, red: 0.25, green: 0.19, blue: 0.13, opacity: 0.45), lineWidth: Tokens.ink)
                }
            }
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

    public var body: some View {
        let shape = WobRectShape(radius: size * 0.4, seed: seed, mag: size * 0.022,
                                 options: WobRectOptions(curve: 1.2, segmentsH: .count(2), segmentsV: .count(2)))
        ZStack {
            shape.fill(color)
            Text(initials)
                .font(AppFonts.body(size * 0.36, weight: .bold))
                .foregroundStyle(Tokens.text)
            if let imageURL {
                OrganicAvatarPhoto(url: imageURL).clipShape(shape)
            }
        }
        .frame(width: size, height: size)
        .overlay { shape.stroke(Tokens.ghostStroke.opacity(0.7), lineWidth: Tokens.inkLight) }
        .accessibilityHidden(true)
    }
}

public struct WavyDivider: View {
    var color: Color
    var seed: Double
    var amp: Double
    var lineWidth: CGFloat

    public init(color: Color = Tokens.fieldBorder, seed: Double = 17, amp: Double = 1.4, lineWidth: CGFloat = Tokens.inkLight) {
        self.color = color
        self.seed = seed
        self.amp = amp
        self.lineWidth = lineWidth
    }

    public var body: some View {
        WavyLineShape(seed: seed, amp: amp)
            .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
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
