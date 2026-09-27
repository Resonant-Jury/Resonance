package com.resonance.geometry

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** `number | [lo, hi]` from the web: a fixed turn count, or a seeded pick in a range. */
sealed interface SegValue {
    data class Count(val n: Double) : SegValue
    data class Range(val lo: Int, val hi: Int) : SegValue
}

data class WobRectOptions(
    val curve: Double? = null,
    val cornerJitter: Double? = null,
    val cornerOffset: Double? = null,
    val segmentsH: SegValue? = null,
    val segmentsV: SegValue? = null,
)

/**
 * Wobbly rounded rectangle (src/lib/design/wobRect.ts). Line-for-line with the
 * web, including the order the PRNG is consumed in — that order *is* the shape.
 */
fun wobRect(
    W: Double, H: Double, R: Double, seed: Double, mag: Double? = null,
    o: WobRectOptions = WobRectOptions(),
): List<PathCommand> {
    val rnd = Prng(seed)
    val m = mag ?: (min(W, H) * 0.025)
    val K = 0.552
    val curve = o.curve ?: 1.0
    val cornerJitter = o.cornerJitter ?: 1.0
    val cornerOffset = o.cornerOffset ?: 0.0

    fun resolveSegs(v: SegValue?, fallback: Int): Int = when (v) {
        null -> fallback
        is SegValue.Count -> v.n.toInt() // `| 0` truncates toward zero
        is SegValue.Range -> v.lo + floor(rnd.next() * (v.hi - v.lo + 1)).toInt()
    }
    val segH = resolveSegs(o.segmentsH, 3)
    val segV = resolveSegs(o.segmentsV, 3)

    val rVar = min(R * 0.07, max(0.0, min(W, H) / 2 - R) * 0.4) * cornerJitter
    val rtl = R + (rnd.next() - 0.5) * 2 * rVar
    val rtr = R + (rnd.next() - 0.5) * 2 * rVar
    val rbr = R + (rnd.next() - 0.5) * 2 * rVar
    val rbl = R + (rnd.next() - 0.5) * 2 * rVar

    val oCap = max(0.0, min(W, H) * 0.5 - maxOf(rtl, rtr, rbr, rbl)) * 0.6
    val oMag = min(cornerOffset, oCap)
    fun off() = (rnd.next() - 0.5) * 2 * oMag
    val tlX = off(); val tlY = off()
    val trX = off(); val trY = off()
    val brX = off(); val brY = off()
    val blX = off(); val blY = off()

    val perpAmp = min(m * 0.95 * curve, min(W, H) * 0.032 * max(1.0, curve))

    fun cubicH(p0: Pt, p1: Pt): PathCommand {
        val h = abs(p1.x - p0.x) / 3
        val dir = if (p1.x >= p0.x) 1.0 else -1.0
        return PathCommand.Cubic(p0.x + dir * h, p0.y, p1.x - dir * h, p1.y, p1.x, p1.y)
    }
    fun cubicV(p0: Pt, p1: Pt): PathCommand {
        val h = abs(p1.y - p0.y) / 3
        val dir = if (p1.y >= p0.y) 1.0 else -1.0
        return PathCommand.Cubic(p0.x, p0.y + dir * h, p1.x, p1.y - dir * h, p1.x, p1.y)
    }
    fun buildEdge(p0: Pt, p1: Pt, horizontal: Boolean, segs: Int): List<PathCommand> {
        val emit: (Pt, Pt) -> PathCommand = if (horizontal) ::cubicH else ::cubicV
        val len = if (horizontal) abs(p1.x - p0.x) else abs(p1.y - p0.y)
        if (segs < 2 || len < perpAmp * 4) return listOf(emit(p0, p1))
        val jitter = min(0.08, 0.4 / segs)
        val out = ArrayList<PathCommand>(segs)
        var prev = p0
        for (i in 1 until segs) {
            val t = i.toDouble() / segs + (rnd.next() - 0.5) * jitter
            val x = p0.x + (p1.x - p0.x) * t
            val y = p0.y + (p1.y - p0.y) * t
            val a = if (horizontal) Pt(x, y + (rnd.next() - 0.5) * 2 * perpAmp)
            else Pt(x + (rnd.next() - 0.5) * 2 * perpAmp, y)
            out += emit(prev, a)
            prev = a
        }
        out += emit(prev, p1)
        return out
    }

    val tla = Pt(0.0, rtl + tlY)
    val tlb = Pt(rtl + tlX, 0.0)
    val tra = Pt(W - rtr + trX, 0.0)
    val trb = Pt(W, rtr + trY)
    val bra = Pt(W, H - rbr + brY)
    val brb = Pt(W - rbr + brX, H)
    val bla = Pt(rbl + blX, H)
    val blb = Pt(0.0, H - rbl + blY)

    val path = ArrayList<PathCommand>()
    path += PathCommand.Move(tla.x, tla.y)
    path += PathCommand.Cubic(0.0, tla.y * (1 - K) + tlb.y * K, tlb.x * (1 - K) + tla.x * K, 0.0, tlb.x, tlb.y)
    path += buildEdge(tlb, tra, true, segH)
    path += PathCommand.Cubic(tra.x + (W - tra.x) * K, 0.0, W, trb.y * (1 - K), trb.x, trb.y)
    path += buildEdge(trb, bra, false, segV)
    path += PathCommand.Cubic(W, bra.y + (H - bra.y) * K, brb.x + (W - brb.x) * K, H, brb.x, brb.y)
    path += buildEdge(brb, bla, true, segH)
    path += PathCommand.Cubic(bla.x * (1 - K), H, 0.0, blb.y + (H - blb.y) * K, blb.x, blb.y)
    path += buildEdge(blb, tla, false, segV)
    path += PathCommand.Close
    return path
}
