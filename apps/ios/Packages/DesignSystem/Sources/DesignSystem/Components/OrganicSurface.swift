import SwiftUI

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
    /// A hand-drawn filled surface with its ink outline behind the content.
    public func organicSurface(fill: Color, stroke: Color, radius: Double = 22, seed: Double = 1,
                        grain: GrainMode = .tile, grainOpacity: Double = 0.3) -> some View {
        modifier(OrganicSurface(fill: fill, stroke: stroke, radius: radius, seed: seed,
                                grain: grain, grainOpacity: grainOpacity))
    }
}
