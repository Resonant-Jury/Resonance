package com.resonance.geometry

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tan

data class WobCircleOptions(val segments: Int? = null, val mag: Double? = null, val cpJitter: Double? = null)

private class Anchor(val x: Double, val y: Double, val angle: Double, val r: Double)

/** Hand-drawn wobbly circle (src/lib/design/wobCircle.ts). */
fun wobCircle(cx: Double, cy: Double, r: Double, seed: Double, o: WobCircleOptions = WobCircleOptions()): List<PathCommand> {
    val rnd = Prng(seed)
    val segments = o.segments ?: 8
    val mag = o.mag ?: 1.5
    val cpJitter = o.cpJitter ?: 0.6
    val anchors = (0 until segments).map { i ->
        val angle = i.toDouble() / segments * PI * 2
        val rr = r + (rnd.next() - 0.5) * 2 * mag
        Anchor(cx + cos(angle) * rr, cy + sin(angle) * rr, angle, rr)
    }
    val k = (4.0 / 3.0) * tan(PI / (2 * segments))
    return arcs(anchors, k, mag * cpJitter, rnd)
}

data class WobLoopOptions(
    val segments: Int? = null,
    val mag: Double? = null,
    val cpJitter: Double? = null,
    val blend: Double? = null,
)

/** The SketchLoader's two-lap loop as one closed subpath (src/lib/design/wobLoop.ts). */
fun wobLoop(cx: Double, cy: Double, rA: Double, rB: Double, seed: Double, o: WobLoopOptions = WobLoopOptions()): List<PathCommand> {
    val rnd = Prng(seed)
    val segments = o.segments ?: 8
    val mag = o.mag ?: 1.5
    val cpJitter = o.cpJitter ?: 0.6
    val blend = o.blend ?: 0.12

    fun ease(x: Double) = 0.5 - 0.5 * cos(PI * x)
    fun towardB(t: Double): Double = when {
        t < 0.5 - blend -> 0.0
        t < 0.5 -> ease((t - (0.5 - blend)) / blend)
        t < 1 - blend -> 1.0
        else -> 1 - ease((t - (1 - blend)) / blend)
    }

    val n = segments * 2
    val anchors = (0 until n).map { i ->
        val t = i.toDouble() / n
        val angle = t * PI * 4
        val base = rA + (rB - rA) * towardB(t)
        val rr = base + (rnd.next() - 0.5) * 2 * mag
        Anchor(cx + cos(angle) * rr, cy + sin(angle) * rr, angle, rr)
    }
    val k = (4.0 / 3.0) * tan(PI / (2 * segments))
    return arcs(anchors, k, mag * cpJitter, rnd)
}

private fun arcs(anchors: List<Anchor>, k: Double, cpMag: Double, rnd: Prng): List<PathCommand> {
    val path = ArrayList<PathCommand>(anchors.size + 2)
    path += PathCommand.Move(anchors[0].x, anchors[0].y)
    for (i in anchors.indices) {
        val a0 = anchors[i]
        val a1 = anchors[(i + 1) % anchors.size]
        val cp1x = a0.x - sin(a0.angle) * a0.r * k + (rnd.next() - 0.5) * 2 * cpMag
        val cp1y = a0.y + cos(a0.angle) * a0.r * k + (rnd.next() - 0.5) * 2 * cpMag
        val cp2x = a1.x + sin(a1.angle) * a1.r * k + (rnd.next() - 0.5) * 2 * cpMag
        val cp2y = a1.y - cos(a1.angle) * a1.r * k + (rnd.next() - 0.5) * 2 * cpMag
        path += PathCommand.Cubic(cp1x, cp1y, cp2x, cp2y, a1.x, a1.y)
    }
    path += PathCommand.Close
    return path
}
