package com.resonance.geometry

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

// --- Wavy lines (src/lib/design/wavyPath.ts) --------------------------------

/** Horizontal hand-drawn line from (0,0) to (W,0), wobbling in y. */
fun wavyLine(W: Double, seed: Double = 1.0, amp: Double = 2.0, steps: Int = 5): List<PathCommand> {
    val rnd = Prng(seed)
    val pts = (0..steps).map { i ->
        val t = i.toDouble() / steps
        Pt(t * W, if (i == 0 || i == steps) 0.0 else (rnd.next() - 0.5) * 2 * amp)
    }
    val path = arrayListOf<PathCommand>(PathCommand.Move(pts[0].x, pts[0].y))
    for (i in 1 until pts.size) {
        val (x0, y0) = pts[i - 1]
        val (x1, y1) = pts[i]
        val h = (x1 - x0) / 3
        path += PathCommand.Cubic(x0 + h, y0, x1 - h, y1, x1, y1)
    }
    return path
}

/**
 * A pen's wavy underline at its real width (wavyPath.ts `penWave`): a crest
 * every ~`half`, alternating up and down, each crest's height and place nudged
 * by the seed, settling on the line at both ends.
 */
fun penWavePoints(W: Double, seed: Double = 1.0, amp: Double = 1.2, half: Double = 4.5): List<Pt> {
    val rnd = Prng(seed)
    val n = max(2, jsRound(W / half).toInt())
    val step = W / n
    return (0..n).map { i ->
        if (i == 0 || i == n) Pt(i * step, 0.0)
        else {
            val x = i * step + (rnd.next() - 0.5) * step * 0.3
            val y = (if (i % 2 == 1) -1.0 else 1.0) * amp * (0.65 + 0.7 * rnd.next())
            Pt(x, y)
        }
    }
}

fun penWave(W: Double, seed: Double = 1.0, amp: Double = 1.2, half: Double = 4.5): List<PathCommand> =
    pointsToBezier(penWavePoints(W, seed, amp, half))

/** Vertical sibling of [wavyLine] — runs down the y-axis, wobbling in x. */
fun wavyVertical(H: Double, seed: Double = 1.0, amp: Double = 2.0, steps: Int = 5): List<PathCommand> {
    val rnd = Prng(seed)
    val pts = (0..steps).map { i ->
        val t = i.toDouble() / steps
        Pt(if (i == 0 || i == steps) 0.0 else (rnd.next() - 0.5) * 2 * amp, t * H)
    }
    val path = arrayListOf<PathCommand>(PathCommand.Move(pts[0].x, pts[0].y))
    for (i in 1 until pts.size) {
        val (x0, y0) = pts[i - 1]
        val (x1, y1) = pts[i]
        val v = (y1 - y0) / 3
        path += PathCommand.Cubic(x0, y0 + v, x1, y1 - v, x1, y1)
    }
    return path
}

/** Points along a wavy baseline (headers, section edges). */
fun wavyPoints(W: Double, y0: Double, amp: Double, seed: Double, steps: Int): List<Pt> {
    val rnd = Prng(seed)
    return (0..steps).map { i ->
        val t = i.toDouble() / steps
        val interior = i > 0 && i < steps
        val x = t * W + if (interior) (rnd.next() - 0.5) * (W / steps) * 0.18 else 0.0
        val y = if (i == 0 || i == steps) y0 else y0 - (rnd.next() - 0.5) * 2 * amp
        Pt(x, y)
    }
}

/** Smooth cubic through points with horizontal handles at each midpoint. */
fun pointsToBezier(pts: List<Pt>): List<PathCommand> {
    val path = arrayListOf<PathCommand>(PathCommand.Move(pts[0].x, pts[0].y))
    for (i in 1 until pts.size) {
        val (x0, y0) = pts[i - 1]
        val (x1, y1) = pts[i]
        val midX = (x0 + x1) / 2
        path += PathCommand.Cubic(midX, y0, midX, y1, x1, y1)
    }
    return path
}

// --- Thought-map arrows (src/lib/design/edgePath.ts) ------------------------

data class Rect(val x: Double, val y: Double, val w: Double, val h: Double)
data class EdgeAnchor(val x: Double, val y: Double, val nx: Double, val ny: Double)
data class EdgeGeometry(
    val path: List<PathCommand>,
    val start: EdgeAnchor,
    val end: EdgeAnchor,
    val mid: Pt,
    val endAngle: Double,
)

fun rectAnchor(rect: Rect, toward: Pt): EdgeAnchor {
    val cx = rect.x + rect.w / 2
    val cy = rect.y + rect.h / 2
    val dx = toward.x - cx
    val dy = toward.y - cy
    if (abs(dx) >= abs(dy)) {
        val m = min(14.0, rect.h / 2)
        val slide = min(rect.h / 2 - m, max(-rect.h / 2 + m, dy * 0.25))
        return if (dx >= 0) EdgeAnchor(rect.x + rect.w, cy + slide, 1.0, 0.0)
        else EdgeAnchor(rect.x, cy + slide, -1.0, 0.0)
    }
    val m = min(14.0, rect.w / 2)
    val slide = min(rect.w / 2 - m, max(-rect.w / 2 + m, dx * 0.25))
    return if (dy >= 0) EdgeAnchor(cx + slide, rect.y + rect.h, 0.0, 1.0)
    else EdgeAnchor(cx + slide, rect.y, 0.0, -1.0)
}

fun organicEdgePath(source: Rect, target: Rect, seed: Double): EdgeGeometry {
    val rnd = Prng(seed)
    val sc = Pt(source.x + source.w / 2, source.y + source.h / 2)
    val tc = Pt(target.x + target.w / 2, target.y + target.h / 2)
    val start = rectAnchor(source, tc)
    val end = rectAnchor(target, sc)

    val dist = hypot(end.x - start.x, end.y - start.y)
    val reach = min(150.0, max(26.0, dist * 0.38))
    fun jitter() = (rnd.next() - 0.5) * min(18.0, dist * 0.12)

    val p1x = start.x + start.nx * reach + if (start.nx == 0.0) jitter() else 0.0
    val p1y = start.y + start.ny * reach + if (start.ny == 0.0) jitter() else 0.0
    val p2x = end.x + end.nx * reach + if (end.nx == 0.0) jitter() else 0.0
    val p2y = end.y + end.ny * reach + if (end.ny == 0.0) jitter() else 0.0

    val midX = 0.125 * start.x + 0.375 * p1x + 0.375 * p2x + 0.125 * end.x
    val midY = 0.125 * start.y + 0.375 * p1y + 0.375 * p2y + 0.125 * end.y
    return EdgeGeometry(
        path = listOf(PathCommand.Move(start.x, start.y), PathCommand.Cubic(p1x, p1y, p2x, p2y, end.x, end.y)),
        start = start,
        end = end,
        mid = Pt(jsRound2(midX), jsRound2(midY)),
        endAngle = atan2(end.y - p2y, end.x - p2x),
    )
}

/** Two swept-back pen flicks forming an arrowhead at `tip`. */
fun arrowHeadPath(tip: Pt, angle: Double, size: Double, seed: Double): List<PathCommand> {
    val rnd = Prng(seed)
    val spread = 0.46
    fun wing(sign: Double): List<PathCommand> {
        val a = angle + PI + sign * (spread + (rnd.next() - 0.5) * 0.12)
        val len = size * (0.92 + rnd.next() * 0.2)
        val ex = tip.x + cos(a) * len
        val ey = tip.y + sin(a) * len
        val mx = tip.x + cos(a) * len * 0.5 + cos(a + PI / 2) * sign * size * 0.12
        val my = tip.y + sin(a) * len * 0.5 + sin(a + PI / 2) * sign * size * 0.12
        return listOf(PathCommand.Move(tip.x, tip.y), PathCommand.Quad(mx, my, ex, ey))
    }
    return wing(1.0) + wing(-1.0)
}

// --- Organic menu rows (src/lib/design/rowMenu.ts) --------------------------

/** Wavy boundary between two menu rows; rounded like the web because the
 *  rounded points feed the divider and region paths. */
fun rowBoundary(y: Double, w: Double, seed: Double, amp: Double, pad: Double): List<Pt> {
    val steps = 4
    val rnd = Prng(seed)
    val pts = arrayListOf(Pt(-pad, jsRound2(y)))
    for (k in 0..steps) {
        val x = k.toDouble() / steps * w
        val off = if (k == 0 || k == steps) 0.0 else (rnd.next() - 0.5) * 2 * amp
        pts += Pt(jsRound2(x), jsRound2(y + off))
    }
    pts += Pt(w + pad, jsRound2(y))
    return pts
}

internal fun rowSegs(pts: List<Pt>): List<PathCommand> = (1 until pts.size).map { i ->
    val (x0, y0) = pts[i - 1]
    val (x1, y1) = pts[i]
    val hx = (x1 - x0) / 3
    PathCommand.Cubic(x0 + hx, y0, x1 - hx, y1, x1, y1)
}

fun dividerPath(pts: List<Pt>): List<PathCommand> = listOf(PathCommand.Move(pts[0].x, pts[0].y)) + rowSegs(pts)

/** Closed region for row `i`, between the wavy boundaries above and below it. */
fun rowRegion(i: Int, count: Int, boundaries: List<List<Pt>>, w: Double, h: Double, pad: Double): List<PathCommand> {
    val top = if (i == 0) listOf(Pt(-pad, -pad), Pt(w + pad, -pad)) else boundaries[i - 1]
    val bottom = if (i == count - 1) listOf(Pt(-pad, h + pad), Pt(w + pad, h + pad)) else boundaries[i]
    val botRev = bottom.reversed()
    return listOf(PathCommand.Move(top[0].x, top[0].y)) + rowSegs(top) +
        PathCommand.Line(botRev[0].x, botRev[0].y) + rowSegs(botRev) + PathCommand.Close
}
