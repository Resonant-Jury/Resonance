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

/// A message's bubble (MessageBubble.tsx): 14/1.65 text, padding 10×16, your
/// own on a terracotta-light wash, theirs on cream with a thin field line
/// (1.1, the web's own number). A reply to a note wears a small italic header.
public struct MessageBubble: View {
    let text: String
    let mine: Bool
    let seed: Double
    let quoteLabel: String?

    public init(text: String, mine: Bool, seed: Double, quoteLabel: String? = nil) {
        self.text = text
        self.mine = mine
        self.seed = seed
        self.quoteLabel = quoteLabel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            if let quoteLabel {
                HStack(spacing: 5) {
                    OrganicIcon(.note, size: 13, color: Tokens.textMuted)
                    Text(quoteLabel).font(AppFonts.body(12, oblique: true)).foregroundStyle(Tokens.textMuted)
                }
            }
            if !text.isEmpty {
                CSSText(text, font: AppFonts.uiFont(.body, size: 14), lineHeight: 1.65, fitsContent: true)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 16)
        .background {
            let shape = MessageBubbleShape(seed: seed)
            if mine {
                shape.fill(Tokens.terracottaLight.opacity(0.62))
            } else {
                shape.fill(Tokens.cream)
                shape.stroke(Tokens.fieldBorder, style: StrokeStyle(lineWidth: 1.1, lineJoin: .round))
            }
        }
    }
}
