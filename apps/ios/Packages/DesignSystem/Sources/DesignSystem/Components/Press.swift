import SwiftUI

// MARK: - Press feedback

/// How long the ink takes to reach the far edge, and to lift — every control's
/// press (buttons, bare glyphs, tabs, menu rows) runs on these.
enum InkTiming {
    static let spread = Animation.timingCurve(0.2, 0.8, 0.3, 1, duration: 0.3)
    static let lift = Animation.easeOut(duration: 0.22)
}

/// Press feedback in the hand-drawn language, for controls with no frame of
/// their own (a bare glyph in a bar, a tab): ink spreading inside a wobbly
/// squircle round the control — each press a fresh wobble — and lifting once
/// the finger does, after the spread has run its course. The Android twin is
/// `OrganicIndication`; OrganicButton and the menu rows spread the same ink
/// from the finger.
public struct OrganicPressStyle: ButtonStyle {
    var inset: CGFloat
    var color: Color

    /// `inset` pulls the wash in from the hit box (a 20pt glyph in a 44pt box washes a 36pt squircle).
    public init(inset: CGFloat = 4, color: Color = Tokens.terracotta.opacity(0.14)) {
        self.inset = inset
        self.color = color
    }

    public func makeBody(configuration: Configuration) -> some View {
        PressWash(isPressed: configuration.isPressed, inset: inset, color: color) { configuration.label }
    }
}

private struct PressWash<Label: View>: View {
    let isPressed: Bool
    let inset: CGFloat
    let color: Color
    @ViewBuilder let label: Label
    @State private var reach: CGFloat = 0
    @State private var ink: Double = 0
    @State private var seed = Double(Int.random(in: 1..<9973))
    @State private var pressedAt: Date?

    var body: some View {
        label
            .background {
                GeometryReader { geo in
                    let box = geo.size.width > 2 * inset && geo.size.height > 2 * inset
                        ? CGSize(width: geo.size.width - 2 * inset, height: geo.size.height - 2 * inset) : geo.size
                    let far = hypot(box.width, box.height) / 2 + 4
                    Circle()
                        .fill(color)
                        .frame(width: far * 2 * reach, height: far * 2 * reach)
                        .frame(width: box.width, height: box.height)
                        .clipShape(OrganicWashShape(seed: seed))
                        .opacity(ink)
                        .position(x: geo.size.width / 2, y: geo.size.height / 2)
                }
                .allowsHitTesting(false)
            }
            .onChange(of: isPressed) { _, pressed in
                if pressed {
                    seed = Double(Int.random(in: 1..<9973))
                    pressedAt = .now
                    ink = 1
                    reach = 0
                    withAnimation(InkTiming.spread) { reach = 1 }
                } else {
                    // A quick tap still shows the whole spread before it lifts.
                    let held = pressedAt.map { Date.now.timeIntervalSince($0) } ?? 1
                    let wait = max(0, 0.3 - held)
                    Task { @MainActor in
                        if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
                        withAnimation(InkTiming.lift) { ink = 0 }
                    }
                }
            }
    }
}

/// The wash's outline: small or squarish controls get the avatar's lopsided
/// squircle (one turn a side); long ones a pill of the button's calm wobble.
public nonisolated struct OrganicWashShape: Shape {
    public var seed: Double

    public init(seed: Double) {
        self.seed = seed
    }

    public func path(in rect: CGRect) -> Path {
        let short = Double(min(rect.width, rect.height))
        let long = Double(max(rect.width, rect.height))
        guard short > 0 else { return Path() }
        if long / short < 1.6 {
            return WobRectShape(radius: short * 0.42, seed: seed, mag: short * 0.03, options: WobRectOptions(
                curve: 1.4, cornerJitter: 2.4, cornerOffset: short * 0.05, segmentsH: .count(1), segmentsV: .count(1)))
                .path(in: rect)
        }
        return WobRectShape(radius: min(16, short / 2), seed: seed, mag: short * 0.05, options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.3, cornerOffset: short * 0.04, segmentsH: .range(2, 3), segmentsV: .count(1)))
            .path(in: rect)
    }
}
