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
    /// Divider's default ink: color-mix(in oklch, field-border-hover 35%, transparent).
    public nonisolated static let dividerInk = fieldBorderHover.opacity(0.35)
    /// Modal.tsx's backdrop.
    public nonisolated static let backdrop = oklch(0.2, 0.04, 60, alpha: 0.42)
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
