import SwiftUI

/// MessageBubble's seedFromId: a Java-style string hash over UTF-16 units
/// (Int32 wrapping), folded into 1…9973. Bubbles start from 7; a shared
/// card's embed starts from 11. ("m1" → 183, "card-77" from 11 → 6326.)
public nonisolated func seedFromId(_ id: String, start: Int32 = 7) -> Double {
    var h = start
    for unit in id.utf16 { h = h &* 31 &+ Int32(unit) }
    return Double(abs(Int(h) % 9973) + 1)
}

/// MessageBubble's outline: its wobble follows its own size — radius
/// min(16, h·0.42), swing min(2.6, h·0.05), a turn per 80 across (2–6) and
/// per 52 down (1–8), bow 1.3, corner jitter 1.6, corners pulled in 4%.
public nonisolated struct MessageBubbleShape: Shape {
    public let seed: Double

    public init(seed: Double) { self.seed = seed }

    public func path(in rect: CGRect) -> Path {
        let w = Double(rect.width), h = Double(rect.height)
        guard w > 0, h > 0 else { return Path() }
        let across = min(6, max(2, (w / 80).rounded()))
        let down = min(8, max(1, (h / 52).rounded()))
        return WobRectShape(radius: min(16, h * 0.42), seed: seed, mag: min(2.6, h * 0.05), options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.6, cornerOffset: min(w, h) * 0.04, segmentsH: .count(across), segmentsV: .count(down)
        )).path(in: rect)
    }
}

/// Where a link sits in a message's text (UTF-16 units) and where it goes.
public struct MessageLinkRange: Equatable, Sendable {
    public let range: NSRange
    public let url: URL

    public init(range: NSRange, url: URL) {
        self.range = range
        self.url = url
    }
}

/// A message's bubble (MessageBubble.tsx): 14/1.65 text, padding 10×16, your
/// own on a terracotta-light wash, theirs on cream with a thin field line
/// (1.1, the web's own number). A reply to a note wears a small italic header.
/// Links in the text are tappable (terracotta, the pen's wave under them) and
/// go to `onOpenURL`. `ghost` is the faded quote of the message a reply
/// answers: smaller, muted, two lines at most.
public struct MessageBubble: View {
    let text: String
    let mine: Bool
    let seed: Double
    let quoteLabel: String?
    let ghost: Bool
    let links: [MessageLinkRange]
    let onOpenURL: (URL) -> Void

    public init(text: String, mine: Bool, seed: Double, quoteLabel: String? = nil, ghost: Bool = false,
                links: [MessageLinkRange] = [], onOpenURL: @escaping (URL) -> Void = { _ in }) {
        self.text = text
        self.mine = mine
        self.seed = seed
        self.quoteLabel = quoteLabel
        self.ghost = ghost
        self.links = links
        self.onOpenURL = onOpenURL
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            if let quoteLabel {
                HStack(spacing: 5) {
                    OrganicIcon(.note, size: 13, color: Tokens.textMuted)
                    Text(quoteLabel).font(AppFonts.body(12, oblique: true)).foregroundStyle(Tokens.textMuted)
                }
            }
            if !text.isEmpty { words }
        }
        .padding(.vertical, ghost ? 7 : 10)
        .padding(.horizontal, ghost ? 14 : 16)
        .background {
            let shape = MessageBubbleShape(seed: seed)
            if ghost {
                shape.fill(Tokens.cream.opacity(0.55))
                shape.stroke(Tokens.fieldBorder.opacity(0.55), style: StrokeStyle(lineWidth: 1.1, lineJoin: .round))
            } else if mine {
                shape.fill(Tokens.terracottaLight.opacity(0.62))
            } else {
                shape.fill(Tokens.cream)
                shape.stroke(Tokens.fieldBorder, style: StrokeStyle(lineWidth: 1.1, lineJoin: .round))
            }
        }
    }

    @ViewBuilder private var words: some View {
        if ghost {
            CSSText(text, font: AppFonts.scaledUIFont(.body, size: 13), lineHeight: 1.65, color: UIColor(Tokens.textMuted),
                    lineLimit: 2, fitsContent: true)
                .fixedSize(horizontal: false, vertical: true)
        } else if links.isEmpty {
            CSSText(text, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.65, fitsContent: true)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            let font = AppFonts.scaledUIFont(.body, size: 14)
            let attributed = Self.linked(text, links: links, font: font)
            CSSTextView(attributed, font: font, lineHeight: 1.65, fitsContent: true, onOpenURL: onOpenURL)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// The text with its links set in terracotta (the pen's wave is drawn under them by the text view).
    private static func linked(_ text: String, links: [MessageLinkRange], font: UIFont) -> NSAttributedString {
        let out = NSMutableAttributedString(
            attributedString: CSSText.attributed(text, font: font, lineHeight: 1.65, color: UIColor(Tokens.text)))
        for link in links where NSMaxRange(link.range) <= out.length {
            out.addAttributes([.link: link.url, .foregroundColor: UIColor(Tokens.terracotta)], range: link.range)
        }
        return out
    }
}
