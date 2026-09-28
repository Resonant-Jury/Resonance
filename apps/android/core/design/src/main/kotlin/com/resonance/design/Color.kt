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

    companion object {
        /** CARD_HUES, in palette order. */
        val HUES = listOf(55.0, 290.0, 140.0, 88.0, 215.0, 18.0)

        fun nearest(hue: Double): Int {
            fun distance(a: Double, b: Double): Double {
                val d = abs(a - b) % 360
                return min(d, 360 - d)
            }
            return HUES.indices.minBy { distance(hue, HUES[it]) }
        }
    }
}
