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

    public static func uiFont(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
        let traits: [UIFontDescriptor.TraitKey: Any] = [.weight: weight]
        let attributes: [UIFontDescriptor.AttributeName: Any] = [
            .family: family.rawValue,
            .traits: traits,
            .cascadeList: [UIFontDescriptor(fontAttributes: [.family: family.cjkFallback, .traits: traits])],
        ]
        return UIFont(descriptor: UIFontDescriptor(fontAttributes: attributes), size: size)
    }

    /// Scales with Dynamic Type relative to `textStyle`, like the system fonts do.
    public static func font(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular,
                            relativeTo textStyle: UIFont.TextStyle = .body) -> Font {
        let base = uiFont(family, size: size, weight: weight)
        return Font(UIFontMetrics(forTextStyle: textStyle).scaledFont(for: base))
    }

    public static func heading(_ size: CGFloat, weight: UIFont.Weight = .bold) -> Font {
        font(.heading, size: size, weight: weight, relativeTo: .title1)
    }

    public static func body(_ size: CGFloat, weight: UIFont.Weight = .regular) -> Font {
        font(.body, size: size, weight: weight)
    }

    public static func handwritten(_ size: CGFloat) -> Font {
        font(.handwritten, size: size)
    }
}
