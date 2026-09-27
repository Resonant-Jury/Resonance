import CoreText
import SwiftUI
import UIKit

/// The web's type stack, rebuilt for iOS.
///
/// CSS `font-family: 'Playfair Display', 'Noto Serif TC', serif` falls back
/// *per glyph*: Latin in Playfair, CJK in Noto Serif TC. A bare
/// `Font.custom("Playfair Display")` would send CJK to the system's PingFang
/// instead, so every font here carries a cascade list that mirrors the CSS
/// stack (`UIFontDescriptor.AttributeName.cascadeList`).
enum AppFonts {
    enum Family: String {
        case heading = "Playfair Display"
        case body = "DM Sans"
        case handwritten = "ChenYuluoyan 2.0"

        /// CJK fallback per CSS stack (tokens.css).
        var cjkFallback: String {
            switch self {
            case .heading, .handwritten: "Noto Serif TC"
            case .body: "Noto Sans TC"
            }
        }
    }

    /// How long registering the bundled fonts took (S5 reports it).
    nonisolated(unsafe) static var registrationSeconds: Double = 0
    nonisolated(unsafe) static var registeredCount = 0
    /// When false, CJK falls back to the system (PingFang) — S5 compares both.
    nonisolated(unsafe) static var useBundledCJK = true

    static func register() {
        let start = CFAbsoluteTimeGetCurrent()
        let urls = Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: "fonts") ?? []
        for url in urls {
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                print("Font registration failed: \(url.lastPathComponent) \(String(describing: error?.takeRetainedValue()))")
            }
        }
        registrationSeconds = CFAbsoluteTimeGetCurrent() - start
        registeredCount = urls.count
    }

    static func uiFont(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
        let traits: [UIFontDescriptor.TraitKey: Any] = [.weight: weight]
        var attributes: [UIFontDescriptor.AttributeName: Any] = [
            .family: family.rawValue,
            .traits: traits,
        ]
        if useBundledCJK {
            attributes[.cascadeList] = [
                UIFontDescriptor(fontAttributes: [.family: family.cjkFallback, .traits: traits]),
            ]
        }
        return UIFont(descriptor: UIFontDescriptor(fontAttributes: attributes), size: size)
    }

    static func font(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular) -> Font {
        Font(uiFont(family, size: size, weight: weight))
    }

    static func heading(_ size: CGFloat, weight: UIFont.Weight = .bold) -> Font { font(.heading, size: size, weight: weight) }
    static func body(_ size: CGFloat, weight: UIFont.Weight = .regular) -> Font { font(.body, size: size, weight: weight) }
}

/// CSS `line-height` puts half the extra leading above and half below each
/// line. SwiftUI's `lineSpacing` only adds space *between* lines, so the first
/// line sits higher than on the web. This label reproduces the CSS line box
/// exactly with fixed line heights and a baseline shift.
struct CSSText: UIViewRepresentable {
    let text: String
    let font: UIFont
    /// CSS line-height as a multiple of the font size (e.g. 1.7).
    let lineHeight: CGFloat
    var color: UIColor = UIColor(Tokens.text)

    func makeUIView(context: Context) -> UILabel {
        let label = UILabel()
        label.numberOfLines = 0
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return label
    }

    func updateUIView(_ label: UILabel, context: Context) {
        label.attributedText = CSSText.attributed(text, font: font, lineHeight: lineHeight, color: color)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
        let width = proposal.width ?? 320
        let size = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: size.height)
    }

    static func attributed(_ text: String, font: UIFont, lineHeight: CGFloat, color: UIColor) -> NSAttributedString {
        let lineBox = font.pointSize * lineHeight
        let style = NSMutableParagraphStyle()
        style.minimumLineHeight = lineBox
        style.maximumLineHeight = lineBox
        // UIKit bottom-aligns glyphs in a fixed line (baseline = box − descent);
        // CSS centres the primary font's content area, so lift by half the
        // leading. (Measured in S5: the often-quoted "/ 4" is off by ~1.6pt.)
        let offset = (lineBox - font.lineHeight) / 2
        return NSAttributedString(string: text, attributes: [
            .font: font,
            .paragraphStyle: style,
            .baselineOffset: offset,
            .foregroundColor: color,
        ])
    }
}

/// Exact CSS line boxes for TextKit: every line is `lineBox` tall and its
/// baseline sits at (lineBox + ascent − descent) / 2 of the *primary* font —
/// what browsers do — no matter which fallback font (e.g. Noto TC) drew the
/// glyphs. TextKit on its own uses each line's actual glyph fonts, which puts
/// all-CJK lines ~0.35pt off.
final class CSSLineBoxes: NSObject, NSLayoutManagerDelegate {
    let font: UIFont
    let lineBox: CGFloat
    init(font: UIFont, lineHeight: CGFloat) {
        self.font = font
        self.lineBox = font.pointSize * lineHeight
    }

    func layoutManager(_ layoutManager: NSLayoutManager,
                       shouldSetLineFragmentRect lineFragmentRect: UnsafeMutablePointer<CGRect>,
                       lineFragmentUsedRect: UnsafeMutablePointer<CGRect>,
                       baselineOffset: UnsafeMutablePointer<CGFloat>,
                       in textContainer: NSTextContainer,
                       forGlyphRange glyphRange: NSRange) -> Bool {
        lineFragmentRect.pointee.size.height = lineBox
        lineFragmentUsedRect.pointee.size.height = lineBox
        baselineOffset.pointee = (lineBox + font.ascender + font.descender) / 2 // descender is negative
        return true
    }
}
