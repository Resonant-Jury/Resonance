import SwiftUI
import UIKit

/// The web's SquareFlag (SquareFlag.tsx): a square national flag cropped by
/// the avatar's hand-drawn outline — a generous corner (0.3 of the side), one
/// assertive turn a side, the corners jittered and shifted — with a faint ink
/// rim, so flags sit in the pen-sketch world instead of reading as crisp
/// emoji. The art is the web's own (public/flags, rasterised by
/// scripts/apps/flags.ts); a region without one draws nothing.
public struct SquareFlag: View {
    let code: String
    var size: CGFloat
    var seed: Double?

    /// `code` is an ISO 3166-1 alpha-2 region, either case.
    public init(_ code: String, size: CGFloat = 18, seed: Double? = nil) {
        self.code = code.lowercased()
        self.size = size
        self.seed = seed
    }

    public static func has(_ code: String) -> Bool { image(code.lowercased()) != nil }

    private static func image(_ code: String) -> UIImage? {
        UIImage(named: "flag-\(code)", in: .module, compatibleWith: nil)
    }

    public var body: some View {
        if let image = Self.image(code) {
            let shape = WobRectShape(radius: size * 0.3, seed: seed ?? Double(seedFromString(code)), mag: size * 0.05,
                                     options: WobRectOptions(curve: 1.6, cornerJitter: 3, cornerOffset: size * 0.06,
                                                             segmentsH: .count(1), segmentsV: .count(1)))
            // The art overscans the square so an outward bulge of the wobble stays covered.
            let pad = max(1, size * 0.06)
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: size + pad * 2, height: size + pad * 2)
                .frame(width: size, height: size)
                .clipShape(shape)
                .overlay { shape.stroke(OKLCHColor.color(0.36, 0.06, 60, alpha: 0.55), style: StrokeStyle(lineWidth: Tokens.inkLight, lineJoin: .round)) }
                .accessibilityHidden(true)
        }
    }
}
