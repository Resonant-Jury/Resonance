package com.resonance.design

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import com.resonance.design.generated.Tokens
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * CSS `oklch(L C H [/ a])` → Display P3, the conversion scripts/native/tokens.ts
 * uses for the static tokens — for colors that arrive as data (a profile's
 * accent color is stored as its CSS string).
 */
object OklchColor {
    private val pattern = Regex("""oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*/\s*([\d.]+))?\s*\)""")

    fun parse(css: String): Color? {
        val m = pattern.find(css) ?: return null
        var l = m.groupValues[1].toDouble()
        if (m.groupValues[2] == "%") l /= 100
        val c = m.groupValues[3].toDouble()
        val h = m.groupValues[4].toDouble()
        val alpha = m.groupValues[5].toDoubleOrNull() ?: 1.0
        val a = c * cos(Math.toRadians(h))
        val b = c * sin(Math.toRadians(h))
        val lp = (l + 0.3963377774 * a + 0.2158037573 * b).pow(3)
        val mp = (l - 0.1055613458 * a - 0.0638541728 * b).pow(3)
        val sp = (l - 0.0894841775 * a - 1.291485548 * b).pow(3)
        val sr = 4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp
        val sg = -1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp
        val sb = -0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp
        fun enc(x: Double): Float {
            val v = x.coerceIn(0.0, 1.0)
            return (if (v <= 0.0031308) 12.92 * v else 1.055 * v.pow(1 / 2.4) - 0.055).toFloat()
        }
        return Color(
            enc(0.8224621 * sr + 0.177538 * sg),
            enc(0.0331941 * sr + 0.9668058 * sg),
            enc(0.0170827 * sr + 0.0723974 * sg + 0.9105199 * sb),
            alpha.toFloat(),
            ColorSpaces.DisplayP3,
        )
    }
}

/**
 * The story-card palette (StoryCard.tsx, lib/design/dominantHue): the slot
 * nearest the cover's dominant hue, or by position when there is none.
 */
class CardPalette(accentHue: Double?, position: Int) {
    val index: Int = accentHue?.let(::nearest) ?: Math.floorMod(position, HUES.size)
    val hue: Double get() = HUES[index]
    val fill: Color get() = Tokens.CardFills[index]
    val border: Color get() = Tokens.CardBorders[index]
    /** `oklch(97.5% 0.012 hue)` — the card's paper. */
    val interior: Color get() = OklchColor.parse("oklch(97.5% 0.012 $hue)") ?: Tokens.CardBg
    /** `oklch(55% 0.04 hue / 0.4)` — the wavy rule above the byline. */
    val separator: Color get() = OklchColor.parse("oklch(55% 0.04 $hue / 0.4)") ?: Tokens.FieldBorder
    /** `oklch(44% 0.08 hue)` — Resonance's handwritten margin note. */
    val noteInk: Color get() = OklchColor.parse("oklch(44% 0.08 $hue)") ?: Tokens.TextMuted
    /** The cover placeholder's hatching: the fill 7 L darker (StoryCard's `stripeFill`), drawn at 0.28. */
    val stripe: Color get() = FILL_LC[index].let { (l, c) -> OklchColor.parse("oklch(${l - 7}% $c $hue)") } ?: fill
    /** `oklch(90% 0.06 hue)` — MiniStoryCard's cover fallback and avatar when the author has no accent. */
    val accent: Color get() = OklchColor.parse("oklch(90% 0.06 $hue)") ?: fill

    companion object {
        /** CARD_HUES, in palette order. */
        val HUES = listOf(55.0, 290.0, 140.0, 88.0, 215.0, 18.0)
        /** CARD_FILLS' lightness (%) and chroma, in palette order. */
        private val FILL_LC = listOf(90.0 to 0.065, 94.0 to 0.032, 93.0 to 0.042, 92.0 to 0.075, 92.0 to 0.033, 89.0 to 0.047)

        fun nearest(hue: Double): Int {
            fun distance(a: Double, b: Double): Double {
                val d = abs(a - b) % 360
                return min(d, 360 - d)
            }
            return HUES.indices.minBy { distance(hue, HUES[it]) }
        }
    }
}

/**
 * Colors the web mixes from its tokens with `color-mix(in oklch, …)` that the
 * generated set does not carry, worked out in OKLCH the way the browser does
 * (black has no hue, so it keeps the other color's).
 */
object Mixes {
    /** `var(--color-danger, oklch(58% 0.16 25))` — the variable is undefined, so every error line and the delete row show the fallback red. */
    val Danger = OklchColor.parse("oklch(58% 0.16 25)") ?: Tokens.Terracotta
    /** OrganicButton outline's pen: color-mix(terracotta, black 15%) — darker than its label. */
    val TerracottaOutline = OklchColor.parse("oklch(52.7% 0.119 45)") ?: Tokens.Terracotta
    /** HandDrawnAvatar's rim, oklch(36% 0.06 60 / 0.55). */
    val AvatarRim = OklchColor.parse("oklch(36% 0.06 60 / 0.55)") ?: Tokens.GhostStroke
    /** OrganicMenu's destructive-row wash: color-mix(yellow 25%, cream); 45% while pressed. */
    val MenuDangerWash = OklchColor.parse("oklch(94.375% 0.03625 78.75)") ?: Tokens.Yellow
    val MenuDangerWashPressed = OklchColor.parse("oklch(92.675% 0.05325 81.75)") ?: Tokens.Yellow
    /** Skeleton's sand: color-mix(color-mix(cream-dark 94%, text) 85%, transparent). */
    val SkeletonBase = OklchColor.parse("oklch(88.98% 0.01872 74.1 / 0.85)") ?: Tokens.CreamDark

    /** Skeleton's shimmer: color-mix(highlight 50%, cream), the highlight `oklch(88% 0.08 hue)` (terracotta-light by default). */
    fun skeletonHighlight(hue: Double = 55.0): Color =
        OklchColor.parse("oklch(92.25% 0.0475 ${mixHue(hue, 75.0)})") ?: Tokens.TerracottaLight

    /** Halfway round the shorter arc between two hues, as CSS interpolates them. */
    private fun mixHue(a: Double, b: Double): Double {
        var d = b - a
        if (d > 180) d -= 360
        if (d < -180) d += 360
        return ((a + d / 2) % 360 + 360) % 360
    }
}
