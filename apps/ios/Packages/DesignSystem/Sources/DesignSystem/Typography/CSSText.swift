import SwiftUI
import UIKit

/// CSS `line-height` puts half the extra leading above and half below each
/// line. SwiftUI's `lineSpacing` only adds space *between* lines, so the first
/// line sits higher than on the web. This label reproduces the CSS line box
/// exactly with fixed line heights and a baseline shift.
public struct CSSText: UIViewRepresentable {
    let text: String
    let font: UIFont
    /// CSS line-height as a multiple of the font size (e.g. 1.7).
    let lineHeight: CGFloat
    var color: UIColor
    /// CSS letter-spacing in points (e.g. −0.015em × size).
    var tracking: CGFloat
    /// `-webkit-line-clamp`; 0 is unlimited.
    var lineLimit: Int
    /// Take the text's own width (a bubble shrink-wrapping its words) rather than all that's offered.
    var fitsContent: Bool
    /// CSS `text-align` (an empty state's centred lines).
    var alignment: NSTextAlignment

    public init(_ text: String, font: UIFont, lineHeight: CGFloat, color: UIColor = UIColor(Tokens.text),
                tracking: CGFloat = 0, lineLimit: Int = 0, fitsContent: Bool = false, alignment: NSTextAlignment = .natural) {
        self.text = text
        self.font = font
        self.lineHeight = lineHeight
        self.color = color
        self.tracking = tracking
        self.lineLimit = lineLimit
        self.fitsContent = fitsContent
        self.alignment = alignment
    }

    public func makeUIView(context: Context) -> UILabel {
        let label = UILabel()
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return label
    }

    public func updateUIView(_ label: UILabel, context: Context) {
        label.numberOfLines = lineLimit
        label.attributedText = CSSText.attributed(text, font: font, lineHeight: lineHeight, color: color, tracking: tracking,
                                                  alignment: alignment)
        // After the text: its paragraph style would otherwise reset the mode.
        if lineLimit > 0 { label.lineBreakMode = .byTruncatingTail }
    }

    public func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
        let width = proposal.width ?? 320
        let size = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: fitsContent ? min(width, size.width.rounded(.up)) : width, height: size.height)
    }

    public static func attributed(_ text: String, font: UIFont, lineHeight: CGFloat, color: UIColor, tracking: CGFloat = 0,
                                  alignment: NSTextAlignment = .natural) -> NSAttributedString {
        let lineBox = font.pointSize * lineHeight
        let style = NSMutableParagraphStyle()
        style.alignment = alignment
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
            .kern: tracking,
        ])
    }
}

/// Exact CSS line boxes for TextKit: every line is `lineBox` tall and its
/// baseline sits at (lineBox + ascent − descent) / 2 of the *primary* font —
/// what browsers do — no matter which fallback font (e.g. Noto TC) drew the
/// glyphs. TextKit on its own uses each line's actual glyph fonts, which puts
/// all-CJK lines ~0.35pt off.
public final class CSSLineBoxes: NSObject, NSLayoutManagerDelegate {
    public let font: UIFont
    public let lineBox: CGFloat
    public init(font: UIFont, lineHeight: CGFloat) {
        self.font = font
        self.lineBox = font.pointSize * lineHeight
    }

    public func layoutManager(_ layoutManager: NSLayoutManager,
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
