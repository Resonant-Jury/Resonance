import UIKit

/// A cover photo on its way up: scaled and re-encoded on the device, as the
/// web compresses before /api/upload, and its accent hue read from its pixels.
enum CoverImage {
    /// JPEG at most 2048px on the long side — well under the upload's 8 MB cap.
    static func jpeg(_ image: UIImage, maxSide: CGFloat = 2048, quality: CGFloat = 0.85) -> Data? {
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: quality)
    }

    /// The card palette's hues (CARD_HUES), in palette order.
    static let cardHues: [Double] = [55, 290, 140, 88, 215, 18]

    /// lib/images/accentHue + lib/design/dominantHue: the chroma-weighted mean
    /// OKLCH hue of a 32×32 thumbnail, skipping greys and near black/white,
    /// snapped to the nearest card hue. Nil for an achromatic picture.
    static func accentHue(_ image: UIImage) -> Double? {
        let side = 32
        guard let cg = image.cgImage else { return nil }
        var pixels = [UInt8](repeating: 0, count: side * side * 4)
        guard let ctx = CGContext(data: &pixels, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: side, height: side))
        var x = 0.0, y = 0.0, weight = 0.0
        for i in stride(from: 0, to: pixels.count, by: 4) where pixels[i + 3] >= 128 {
            let (l, c, h) = oklch(Double(pixels[i]), Double(pixels[i + 1]), Double(pixels[i + 2]))
            if c < 0.02 || l < 0.08 || l > 0.98 { continue }
            let rad = h * .pi / 180
            x += cos(rad) * c
            y += sin(rad) * c
            weight += c
        }
        guard weight > 0 else { return nil }
        var hue = atan2(y, x) * 180 / .pi
        if hue < 0 { hue += 360 }
        return cardHues.min { distance(hue, $0) < distance(hue, $1) }
    }

    private static func distance(_ a: Double, _ b: Double) -> Double {
        let d = abs(a - b).truncatingRemainder(dividingBy: 360)
        return d > 180 ? 360 - d : d
    }

    /// sRGB (0–255) → OKLCH, as dominantHue's rgbToOklch.
    private static func oklch(_ r8: Double, _ g8: Double, _ b8: Double) -> (Double, Double, Double) {
        func linear(_ v: Double) -> Double {
            let c = v / 255
            return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        let r = linear(r8), g = linear(g8), b = linear(b8)
        let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        let L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
        let A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
        let B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
        var h = atan2(B, A) * 180 / .pi
        if h < 0 { h += 360 }
        return (L, (A * A + B * B).squareRoot(), h)
    }
}
