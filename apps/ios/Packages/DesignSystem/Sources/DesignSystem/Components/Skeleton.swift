import SwiftUI

/// Skeleton.tsx: one placeholder block with the warm shimmer — sand, then a
/// light band of the card's hue sweeping across, 1.5s a pass. Plain sand
/// under Reduce Motion (the web's `animation: none`).
public struct SkeletonBlock: View {
    var width: CGFloat?
    var fraction: CGFloat?
    var height: CGFloat?
    var radius: CGFloat
    var circle: Bool
    var alignment: Alignment

    /// `width` nil fills the row (or `fraction` of it), `height` nil the
    /// height it is offered (a cover); `radius` is the web's default 7.
    public init(width: CGFloat? = nil, fraction: CGFloat? = nil, height: CGFloat? = 14, radius: CGFloat = 7,
                circle: Bool = false, alignment: Alignment = .leading) {
        self.width = width
        self.fraction = fraction
        self.height = height
        self.radius = radius
        self.circle = circle
        self.alignment = alignment
    }

    @Environment(\.skeletonHue) private var hue
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public var body: some View {
        if circle {
            let side = width ?? height ?? 14
            fill.clipShape(Circle()).frame(width: side, height: side)
        } else if let fraction {
            GeometryReader { geo in
                fill.clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                    .frame(width: geo.size.width * fraction)
                    .frame(maxWidth: .infinity, alignment: alignment)
            }
            .frame(height: height)
        } else {
            fill.clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                .frame(width: width, height: height)
                .frame(maxWidth: width == nil ? .infinity : nil, maxHeight: height == nil ? .infinity : nil, alignment: .leading)
        }
    }

    @ViewBuilder private var fill: some View {
        if reduceMotion {
            Self.base
        } else {
            let highlight = Self.highlight(hue)
            TimelineView(.animation) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.5) / 1.5
                Self.shimmer(phase: Self.ease(t), highlight: highlight)
            }
            .accessibilityHidden(true)
        }
    }

    /// color-mix(in oklch, color-mix(cream-dark 94%, text) 85%, transparent).
    static let base = OKLCHColor.color(0.8898, 0.0187, 74.1, alpha: 0.85)

    /// color-mix(in oklch, <highlight> 50%, cream), the highlight being
    /// oklch(88% .08 hue) on a card, or terracotta-light (hue 55) elsewhere.
    static func highlight(_ hue: Double?) -> Color {
        let h = hue ?? 55
        let toCream = (75 - h + 540).truncatingRemainder(dividingBy: 360) - 180
        return OKLCHColor.color((0.88 + 0.965) / 2, (0.08 + 0.015) / 2, h + toCream / 2)
    }

    /// The gradient is 4× the block wide (stops at 25/37/63%) and slides from
    /// background-position 100% to −100%, repeating — so the light band
    /// crosses once per pass, left to right.
    static func shimmer(phase: Double, highlight: Color) -> some View {
        // The band's peak, in block widths from the left edge; the repeating
        // copy four widths back takes over near the end of a pass.
        var peak = -1.52 + 6 * phase
        if peak > 2.2 { peak -= 4 }
        return LinearGradient(stops: [
            .init(color: base, location: 0),
            .init(color: highlight, location: 0.48 / 1.52),
            .init(color: base, location: 1),
        ], startPoint: UnitPoint(x: peak - 0.48, y: 0.5), endPoint: UnitPoint(x: peak + 1.04, y: 0.5))
    }

    /// CSS `ease` (cubic-bezier(.25, .1, .25, 1)) at progress `x`.
    static func ease(_ x: Double) -> Double {
        func bezier(_ t: Double, _ p1: Double, _ p2: Double) -> Double {
            let u = 1 - t
            return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t
        }
        var lo = 0.0, hi = 1.0
        for _ in 0..<20 {
            let mid = (lo + hi) / 2
            if bezier(mid, 0.25, 0.25) < x { lo = mid } else { hi = mid }
        }
        return bezier((lo + hi) / 2, 0.1, 1)
    }
}

extension EnvironmentValues {
    /// The card hue a skeleton's shimmer takes (a StoryCard sets
    /// --skeleton-highlight to its own family); nil is the theme's.
    @Entry public var skeletonHue: Double? = nil
}
