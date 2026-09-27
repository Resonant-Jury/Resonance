package com.resonance.geometry

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

data class WobTabRectOptions(
    val R: Double? = null,
    val tabR: Double? = null,
    val mag: Double? = null,
    val curve: Double? = null,
)

/**
 * Card outline with a folder tab above it, as one stroke
 * (src/lib/design/wobTabRect.ts). Path space is W × (H + tabH); card top at y = tabH.
 */
fun wobTabRect(
    W: Double, H: Double, tabX: Double, tabW: Double, tabH: Double, seed: Double,
    o: WobTabRectOptions = WobTabRectOptions(),
): List<PathCommand> {
    val rnd = Prng(seed)
    val R = o.R ?: 18.0
    val tabR = o.tabR ?: 9.0
    val mag = o.mag ?: 2.4
    val curve = o.curve ?: 1.0
    val K = 0.552
    val T = tabH

    val perpAmp = min(mag * 0.95 * curve, min(W, H) * 0.032 * max(1.0, curve))

    fun cubic(p0: Pt, p1: Pt, horizontal: Boolean): PathCommand {
        if (horizontal) {
            val h = abs(p1.x - p0.x) / 3
            val dir = if (p1.x >= p0.x) 1.0 else -1.0
            return PathCommand.Cubic(p0.x + dir * h, p0.y, p1.x - dir * h, p1.y, p1.x, p1.y)
        }
        val h = abs(p1.y - p0.y) / 3
        val dir = if (p1.y >= p0.y) 1.0 else -1.0
        return PathCommand.Cubic(p0.x, p0.y + dir * h, p1.x, p1.y - dir * h, p1.x, p1.y)
    }

    fun edge(p0: Pt, p1: Pt, horizontal: Boolean, minSegs: Int = 1): List<PathCommand> {
        val len = if (horizontal) abs(p1.x - p0.x) else abs(p1.y - p0.y)
        val segs = max(minSegs, jsRound(len / 80).toInt())
        if (segs < 2 || len < perpAmp * 4) return listOf(cubic(p0, p1, horizontal))
        val out = ArrayList<PathCommand>(segs)
        var prev = p0
        for (i in 1 until segs) {
            val t = i.toDouble() / segs + (rnd.next() - 0.5) * min(0.08, 0.4 / segs)
            val x = p0.x + (p1.x - p0.x) * t
            val y = p0.y + (p1.y - p0.y) * t
            val a = if (horizontal) Pt(x, y + (rnd.next() - 0.5) * 2 * perpAmp)
            else Pt(x + (rnd.next() - 0.5) * 2 * perpAmp, y)
            out += cubic(prev, a, horizontal)
            prev = a
        }
        out += cubic(prev, p1, horizontal)
        return out
    }

    fun jr(r: Double) = r + (rnd.next() - 0.5) * 2 * min(r * 0.12, 2.0)
    val rtl = jr(R); val rtr = jr(R); val rbr = jr(R); val rbl = jr(R)
    val tTl = jr(tabR); val tTr = jr(tabR)

    val tabL = max(tabX, rtl + 1)
    val tabRt = min(tabX + tabW, W - rtr - 1)

    val p = ArrayList<PathCommand>()
    p += PathCommand.Move(0.0, T + rtl)
    p += PathCommand.Cubic(0.0, (T + rtl) * (1 - K) + T * K, rtl * (1 - K), T, rtl, T)
    p += edge(Pt(rtl, T), Pt(tabL, T), true)
    p += edge(Pt(tabL, T), Pt(tabL, tTl), false)
    p += PathCommand.Cubic(tabL, tTl * (1 - K), (tabL + tTl) - tTl * K, 0.0, tabL + tTl, 0.0)
    p += edge(Pt(tabL + tTl, 0.0), Pt(tabRt - tTr, 0.0), true, 2)
    p += PathCommand.Cubic((tabRt - tTr) + tTr * K, 0.0, tabRt, tTr * (1 - K), tabRt, tTr)
    p += edge(Pt(tabRt, tTr), Pt(tabRt, T), false)
    p += edge(Pt(tabRt, T), Pt(W - rtr, T), true)
    p += PathCommand.Cubic((W - rtr) + rtr * K, T, W, (T + rtr) * (1 - K) + T * K, W, T + rtr)
    p += edge(Pt(W, T + rtr), Pt(W, T + H - rbr), false, 2)
    p += PathCommand.Cubic(W, T + H - rbr * (1 - K), W - rbr * (1 - K), T + H, W - rbr, T + H)
    p += edge(Pt(W - rbr, T + H), Pt(rbl, T + H), true, 3)
    p += PathCommand.Cubic(rbl * (1 - K), T + H, 0.0, T + H - rbl * (1 - K), 0.0, T + H - rbl)
    p += edge(Pt(0.0, T + H - rbl), Pt(0.0, T + rtl), false, 2)
    p += PathCommand.Close
    return p
}
