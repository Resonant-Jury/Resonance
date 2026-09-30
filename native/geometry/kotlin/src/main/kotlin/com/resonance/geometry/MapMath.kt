package com.resonance.geometry

import kotlin.math.max
import kotlin.math.min

// --- Thought-map math (src/components/molecules/ThoughtMap/mapMath.ts) -------

/** A card on the map is always this size, in world units. */
const val mapNodeW: Double = 232.0
const val mapNodeH: Double = 178.0
const val mapMinScale: Double = 0.25
const val mapMaxScale: Double = 2.0

/** The map's camera: `screen = world × s + (x, y)`. */
data class MapCamera(val x: Double, val y: Double, val s: Double)

data class MapGroupRect(val id: String, val rect: Rect)

fun screenToWorld(cam: MapCamera, px: Double, py: Double): Pt =
    Pt((px - cam.x) / cam.s, (py - cam.y) / cam.s)

/** Zoom by `factor` keeping the world point under (px, py) fixed; the scale is clamped. */
fun zoomAt(cam: MapCamera, px: Double, py: Double, factor: Double): MapCamera {
    val s = clamp(cam.s * factor, mapMinScale, mapMaxScale)
    val k = s / cam.s
    return MapCamera(px - (px - cam.x) * k, py - (py - cam.y) * k, s)
}

fun mapNodeRect(x: Double, y: Double): Rect = Rect(x, y, mapNodeW, mapNodeH)

/** Inclusive on every edge. */
fun rectContains(r: Rect, p: Pt): Boolean =
    p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

/** Strict: touching edges don't intersect. */
fun rectsIntersect(a: Rect, b: Rect): Boolean =
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

fun inflateRect(r: Rect, pad: Double): Rect = Rect(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad)

/** The fraction of `rect` that lies inside `outer`. */
fun coverage(rect: Rect, outer: Rect): Double {
    val ox = min(rect.x + rect.w, outer.x + outer.w) - max(rect.x, outer.x)
    val oy = min(rect.y + rect.h, outer.y + outer.h) - max(rect.y, outer.y)
    if (ox <= 0 || oy <= 0) return 0.0
    return ox * oy / (rect.w * rect.h)
}

/** The region a card is filed in: of those covering more than half of it, the smallest. */
fun majorityGroupId(rect: Rect, groups: List<MapGroupRect>): String? {
    var best: MapGroupRect? = null
    for (g in groups) {
        if (coverage(rect, g.rect) > 0.5) {
            val b = best
            if (b == null || g.rect.w * g.rect.h < b.rect.w * b.rect.h) best = g
        }
    }
    return best?.id
}

/** Nudge `rect` along the shallower axis until it clears every obstacle by `gap` (at most 16 passes). */
fun resolveOverlap(rect: Rect, obstacles: List<Rect>, gap: Double = 12.0): Pt {
    var x = rect.x
    var y = rect.y
    for (pass in 0 until 16) {
        var moved = false
        for (o in obstacles) {
            val ox = min(x + rect.w, o.x + o.w + gap) - max(x, o.x - gap)
            val oy = min(y + rect.h, o.y + o.h + gap) - max(y, o.y - gap)
            if (ox <= 0 || oy <= 0) continue
            if (ox <= oy) {
                x += if (x + rect.w / 2 >= o.x + o.w / 2) ox else -ox
            } else {
                y += if (y + rect.h / 2 >= o.y + o.h / 2) oy else -oy
            }
            moved = true
        }
        if (!moved) break
    }
    return Pt(x, y)
}

/** The camera that shows every rect with `pad` around them (never zooming in past 1). */
fun fitCamera(rects: List<Rect>, vw: Double, vh: Double, pad: Double = 70.0): MapCamera {
    if (rects.isEmpty() || vw <= 0 || vh <= 0) return MapCamera(vw / 2 - 120, vh / 2 - 90, 1.0)
    val x0 = rects.minOf { it.x }
    val y0 = rects.minOf { it.y }
    val x1 = rects.maxOf { it.x + it.w }
    val y1 = rects.maxOf { it.y + it.h }
    val bw = max(1.0, x1 - x0)
    val bh = max(1.0, y1 - y0)
    val s = clamp(min(min((vw - 2 * pad) / bw, (vh - 2 * pad) / bh), 1.0), mapMinScale, mapMaxScale)
    return MapCamera((vw - bw * s) / 2 - x0 * s, (vh - bh * s) / 2 - y0 * s, s)
}
