import StoryFormat
import SwiftUI
import UIKit

/// Selectable rich text laid out in exact CSS line boxes (see CSSLineBoxes):
/// each line is `lineHeight × font size` tall with the primary font's content
/// area centred in it, so paragraphs sit where the browser puts them (S5).
/// Links are tappable and handed to `onOpenURL`.
public struct CSSTextView: UIViewRepresentable {
    let text: NSAttributedString
    let font: UIFont
    let lineHeight: CGFloat
    var onOpenURL: (URL) -> Void
    /// Take the text's own width (a chat bubble shrink-wrapping its words) rather than all that's offered.
    var fitsContent: Bool

    public init(_ text: NSAttributedString, font: UIFont, lineHeight: CGFloat, fitsContent: Bool = false,
                onOpenURL: @escaping (URL) -> Void = { _ in }) {
        self.fitsContent = fitsContent
        self.text = text
        self.font = font
        self.lineHeight = lineHeight
        self.onOpenURL = onOpenURL
    }

    public func makeCoordinator() -> Coordinator { Coordinator() }

    public func makeUIView(context: Context) -> UITextView {
        // TextKit 1: its layout-manager delegate is where line boxes are set.
        let storage = NSTextStorage()
        let layout = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: 320, height: CGFloat.greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        let view = LinkWaveTextView(frame: .zero, textContainer: container)
        view.waveColor = UIColor(Tokens.terracotta)
        view.isEditable = false
        view.isSelectable = true
        view.isScrollEnabled = false
        // A link's wave runs 0.29em under its baseline, which on a heading's last line (h2, h3: a
        // tight line box) is past the view's foot: clipped there, that line would show only the
        // wave's highest crests. UIKit stops a text view clipping once it no longer scrolls (the
        // line above), but the wave relies on it, so it is said here rather than left to that side
        // effect. Nothing else is drawn past the bounds.
        view.clipsToBounds = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.linkTextAttributes = [:]
        view.adjustsFontForContentSizeCategory = false
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.delegate = context.coordinator
        return view
    }

    public func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.onOpenURL = onOpenURL
        let boxes = CSSLineBoxes(font: font, lineHeight: lineHeight)
        context.coordinator.lineBoxes = boxes
        // Under the letters, not under the line box: the depth every platform shares (0.29em).
        (view as? LinkWaveTextView)?.waveDrop = LinkWaves.drop(fontSize: font.pointSize)
        view.layoutManager.delegate = boxes
        if view.attributedText != text { view.attributedText = text }
    }

    public func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 320
        let container = uiView.textContainer
        if container.size.width != width {
            container.size = CGSize(width: width, height: .greatestFiniteMagnitude)
        }
        uiView.layoutManager.ensureLayout(for: container)
        let used = uiView.layoutManager.usedRect(for: container)
        return CGSize(width: fitsContent ? min(width, ceil(used.width)) : width, height: ceil(used.height))
    }

    public final class Coordinator: NSObject, UITextViewDelegate {
        var onOpenURL: (URL) -> Void = { _ in }
        /// The layout manager holds its delegate weakly.
        var lineBoxes: CSSLineBoxes?

        public func textView(_ textView: UITextView, primaryActionFor textItem: UITextItem, defaultAction: UIAction) -> UIAction? {
            guard case let .link(url) = textItem.content else { return defaultAction }
            return UIAction { [onOpenURL] _ in onOpenURL(url) }
        }
    }
}

/// How a run of story text looks: the reader's `.prose` styles.
public struct ProseStyle: Sendable {
    public var family: AppFonts.Family
    public var size: CGFloat
    public var weight: UIFont.Weight
    public var lineHeight: CGFloat
    public var color: UIColor
    public var italic: Bool
    /// Letter spacing in em (CSS `letter-spacing`).
    public var tracking: CGFloat

    public static let body = ProseStyle(family: .body, size: 17, weight: .regular, lineHeight: 1.8, color: UIColor(Tokens.text), italic: false, tracking: 0)
    public static let h2 = ProseStyle(family: .heading, size: 22, weight: .bold, lineHeight: 1.3, color: UIColor(Tokens.text), italic: false, tracking: -0.01)
    public static let h3 = ProseStyle(family: .heading, size: 18, weight: .bold, lineHeight: 1.35, color: UIColor(Tokens.text), italic: false, tracking: 0)

    /// Blockquotes: muted and italic.
    public var quoted: ProseStyle {
        var s = self
        s.color = UIColor(Tokens.textMuted)
        s.italic = true
        return s
    }

    /// `size` at the person's text size, as every text takes it: the line box
    /// (`lineHeight` × this) and the spacing around it grow in step.
    var scaledSize: CGFloat { size * TextScale.factor(relativeTo: family.textStyle) }

    public var font: UIFont { AppFonts.uiFont(family, size: scaledSize, weight: weight) }

    /// Browsers synthesize italics for faces loaded without one (the site
    /// loads none) by slanting the upright glyphs; so does this.
    static let syntheticItalic: CGFloat = 0.2

    public func attributed(_ runs: [InlineRun], paragraph: NSParagraphStyle? = nil) -> NSAttributedString {
        let size = scaledSize
        let out = NSMutableAttributedString()
        for run in runs {
            var attrs: [NSAttributedString.Key: Any] = [
                .font: run.code
                    ? UIFont.monospacedSystemFont(ofSize: size * 0.9, weight: run.bold ? .bold : .regular)
                    : AppFonts.uiFont(family, size: size, weight: run.bold ? .bold : weight),
                .foregroundColor: color,
            ]
            if italic || run.italic { attrs[.obliqueness] = Self.syntheticItalic }
            if tracking != 0 { attrs[.kern] = tracking * size }
            if run.strikethrough { attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
            if let link = run.link, let url = URL(string: link) {
                attrs[.link] = url
                attrs[.foregroundColor] = UIColor(Tokens.terracotta)
            }
            if let paragraph { attrs[.paragraphStyle] = paragraph }
            out.append(NSAttributedString(string: run.text, attributes: attrs))
        }
        return out
    }
}
