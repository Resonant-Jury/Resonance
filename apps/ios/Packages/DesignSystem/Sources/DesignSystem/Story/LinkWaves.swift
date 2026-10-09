import ResonanceGeometry
import UIKit

/// One line's share of a link in story text: the stroke's span and baseline,
/// in the text container's coordinates.
public struct LinkFragment: Equatable, Sendable {
    public var minX: CGFloat
    public var maxX: CGFloat
    public var baseline: CGFloat
}

/// The pen-wave underlines of a story's links, found from the layout: one
/// fragment per line a link covers (a link that wraps gets a stroke under each
/// part). The twin of Android's `linkFragments` and of the web's repeating
/// background.
public enum LinkWaves {
    /// How far under the baseline the wave's centre runs, in em of the link's text — the depth
    /// every platform draws a story link's wave at (the web's WAVE_DEPTH_EM, storyLinkWave.ts):
    /// the up crests (at most 1.62pt off the line, plus half the INK stroke) stay clear of the feet
    /// of Chinese glyphs (their ink ends about 0.12em down), and Latin descenders only dip into them.
    public static let depthEm: CGFloat = 0.29

    /// The wave's centre under the baseline for text of `fontSize`.
    public static func drop(fontSize: CGFloat) -> CGFloat { fontSize * depthEm }

    /// How far under the baseline the wave's highest point reaches (its up crests and half the pen):
    /// the room it leaves the glyphs above it.
    public static func clearance(fontSize: CGFloat) -> CGFloat { drop(fontSize: fontSize) - 1.2 * 1.35 - Tokens.ink / 2 }

    /// How far under the baseline the wave's lowest point reaches (its down crests and half the
    /// pen): on a heading's last line that is past the line box's foot.
    public static func reach(fontSize: CGFloat) -> CGFloat { drop(fontSize: fontSize) + 1.2 * 1.35 + Tokens.ink / 2 }

    /// The link attribute's runs: the URL and the character range it covers.
    public static func links(in storage: NSAttributedString) -> [(url: URL, range: NSRange)] {
        var out: [(URL, NSRange)] = []
        storage.enumerateAttribute(.link, in: NSRange(location: 0, length: storage.length)) { value, range, _ in
            if let url = value as? URL { out.append((url, range)) }
            else if let s = value as? String, let url = URL(string: s) { out.append((url, range)) }
        }
        return out
    }

    public static func fragments(of range: NSRange, layoutManager lm: NSLayoutManager, container: NSTextContainer) -> [LinkFragment] {
        let glyphs = lm.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
        var out: [LinkFragment] = []
        lm.enumerateLineFragments(forGlyphRange: glyphs) { rect, _, _, lineGlyphs, _ in
            let part = NSIntersectionRange(glyphs, lineGlyphs)
            guard part.length > 0 else { return }
            // Without a trailing space or line break the line carries into the stroke.
            var visible = part
            let chars = lm.characterRange(forGlyphRange: part, actualGlyphRange: nil)
            let text = lm.textStorage?.string as NSString?
            while visible.length > 0, let text,
                  let scalar = Unicode.Scalar(text.character(at: lm.characterIndexForGlyph(at: visible.upperBound - 1))),
                  CharacterSet.whitespacesAndNewlines.contains(scalar) {
                visible.length -= 1
            }
            guard visible.length > 0, chars.length > 0 else { return }
            let box = lm.boundingRect(forGlyphRange: visible, in: container)
            guard box.width > 0.5 else { return }
            let baseline = rect.minY + lm.location(forGlyphAt: visible.location).y
            out.append(LinkFragment(minX: box.minX, maxX: box.maxX, baseline: baseline))
        }
        return out
    }
}

/// A text view that draws the link wave under each link: terracotta, INK wide,
/// ``LinkWaves/depthEm`` under the baseline, 70% at rest and 100% while a finger
/// is on the link. Drawn beneath the glyphs, as the web paints its wave as the
/// link's background: a descender that dips into a crest stands on it, never
/// crossed by it.
final class LinkWaveTextView: UITextView, UIGestureRecognizerDelegate {
    private var waveLayers: [CAShapeLayer] = []
    private var drawn: (width: CGFloat, text: NSAttributedString)?
    private var pressedURL: URL?
    var waveColor: UIColor = .systemOrange
    var waveDrop: CGFloat = 3

    override init(frame: CGRect, textContainer: NSTextContainer?) {
        super.init(frame: frame, textContainer: textContainer)
        // A touch that rests on a link presses its stroke; it never takes the touch from the link itself.
        let press = UILongPressGestureRecognizer(target: self, action: #selector(pressed(_:)))
        press.minimumPressDuration = 0
        press.cancelsTouchesInView = false
        press.delegate = self
        addGestureRecognizer(press)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        if let drawn, drawn.width == bounds.width, drawn.text.isEqual(to: attributedText) { return }
        rebuildWaves()
        drawn = (bounds.width, NSAttributedString(attributedString: attributedText))
    }

    private var tracks: [(url: URL, layer: CAShapeLayer)] = []

    private func rebuildWaves() {
        waveLayers.forEach { $0.removeFromSuperlayer() }
        waveLayers = []
        tracks = []
        layoutManager.ensureLayout(for: textContainer)
        for link in LinkWaves.links(in: textStorage) {
            let path = UIBezierPath()
            let frags = LinkWaves.fragments(of: link.range, layoutManager: layoutManager, container: textContainer)
            for (i, f) in frags.enumerated() {
                let wave = penWave(Double(f.maxX - f.minX), seed: Double(seedFromString(link.url.absoluteString) + i))
                    .path(offsetX: Double(f.minX + textContainerInset.left), offsetY: Double(f.baseline + waveDrop + textContainerInset.top))
                path.append(UIBezierPath(cgPath: wave.cgPath))
            }
            guard !frags.isEmpty else { continue }
            let layer = CAShapeLayer()
            layer.path = path.cgPath
            layer.fillColor = nil
            layer.strokeColor = waveColor.cgColor
            layer.lineWidth = Tokens.ink
            layer.lineCap = .round
            layer.lineJoin = .round
            layer.opacity = link.url == pressedURL ? 1 : 0.7
            // Under the text (the glyphs are drawn by the text container's own view, above).
            self.layer.insertSublayer(layer, at: 0)
            waveLayers.append(layer)
            tracks.append((link.url, layer))
        }
    }

    private func link(at point: CGPoint) -> URL? {
        let p = CGPoint(x: point.x - textContainerInset.left, y: point.y - textContainerInset.top)
        var fraction: CGFloat = 0
        let i = layoutManager.characterIndex(for: p, in: textContainer, fractionOfDistanceBetweenInsertionPoints: &fraction)
        guard i < textStorage.length, layoutManager.boundingRect(forGlyphRange: layoutManager.glyphRange(forCharacterRange: NSRange(location: i, length: 1), actualCharacterRange: nil), in: textContainer).insetBy(dx: -4, dy: -4).contains(p) else { return nil }
        return textStorage.attribute(.link, at: i, effectiveRange: nil) as? URL
    }

    override func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard g is UILongPressGestureRecognizer, g.delegate === self else { return super.gestureRecognizerShouldBegin(g) }
        return link(at: g.location(in: self)) != nil
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

    @objc private func pressed(_ g: UILongPressGestureRecognizer) {
        switch g.state {
        case .began: setPressed(link(at: g.location(in: self)))
        case .changed: break
        default: setPressed(nil)
        }
    }

    private func setPressed(_ url: URL?) {
        pressedURL = url
        for t in tracks { t.layer.opacity = t.url == url ? 1 : 0.7 }
    }
}
