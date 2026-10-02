import SwiftUI

/// The phone auth screens' sheet (the web's AuthCard below 640px): the auth
/// interior from one wavy pen line down, tucked at the foot of the screen —
/// no frame and no bottom rule, the paper running on under the home
/// indicator. The line turns about once every 68pt, 4.5 high, in the auth
/// ink at INK_LIGHT; the grain lies over everything inside, words included
/// (GrainOverlay 0.04: ink at 2×). Padding: 40 over the content (the line
/// lives in it), 20 under (the screen's own inset adds the home indicator),
/// clamp(20, 6.4% of the width, 28) at the sides.
public struct AuthSheet<Content: View>: View {
    let width: CGFloat
    let seed: Double
    let content: Content

    /// `width` is the screen's, for the side padding.
    public init(width: CGFloat, seed: Double = 313, @ViewBuilder content: () -> Content) {
        self.width = width
        self.seed = seed
        self.content = content()
    }

    /// How far the paper runs on past the sheet's own box: under the home
    /// indicator, through a bottom overscroll, and down a screen whose sheet
    /// fills what the cover leaves (onboarding). Drawn only, never laid out.
    static var runOn: CGFloat { 1000 }

    public var body: some View {
        content
            .padding(.top, 40)
            .padding(.horizontal, min(28, max(20, width * 0.064)))
            .padding(.bottom, 20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(alignment: .top) {
                AuthSheetShape(seed: seed, closed: true)
                    .fill(Tokens.authInterior)
                    .padding(.bottom, -Self.runOn)
            }
            .overlay(alignment: .top) {
                ZStack {
                    GrainLayer(shape: AuthSheetShape(seed: seed, closed: true), mode: .tile, opacity: 0.08, tile: "grain-overlay")
                    AuthSheetShape(seed: seed, closed: false)
                        .stroke(Tokens.authBorder, style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
                }
                .padding(.bottom, -Self.runOn)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
    }
}

/// The sheet's top edge — `wavyPoints` at y 7, amplitude 4.5, a step per
/// ~68pt (at least four) — as the stroke alone or, closed, the fill below it.
public nonisolated struct AuthSheetShape: Shape {
    public var seed: Double
    public var closed: Bool

    /// How far under the sheet's top the line runs: room for its 4.5 swing and half the pen.
    public static let waveY: CGFloat = 7

    public init(seed: Double = 313, closed: Bool) {
        self.seed = seed
        self.closed = closed
    }

    public func path(in rect: CGRect) -> Path {
        let w = Double(rect.width)
        guard w > 0 else { return Path() }
        let steps = max(4, Int(jsRound(w / 68)))
        var p = pointsToBezier(wavyPoints(w, y0: Double(Self.waveY), amp: 4.5, seed: seed, steps: steps))
            .path(offsetX: Double(rect.minX), offsetY: Double(rect.minY))
        if closed {
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            p.closeSubpath()
        }
        return p
    }
}
