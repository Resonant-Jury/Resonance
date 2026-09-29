package com.resonance.kit.images

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cbrt
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.pow
import kotlin.math.sin

/**
 * lib/design/dominantHue on the device: a cover photo's dominant OKLCH hue,
 * snapped to the nearest of the card palette's designed families — the twin
 * of iOS's CoverImage.accentHue. Pure math; the app feeds it the pixels of a
 * 32×32 thumbnail (lib/images/accentHue's SAMPLE).
 */
object AccentHue {
    /** CARD_HUES, in palette order (StoryCard indexes its fills by it). */
    val cardHues = listOf(55.0, 290.0, 140.0, 88.0, 215.0, 18.0)

    data class Lch(val l: Double, val c: Double, val h: Double)

    /** sRGB (0–255) → OKLab → LCh, h in degrees [0, 360). */
    fun rgbToOklch(r8: Int, g8: Int, b8: Int): Lch {
        fun lin(v: Int): Double {
            val c = v / 255.0
            return if (c <= 0.04045) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
        }
        val r = lin(r8)
        val g = lin(g8)
        val b = lin(b8)
        val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        val bigL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
        val a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
        val bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
        var h = atan2(bb, a) * 180 / PI
        if (h < 0) h += 360
        return Lch(bigL, hypot(a, bb), h)
    }

    /**
     * The chroma-weighted circular mean hue of ARGB pixels (Bitmap.getPixels's
     * layout). Grey, near-black, near-white and transparent pixels carry no
     * hue and are skipped; null when nothing is left to vote.
     */
    fun dominantHue(argb: IntArray): Double? {
        var x = 0.0
        var y = 0.0
        var weight = 0.0
        for (px in argb) {
            if ((px ushr 24) and 0xFF < 128) continue
            val (l, c, h) = rgbToOklch((px shr 16) and 0xFF, (px shr 8) and 0xFF, px and 0xFF)
            if (c < 0.02 || l < 0.08 || l > 0.98) continue
            val rad = h * PI / 180
            x += cos(rad) * c
            y += sin(rad) * c
            weight += c
        }
        if (weight == 0.0) return null
        var h = atan2(y, x) * 180 / PI
        if (h < 0) h += 360
        return h
    }

    /** The designed family closest to `hue`, around the circle. */
    fun nearestCardHue(hue: Double): Double = cardHues.minBy { distance(hue, it) }

    /** A card's accentHue from its cover's pixels; null keeps the position colour. */
    fun of(argb: IntArray): Double? = dominantHue(argb)?.let(::nearestCardHue)

    private fun distance(a: Double, b: Double): Double {
        val d = abs(a - b) % 360
        return if (d > 180) 360 - d else d
    }
}
