import SwiftUI

/// Colors the web writes inline (fallbacks and `color-mix`es) rather than as
/// tokens.css variables, so the token generator doesn't carry them yet.
/// Resolved once from the web's own oklch values.
extension Tokens {
    /// `var(--color-danger, oklch(58% 0.16 25))` — the variable is undefined,
    /// so the fallback red is what every error line and danger stroke shows.
    public nonisolated static let danger = oklch(0.58, 0.16, 25)
    /// OrganicButton's outline stroke: color-mix(in oklch, terracotta, black 15%).
    public nonisolated static let terracottaOutline = oklch(0.62 * 0.85, 0.14 * 0.85, 45)

    // Every button is a filled shape with no pen line (tokens.css --button-*): the verb a deep
    // terracotta, everything beside it a soft terracotta tint, a button that opens a destructive
    // flow the same tint in red. Mixes of the palette, resolved as CSS mixes them in oklch, so
    // labels clear 4.5:1. Plain terracotta (3.5:1 either way) never carries a label.

    /// --button-fill: color-mix(in oklch, terracotta, black 12%) — the solid face; cream on it 4.7:1.
    public nonisolated static let buttonFill = oklch(0.5456, 0.1232, 45)
    /// --button-tonal: color-mix(in oklch, terracotta-light 75%, cream-dark) — the tonal face.
    public nonisolated static let buttonTonal = oklch(0.8925, 0.0645, 60)
    /// --button-on-tonal: color-mix(in oklch, terracotta, black 22%) — the tonal label (4.8:1 on
    /// its face, 6.1:1 on cream), and a deep terracotta for words that act on paper.
    public nonisolated static let buttonOnTonal = oklch(0.4836, 0.1092, 45)
    /// OrganicButton's DANGER: color-mix(in oklch, danger, black 8%) — the final destructive
    /// confirm's face, cream on it 5.1:1 (`danger` itself stays the error lines' red).
    public nonisolated static let dangerFill = oklch(0.5336, 0.1472, 25)
    /// --button-danger-tonal: color-mix(in oklch, danger 20%, oklch(98% 0.02 25)) — a rose paper of
    /// the red's own hue (mixed into cream it would drift to a peach).
    public nonisolated static let buttonDangerTonal = oklch(0.90, 0.048, 25)
    /// --button-on-danger-tonal: color-mix(in oklch, danger, black 22%) — its label, 5.7:1.
    public nonisolated static let buttonOnDangerTonal = oklch(0.4524, 0.1248, 25)
    /// A segmented choice's unchosen side on its paper-dark track (the publish panel's audience):
    /// color-mix(in oklch, text-muted, black 10%), deep enough to read there.
    public nonisolated static let segmentIdleInk = oklch(0.52 * 0.9, 0.04 * 0.9, 70)
    /// Divider's default ink: color-mix(in oklch, field-border-hover 35%, transparent).
    public nonisolated static let dividerInk = fieldBorderHover.opacity(0.35)
    /// What a modal (and a message's long-press menu) lays over the whole screen: the warm ink of
    /// Modal.tsx's backdrop, lighter than its first 0.42 — over the cream that read muddy, the
    /// paper gone grey rather than set back. Android's ModalScrim.
    public nonisolated static let backdrop = oklch(0.2, 0.04, 60, alpha: 0.28)
    /// HandDrawnAvatar's rim.
    public nonisolated static let avatarStroke = oklch(0.36, 0.06, 60, alpha: 0.55)
    /// TagPill's outline.
    public nonisolated static let tagStroke = oklch(0.32, 0.05, 60, alpha: 0.45)
    /// HandDrawnImage's ✕ chip: a dark translucent pebble with a pale rim.
    public nonisolated static let imageRemoveFill = oklch(0.30, 0.02, 70, alpha: 0.7)
    public nonisolated static let imageRemoveStroke = oklch(0.96, 0.02, 75, alpha: 0.75)

    nonisolated static func oklch(_ L: Double, _ C: Double, _ H: Double, alpha: Double = 1) -> Color {
        OKLCHColor.color(L, C, H, alpha: alpha)
    }
}
