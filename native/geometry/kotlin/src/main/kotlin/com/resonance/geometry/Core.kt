package com.resonance.geometry

import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * One drawing command, mirroring the SVG path strings the web builds
 * (`M`, `L`, `C`, `Q`, `Z`). Shapes return a command list rather than a
 * platform path so every one of them is testable on the plain JVM.
 */
sealed interface PathCommand {
    val letter: Char
    val numbers: DoubleArray

    data class Move(val x: Double, val y: Double) : PathCommand {
        override val letter get() = 'M'
        override val numbers get() = doubleArrayOf(x, y)
    }

    data class Line(val x: Double, val y: Double) : PathCommand {
        override val letter get() = 'L'
        override val numbers get() = doubleArrayOf(x, y)
    }

    data class Cubic(
        val x1: Double, val y1: Double, val x2: Double, val y2: Double, val x: Double, val y: Double,
    ) : PathCommand {
        override val letter get() = 'C'
        override val numbers get() = doubleArrayOf(x1, y1, x2, y2, x, y)
    }

    data class Quad(val x1: Double, val y1: Double, val x: Double, val y: Double) : PathCommand {
        override val letter get() = 'Q'
        override val numbers get() = doubleArrayOf(x1, y1, x, y)
    }

    data object Close : PathCommand {
        override val letter get() = 'Z'
        override val numbers get() = DoubleArray(0)
    }
}

data class Pt(val x: Double, val y: Double)

// --- JS number semantics -----------------------------------------------------

/**
 * `+n.toFixed(2)` — for values the web rounds *before* computing with them
 * again (row menus, edge midpoints). BigDecimal(n) is the exact value of the
 * double and HALF_UP breaks true ties away from zero, which is exactly what
 * Number.prototype.toFixed does. (`Math.round(n * 100) / 100` is not: the
 * multiply can land a value just under .xx5 on the tie.)
 */
fun jsRound2(n: Double): Double =
    BigDecimal(n).setScale(2, RoundingMode.HALF_UP).toPlainString().toDouble()

/** `Math.round` — half rounds toward +∞. */
fun jsRound(n: Double): Double = floor(n + 0.5)

// --- Seeded PRNG (src/lib/design/prng.ts) ------------------------------------

/**
 * The web's LCG on Doubles with a truncating remainder — the same operations
 * as JavaScript's `number` and `%`, so every seed gives the identical sequence.
 */
class Prng(seed: Double) {
    private var s = (seed * 9301 + 49297) % 233280

    fun next(): Double {
        s = (s * 9301 + 49297) % 233280
        return s / 233280
    }
}

/** `seedFromString`: UTF-16 code units (Kotlin chars), 32-bit wrap like `| 0`. */
fun seedFromString(string: String): Int {
    var h = 0
    for (c in string) h = h * 31 + c.code
    // Math.abs(-2^31) is 2^31 in JS; widen before abs.
    return (abs(h.toLong()) % 9973).toInt() + 1
}

// --- Size-aware defaults (src/lib/design/wobAuto.ts) -------------------------

internal fun clamp(n: Double, lo: Double, hi: Double) = max(lo, min(hi, n))

fun autoSegments(edge: Double): Int = clamp(jsRound(edge / 95), 2.0, 8.0).toInt()
fun autoMag(w: Double, h: Double): Double = clamp(2 + min(w, h) * 0.013, 2.4, 4.0)
fun autoCurve(w: Double, h: Double): Double = clamp(1.8 - min(w, h) * 0.003, 0.6, 1.6)
