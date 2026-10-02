import CoreText
import SwiftUI
import UIKit

/// The web's type stack (tokens.css), rebuilt for iOS.
///
/// CSS `font-family: 'Playfair Display', 'Noto Serif TC', serif` falls back
/// *per glyph*: Latin in Playfair, CJK in Noto Serif TC. A bare
/// `Font.custom("Playfair Display")` would send CJK to the system's PingFang
/// instead, so every font here carries a cascade list mirroring the CSS stack.
public enum AppFonts {
    public enum Family: String, Sendable {
        case heading = "Playfair Display"
        case body = "DM Sans"
        case handwritten = "ChenYuluoyan 2.0"

        /// CJK fallback per CSS stack.
        var cjkFallback: String {
            switch self {
            case .heading, .handwritten: "Noto Serif TC"
            case .body: "Noto Sans TC"
            }
        }

        /// The text style whose growth the family follows: headings grow like titles.
        var textStyle: UIFont.TextStyle { self == .heading ? .title1 : .body }
    }

    /// Registers the bundled fonts (the app target ships apps/shared/fonts
    /// in a `fonts` folder). Call once at launch.
    public static func register(bundle: Bundle = .main) {
        let urls = bundle.urls(forResourcesWithExtension: "ttf", subdirectory: "fonts") ?? []
        for url in urls {
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                let reason = error?.takeRetainedValue().localizedDescription ?? "unknown"
                // Already registered (e.g. SwiftUI previews) is harmless.
                if !reason.contains("already") { print("Font registration failed: \(url.lastPathComponent) \(reason)") }
            }
        }
    }

    /// The browser's synthetic italic: none of the bundled faces has an italic
    /// (Noto TC has none at all), so CSS `font-style: italic` leans every glyph
    /// by the same 0.25 shear on its baseline — done here with the font matrix.
    static let obliqueMatrix = CGAffineTransform(a: 1, b: 0, c: 0.25, d: 1, tx: 0, ty: 0)

    public static func uiFont(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular, oblique: Bool = false) -> UIFont {
        let traits: [UIFontDescriptor.TraitKey: Any] = [.weight: weight]
        var fallback: [UIFontDescriptor.AttributeName: Any] = [.family: family.cjkFallback, .traits: traits]
        var attributes: [UIFontDescriptor.AttributeName: Any] = [.family: family.rawValue, .traits: traits]
        if oblique {
            attributes[.matrix] = obliqueMatrix
            fallback[.matrix] = obliqueMatrix
        }
        attributes[.cascadeList] = [UIFontDescriptor(fontAttributes: fallback)]
        return UIFont(descriptor: UIFontDescriptor(fontAttributes: attributes), size: size)
    }

    /// The height of a CSS line box at `line-height: normal`. It is the face's
    /// ascent plus descent — until some of the text needs the CJK fallback
    /// (DM Sans has no Han glyphs): then the browser stacks the fallback's own
    /// box on the same baseline, so the line takes the taller ascent over the
    /// taller descent (DM Sans 16 → 20.8, its Han text → 23.5). UIKit and
    /// SwiftUI keep to the primary face's box, which is why this exists.
    public static func normalLineBox(_ family: Family, size: CGFloat, text: String) -> CGFloat {
        let primary = uiFont(family, size: size)
        let box = primary.ascender - primary.descender
        let covered = CTFontCopyCharacterSet(primary as CTFont) as CharacterSet
        guard !text.unicodeScalars.allSatisfy(covered.contains) else { return box }
        let fallback = UIFont(descriptor: UIFontDescriptor(fontAttributes: [.family: family.cjkFallback]), size: size)
        return max(primary.ascender, fallback.ascender) + max(-primary.descender, -fallback.descender)
    }

    /// `uiFont` at the person's text size: it follows Dynamic Type relative to
    /// `textStyle` (the family's own by default) along `TextScale`'s curve, not
    /// without limit like `UIFontMetrics.scaledFont`. For text drawn in CSS line
    /// boxes (`CSSText`, `ProseStyle`), whose line height is a multiple of the
    /// font's size, so it grows with it. `uiFont` stays the fixed face, for
    /// what is measured at the drawn size (the thought map).
    public static func scaledUIFont(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular, oblique: Bool = false,
                                    relativeTo textStyle: UIFont.TextStyle? = nil) -> UIFont {
        uiFont(family, size: size * TextScale.factor(relativeTo: textStyle ?? family.textStyle), weight: weight, oblique: oblique)
    }

    /// Scales with Dynamic Type like `scaledUIFont`, for SwiftUI text, in whole
    /// points: `UIFontMetrics.scaledFont`, which this used before, rounded too,
    /// so a designed 10.5 (the tab labels) has always been drawn at 11. Text in
    /// CSS line boxes never was rounded.
    public static func font(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular, oblique: Bool = false,
                            relativeTo textStyle: UIFont.TextStyle? = nil) -> Font {
        let scaled = (size * TextScale.factor(relativeTo: textStyle ?? family.textStyle)).rounded()
        return Font(uiFont(family, size: scaled, weight: weight, oblique: oblique))
    }

    public static func heading(_ size: CGFloat, weight: UIFont.Weight = .bold) -> Font {
        font(.heading, size: size, weight: weight)
    }

    public static func body(_ size: CGFloat, weight: UIFont.Weight = .regular, oblique: Bool = false) -> Font {
        font(.body, size: size, weight: weight, oblique: oblique)
    }

    public static func handwritten(_ size: CGFloat) -> Font {
        font(.handwritten, size: size)
    }
}
