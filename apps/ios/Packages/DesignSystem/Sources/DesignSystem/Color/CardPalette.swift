import SwiftUI

/// The story-card palette (StoryCard.tsx, lib/design/dominantHue): a card
/// prefers the palette slot nearest its cover's dominant hue, or cycles through
/// the six by position when it has none; in a list, ``palettes(_:)`` keeps
/// neighbours apart (lib/design/cardColours).
public nonisolated struct CardPalette: Sendable {
    /// CARD_HUES, in palette order.
    public static let hues: [Double] = [55, 290, 140, 88, 215, 18]

    public let index: Int
    public var hue: Double { Self.hues[index] }
    public var fill: Color { Tokens.cardFills[index] }
    public var border: Color { Tokens.cardBorders[index] }
    /// `oklch(97.5% 0.012 hue)` — the card's paper.
    public var interior: Color { OKLCHColor.parse("oklch(97.5% 0.012 \(hue))") ?? Tokens.cardBg }
    /// `oklch(92.5% 0.024 hue)` — the bordered card's paper under a pointer (the web's BrushWash).
    public var hovered: Color { OKLCHColor.parse("oklch(92.5% 0.024 \(hue))") ?? Tokens.cardBg }
    /// `oklch(55% 0.04 hue / 0.4)` — the wavy rule above the byline.
    public var separator: Color { OKLCHColor.parse("oklch(55% 0.04 \(hue) / 0.4)") ?? Tokens.fieldBorder }
    /// `oklch(44% 0.08 hue)` — Resonance's handwritten margin note.
    public var noteInk: Color { OKLCHColor.parse("oklch(44% 0.08 \(hue))") ?? Tokens.textMuted }
    /// `oklch(90% 0.06 hue)` — MiniStoryCard's cover and avatar fallback.
    public var accent: Color { OKLCHColor.color(0.9, 0.06, hue) }
    /// The cover placeholder's hatching: the fill darkened by 7 L, at 0.28.
    public var stripe: Color {
        let (L, C) = Self.fillLC[index]
        return OKLCHColor.color(L - 0.07, C, hue, alpha: 0.28)
    }

    /// CARD_FILLS' lightness and chroma, in palette order.
    static let fillLC: [(Double, Double)] = [(0.9, 0.065), (0.94, 0.032), (0.93, 0.042), (0.92, 0.075), (0.92, 0.033), (0.89, 0.047)]

    public init(accentHue: Double?, position: Int) {
        index = Self.preferred(accentHue: accentHue, position: position)
    }

    /// The family a list's colouring chose for the card (``palettes(_:)``).
    public init(index: Int) {
        self.index = ((index % Self.hues.count) + Self.hues.count) % Self.hues.count
    }

    /// A card's own family (`preferredPalette`): the one nearest its cover's hue, else its position's.
    public static func preferred(accentHue: Double?, position: Int) -> Int {
        if let accentHue { return nearest(accentHue) }
        return ((position % hues.count) + hues.count) % hues.count
    }

    /// How many cards before a card its family must differ from (`CARD_COLOUR_WINDOW`).
    public static let window = 3

    /// For each family, the other five, nearest hue first, equally near the lower index first
    /// (`CARD_FAMILY_ORDER`): where a clash moves a card.
    public static let order: [[Int]] = hues.indices.map { family in
        hues.indices.filter { $0 != family }.sorted { a, b in
            let da = distance(hues[family], hues[a]), db = distance(hues[family], hues[b])
            return da != db ? da < db : a < b
        }
    }

    /// The family of every card of a list, in its order (`cardPalettes`, round 5 B3): a card keeps its
    /// preference unless one of the ``window`` cards before it wears that family, then it takes the
    /// first of ``order`` none of them wears — so four cards in a row always differ, and one, two and
    /// three row-major columns all keep neighbours apart. Each card depends only on those before it:
    /// a page appended never recolours one shown. Colour the list as displayed (after blocks, every
    /// loaded page, skeletons after the cards as hue-less ones). Pinned by native/fixtures/card-colours.json.
    public static func palettes(_ accentHues: [Double?]) -> [Int] {
        var out: [Int] = []
        out.reserveCapacity(accentHues.count)
        for (i, hue) in accentHues.enumerated() {
            let near = out[max(0, i - window)..<i]
            let own = preferred(accentHue: hue, position: i)
            // Six families and three neighbours: some other family is always free.
            out.append(near.contains(own) ? (order[own].first { !near.contains($0) } ?? own) : own)
        }
        return out
    }

    static func nearest(_ hue: Double) -> Int {
        hues.indices.min { distance(hue, hues[$0]) < distance(hue, hues[$1]) } ?? 0
    }

    /// `hueDistance`: the shorter way round the colour wheel.
    static func distance(_ a: Double, _ b: Double) -> Double {
        let d = abs(a - b).truncatingRemainder(dividingBy: 360)
        return min(d, 360 - d)
    }
}
