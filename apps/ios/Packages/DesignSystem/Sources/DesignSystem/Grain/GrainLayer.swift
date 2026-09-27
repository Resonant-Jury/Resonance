import SwiftUI
import UIKit

// MARK: - Grain

public enum GrainMode: String, CaseIterable, Identifiable, Sendable {
    case none, tile, shader
    public var id: String { rawValue }
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
public struct GrainLayer<S: Shape>: View {
    let shape: S
    var mode: GrainMode
    var opacity: Double
    var tile: String

    public init(shape: S, mode: GrainMode = .tile, opacity: Double = 0.3, tile: String = "grain-card") {
        self.shape = shape
        self.mode = mode
        self.opacity = opacity
        self.tile = tile
    }

    public var body: some View {
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

/// The pre-rendered noise tiles are @3x PNGs in this package; load once.
enum GrainTiles {
    private static var cache: [String: UIImage] = [:]
    static func image(_ name: String) -> UIImage {
        if let hit = cache[name] { return hit }
        let img = UIImage(named: name, in: .module, compatibleWith: nil) ?? UIImage()
        cache[name] = img
        return img
    }
}
