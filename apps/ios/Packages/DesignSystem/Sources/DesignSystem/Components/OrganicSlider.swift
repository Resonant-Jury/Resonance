import SwiftUI

/// The web's OrganicSlider (atoms/OrganicSlider): one thick wavy pen stroke for the track, the same
/// stroke in terracotta up to the value, and a slightly irregular cream knob with a terracotta rim.
/// Dragged anywhere along it, or adjusted by VoiceOver (a tenth of the range a swipe).
public struct OrganicSlider: View {
    @Binding var value: Double
    let range: ClosedRange<Double>
    var step: Double
    var seed: Double
    let label: String
    @State private var width: CGFloat = 0

    /// The bar's stroke and the knob's radius (TRACK_SW, KNOB_R).
    static let trackWidth: CGFloat = 7
    static let knobRadius: CGFloat = 11
    static var height: CGFloat { knobRadius * 2 + 4 }

    public init(value: Binding<Double>, in range: ClosedRange<Double>, step: Double = 0.01, seed: Double = 5, label: String) {
        self._value = value
        self.range = range
        self.step = step
        self.seed = seed
        self.label = label
    }

    private var fraction: Double {
        let span = range.upperBound - range.lowerBound
        return span > 0 ? min(max((value - range.lowerBound) / span, 0), 1) : 0
    }

    public var body: some View {
        let r = Self.knobRadius
        let pad = r + 1
        let thumbX = pad + CGFloat(fraction) * max(0, width - pad * 2)
        let capPad = Self.trackWidth / 2 + 1
        ZStack(alignment: .topLeading) {
            if width > 0 {
                let bar = SliderBarShape(seed: seed, capPad: capPad)
                bar.stroke(OKLCHColor.color(0.84, 0.022, 75), style: StrokeStyle(lineWidth: Self.trackWidth, lineCap: .round))
                bar.stroke(Tokens.terracotta, style: StrokeStyle(lineWidth: Self.trackWidth, lineCap: .round))
                    .mask(alignment: .leading) { Rectangle().frame(width: thumbX) }
                let knob = WobCircleShape(seed: seed + 5, options: WobCircleOptions(segments: 9, mag: 0.7, cpJitter: 0.4))
                ZStack {
                    knob.fill(Tokens.cream)
                    knob.stroke(Tokens.terracotta, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                }
                .frame(width: r * 2, height: r * 2)
                .offset(x: thumbX - r, y: Self.height / 2 - r)
            }
        }
        .frame(height: Self.height)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { g in set(fractionAt: g.location.x, pad: pad) }
        )
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityValue("\(Int((fraction * 100).rounded()))%")
        .accessibilityAdjustableAction { direction in
            let nudge = (range.upperBound - range.lowerBound) / 10
            switch direction {
            case .increment: value = snapped(value + nudge)
            case .decrement: value = snapped(value - nudge)
            @unknown default: break
            }
        }
    }

    private func set(fractionAt x: CGFloat, pad: CGFloat) {
        let usable = max(1, width - pad * 2)
        let f = Double(min(max((x - pad) / usable, 0), 1))
        value = snapped(range.lowerBound + f * (range.upperBound - range.lowerBound))
    }

    private func snapped(_ v: Double) -> Double {
        let clamped = min(max(v, range.lowerBound), range.upperBound)
        guard step > 0 else { return clamped }
        return min(max(range.lowerBound + ((clamped - range.lowerBound) / step).rounded() * step, range.lowerBound), range.upperBound)
    }
}

/// `wavyLine(barLen, seed, 2.6, max(4, round(barLen / 38)))` along the middle, inset so its round
/// ends aren't cut.
nonisolated struct SliderBarShape: Shape {
    let seed: Double
    let capPad: CGFloat

    func path(in rect: CGRect) -> Path {
        let len = Double(max(0, rect.width - capPad * 2))
        guard len > 0 else { return Path() }
        return wavyLine(len, seed: seed, amp: 2.6, steps: max(4, Int((len / 38).rounded())))
            .path(offsetX: Double(rect.minX + capPad), offsetY: Double(rect.midY))
    }
}

/// HandDrawnAvatar's outline at any size D: `wobRect(D, D, 0.4D, seed, 0.022D, {segmentsH 1,
/// segmentsV 1, curve 1.3, cornerJitter 3.2, cornerOffset 0.06D})` (`avatarWobPath`).
public nonisolated struct AvatarOutlineShape: Shape {
    public var seed: Double

    public init(seed: Double) { self.seed = seed }

    public func path(in rect: CGRect) -> Path {
        let d = Double(min(rect.width, rect.height))
        guard d > 0 else { return Path() }
        return WobRectShape(radius: d * 0.4, seed: seed, mag: d * 0.022, options: WobRectOptions(
            curve: 1.3, cornerJitter: 3.2, cornerOffset: d * 0.06, segmentsH: .count(1), segmentsV: .count(1)))
            .path(in: rect)
    }
}
