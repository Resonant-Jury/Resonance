import Nuke
import NukeUI
import SwiftUI

/// OrganicImage: a remote image cover-fitted inside a hand-drawn curve. As on
/// the web, the picture bleeds past its box by the wobble's outward swing so
/// the bulges land on real pixels rather than on nothing.
public struct OrganicImage<Placeholder: View>: View {
    let url: URL?
    let seed: Double
    let radius: Double
    let grain: Double
    let placeholder: Placeholder

    /// `grain` is the web's GrainOverlay opacity laid over the picture (the
    /// story cards' paper texture, StoryGrain.cover); 0 draws none.
    public init(url: URL?, seed: Double, radius: Double = 18, grain: Double = 0, @ViewBuilder placeholder: () -> Placeholder) {
        self.url = url
        self.seed = seed
        self.radius = radius
        self.grain = grain
        self.placeholder = placeholder()
    }

    public var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let mag = min(w, h) * 0.05
            let bleed = (mag + 6 + 4).rounded(.up)
            ZStack {
                placeholder
                if let url {
                    LazyImage(url: url) { state in
                        if let image = state.image {
                            image.resizable().scaledToFill()
                        }
                    }
                }
                if grain > 0 {
                    // Above the photo too (the web's overlay sits at z 10): ink at 2×.
                    GrainLayer(shape: Rectangle(), mode: .tile, opacity: grain * 2, tile: "grain-overlay")
                }
            }
            .frame(width: w + bleed * 2, height: h + bleed * 2)
            .clipShape(OrganicImageShape(seed: seed, radius: radius, bleed: bleed))
            .offset(x: -bleed, y: -bleed)
        }
    }
}

/// The clip, drawn in the bled frame's coordinates (so offset by `bleed`).
nonisolated struct OrganicImageShape: Shape {
    let seed: Double
    let radius: Double
    let bleed: Double

    func path(in rect: CGRect) -> Path {
        let w = rect.width - bleed * 2, h = rect.height - bleed * 2
        guard w > 0, h > 0 else { return Path() }
        return wobRect(w, h, min(radius, min(w, h) / 2), seed: seed, mag: min(w, h) * 0.05, options: WobRectOptions(
            curve: 0.4, cornerJitter: 1.1, cornerOffset: 6, segmentsH: .range(3, 4), segmentsV: .range(2, 3)
        )).path(offsetX: bleed, offsetY: bleed)
    }
}

extension OrganicImage where Placeholder == Color {
    public init(url: URL?, seed: Double, radius: Double = 18, grain: Double = 0, fill: Color) {
        self.init(url: url, seed: seed, radius: radius, grain: grain) { fill }
    }
}

/// A remote picture filling its frame (cover), decoded at the size it's shown
/// at (`pixelSize`, in points × scale) instead of full resolution — for many
/// small pictures at once, like the thought map's card thumbnails.
public struct RemoteImage: View {
    let url: URL
    let pixelSize: CGSize

    public init(url: URL, pixelSize: CGSize) {
        self.url = url
        self.pixelSize = pixelSize
    }

    public var body: some View {
        LazyImage(request: ImageRequest(url: url, processors: [.resize(size: pixelSize, unit: .pixels, contentMode: .aspectFill)])) { state in
            if let image = state.image { image.resizable().scaledToFill() }
        }
    }
}
