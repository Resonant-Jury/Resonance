import SwiftUI

/// CSS `oklch(L C H [/ a])` → Display P3, the same conversion
/// scripts/native/tokens.ts uses for the static tokens. For colors that
/// arrive as data (a profile's accent color is stored as its CSS string).
public enum OKLCHColor {
    public static func parse(_ css: String) -> Color? {
        let pattern = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/
        guard let m = css.firstMatch(of: pattern),
              var L = Double(m.1), let C = Double(m.3), let H = Double(m.4) else { return nil }
        if m.2 == "%" { L /= 100 }
        let alpha = m.5.flatMap { Double($0) } ?? 1
        let (r, g, b) = displayP3(L: L, C: C, H: H)
        return Color(.displayP3, red: r, green: g, blue: b, opacity: alpha)
    }

    static func displayP3(L: Double, C: Double, H: Double) -> (Double, Double, Double) {
        let a = C * cos(H * .pi / 180), b = C * sin(H * .pi / 180)
        let l = pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
        let m = pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
        let s = pow(L - 0.0894841775 * a - 1.291485548 * b, 3)
        let sr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
        let sg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
        let sb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
        let p3 = (0.8224621 * sr + 0.177538 * sg,
                  0.0331941 * sr + 0.9668058 * sg,
                  0.0170827 * sr + 0.0723974 * sg + 0.9105199 * sb)
        func encode(_ x: Double) -> Double {
            let v = min(1, max(0, x))
            return v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1 / 2.4) - 0.055
        }
        return (encode(p3.0), encode(p3.1), encode(p3.2))
    }
}
