import SwiftUI

/// The story-card palette (StoryCard.tsx, lib/design/dominantHue): a card
/// takes the palette slot nearest its cover's dominant hue, or cycles through
/// the six by position when it has none.
public nonisolated struct CardPalette: Sendable {
    /// CARD_HUES, in palette order.
    public static let hues: [Double] = [55, 290, 140, 88, 215, 18]

    public let index: Int
    public var hue: Double { Self.hues[index] }
    public var fill: Color { Tokens.cardFills[index] }
    public var border: Color { Tokens.cardBorders[index] }
    /// `oklch(97.5% 0.012 hue)` — the card's paper.
    public var interior: Color { OKLCHColor.parse("oklch(97.5% 0.012 \(hue))") ?? Tokens.cardBg }
    /// `oklch(55% 0.04 hue / 0.4)` — the wavy rule above the byline.
    public var separator: Color { OKLCHColor.parse("oklch(55% 0.04 \(hue) / 0.4)") ?? Tokens.fieldBorder }
    /// `oklch(44% 0.08 hue)` — Resonance's handwritten margin note.
    public var noteInk: Color { OKLCHColor.parse("oklch(44% 0.08 \(hue))") ?? Tokens.textMuted }

    public init(accentHue: Double?, position: Int) {
        if let accentHue {
            index = Self.nearest(accentHue)
        } else {
            index = ((position % Self.hues.count) + Self.hues.count) % Self.hues.count
        }
    }

    static func nearest(_ hue: Double) -> Int {
        func distance(_ a: Double, _ b: Double) -> Double {
            let d = abs(a - b).truncatingRemainder(dividingBy: 360)
            return min(d, 360 - d)
        }
        return hues.indices.min { distance(hue, hues[$0]) < distance(hue, hues[$1]) } ?? 0
    }
}
