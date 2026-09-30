package com.resonance.geometry

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

// Vectors computed from src/components/molecules/ThoughtMap/mapMath.ts (the
// web's own functions, real 232×178 cards) and mapMath.test.ts — the same ones
// MapMathTests.swift pins on the Swift side.

private fun near(a: Double, b: Double, tol: Double = 1e-9) = abs(a - b) <= tol
private fun near(c: MapCamera, x: Double, y: Double, s: Double) =
    near(c.x, x, 1e-6) && near(c.y, y, 1e-6) && near(c.s, s, 1e-12)
private fun node(x: Double, y: Double) = mapNodeRect(x, y)

class MapMathTest {
    @Test
    fun screenToWorldAndZoomAt() {
        val cam = MapCamera(40.0, -20.0, 0.5)
        val w = screenToWorld(cam, 140.0, 80.0)
        assertTrue(near(w.x, 200.0) && near(w.y, 200.0))
        val o = screenToWorld(cam, 0.0, 0.0)
        assertTrue(near(o.x, -80.0) && near(o.y, 40.0))
        assertTrue(near(zoomAt(cam, 300.0, 200.0, 1.3), -38.0, -86.0, 0.65))
        assertTrue(near(zoomAt(cam, 300.0, 200.0, 100.0), -740.0, -680.0, 2.0))
        assertTrue(near(zoomAt(cam, 0.0, 0.0, 0.001), 20.0, -10.0, 0.25))
        assertTrue(near(zoomAt(MapCamera(0.0, 0.0, 1.0), 195.0, 422.0, 1.25), -48.75, -105.5, 1.25))
        assertTrue(near(zoomAt(MapCamera(0.0, 0.0, 1.0), 195.0, 422.0, 1 / 1.25), 39.0, 84.4, 0.8))
        assertTrue(near(zoomAt(MapCamera(10.0, 20.0, 1.6), 100.0, 100.0, 1.25), -12.5, 0.0, 2.0))
        // The world point under the focus stays put.
        val z = zoomAt(cam, 300.0, 200.0, 1.3)
        val before = screenToWorld(cam, 300.0, 200.0)
        val after = screenToWorld(z, 300.0, 200.0)
        assertTrue(near(before.x, after.x) && near(before.y, after.y))
    }

    @Test
    fun coverageAndMajority() {
        val outer = Rect(0.0, 0.0, 100.0, 100.0)
        assertEquals(1.0, coverage(Rect(10.0, 10.0, 20.0, 20.0), outer))
        assertEquals(0.0, coverage(Rect(200.0, 0.0, 20.0, 20.0), outer))
        assertTrue(near(coverage(Rect(90.0, 0.0, 20.0, 20.0), outer), 0.5))

        val groups = listOf(
            MapGroupRect("g1", Rect(0.0, 0.0, 600.0, 400.0)),
            MapGroupRect("inner", Rect(50.0, 50.0, 300.0, 300.0)),
        )
        assertNull(majorityGroupId(node(-116.0, 100.0), groups)) // exactly half is not a majority
        assertEquals("g1", majorityGroupId(node(-115.0, 100.0), groups))
        assertTrue(near(coverage(node(-115.0, 100.0), groups[0].rect), 0.5043103448275862))
        assertEquals("inner", majorityGroupId(node(60.0, 60.0), groups)) // the tightest region wins

        // mapMath.test.ts, with its 224×136 cards.
        fun small(x: Double, y: Double) = Rect(x, y, 224.0, 136.0)
        assertEquals("g1", majorityGroupId(small(-100.0, 100.0), groups))
        assertNull(majorityGroupId(small(-120.0, 100.0), groups))
        assertNull(majorityGroupId(small(-112.0, 100.0), groups))
        assertEquals("g1", majorityGroupId(small(360.0, 200.0), groups))
        assertEquals("g1", majorityGroupId(small(450.0, 100.0), groups))
        assertNull(majorityGroupId(small(520.0, 100.0), groups))
    }

    @Test
    fun resolveOverlapSettles() {
        fun settle(x: Double, y: Double, obstacles: List<Rect>): Pair<Double, Double> {
            val p = resolveOverlap(node(x, y), obstacles)
            return p.x to p.y
        }
        val o = listOf(node(0.0, 0.0))
        assertEquals(0.0 to 190.0, settle(0.0, 0.0, o)) // two passes: +178, then +12
        assertEquals(30.0 to 190.0, settle(30.0, 20.0, o))
        assertEquals(-30.0 to 190.0, settle(-30.0, 0.0, o))
        assertEquals(0.0 to 190.0, settle(0.0, 150.0, o))
        assertEquals(244.0 to 0.0, settle(244.0, 0.0, o)) // already exactly at the gap
        assertEquals(244.0 to 0.0, settle(243.0, 0.0, o))
        assertEquals(1000.0 to 1000.0, settle(1000.0, 1000.0, o))

        fun small(x: Double, y: Double) = Rect(x, y, 224.0, 136.0)
        val p = resolveOverlap(small(0.0, 120.0), listOf(small(0.0, 0.0)))
        assertTrue(p.x == 0.0 && p.y == 148.0)
        val two = listOf(small(0.0, 0.0), small(260.0, 0.0))
        val q = resolveOverlap(small(40.0, 10.0), two)
        assertTrue(two.all { !rectsIntersect(small(q.x, q.y), it) })
    }

    @Test
    fun fitCameraFramesEverything() {
        assertEquals(MapCamera(280.0, 160.0, 1.0), fitCamera(emptyList(), 800.0, 500.0))
        assertEquals(MapCamera(75.0, 332.0, 1.0), fitCamera(emptyList(), 390.0, 844.0))
        assertEquals(MapCamera(-120.0, -90.0, 1.0), fitCamera(listOf(node(0.0, 0.0)), 0.0, 0.0))
        assertTrue(
            near(
                fitCamera(listOf(Rect(0.0, 0.0, 224.0, 136.0), Rect(900.0, 600.0, 224.0, 136.0)), 800.0, 500.0),
                125.10869565217394, 70.0, 0.4891304347826087,
            ),
        )
        assertTrue(near(fitCamera(listOf(node(0.0, 0.0)), 390.0, 844.0), 79.0, 333.0, 1.0))
        assertTrue(near(fitCamera(listOf(node(0.0, 0.0), node(400.0, 300.0)), 390.0, 844.0), 70.0, 327.4588607594937, 0.39556962025316456))
        assertTrue(near(fitCamera(listOf(node(0.0, 0.0), node(3000.0, 2000.0)), 390.0, 844.0), -209.0, 149.75, 0.25))
        assertTrue(near(fitCamera(listOf(Rect(0.0, 0.0, 460.0, 340.0)), 390.0, 844.0), 70.0, 329.60869565217394, 0.5434782608695652))
    }

    @Test
    fun rectHelpers() {
        val r = Rect(0.0, 0.0, 10.0, 10.0)
        assertTrue(rectContains(r, Pt(10.0, 10.0))) // inclusive
        assertTrue(!rectContains(r, Pt(10.1, 5.0)))
        assertTrue(!rectsIntersect(r, Rect(10.0, 0.0, 5.0, 5.0))) // touching edges don't intersect
        assertTrue(rectsIntersect(r, Rect(9.9, 0.0, 5.0, 5.0)))
        assertEquals(Rect(-100.0, -100.0, 210.0, 210.0), inflateRect(r, 100.0))
    }

    @Test
    fun seedsMatchTheWeb() {
        assertEquals(3119, seedFromString("c1"))
        assertEquals(708, seedFromString("mine"))
        assertEquals(4565, seedFromString("theirs"))
        assertEquals(4474, seedFromString("c1_c2"))
        assertEquals(3243, seedFromString("g1"))
    }

    /** The arrow between two 232×178 cards (edgePath.ts, seed 'c1_c2') — what the map's arrows and label pills sit on. */
    @Test
    fun arrowMatchesTheWebSample() {
        val a = Rect(0.0, 0.0, 232.0, 178.0)
        val b = Rect(500.0, 300.0, 232.0, 178.0)
        val geo = organicEdgePath(a, b, seedFromString("c1_c2").toDouble())
        assertTrue(near(geo.mid.x, 366.0, 0.005) && near(geo.mid.y, 241.11, 0.005))
        assertTrue(near(geo.endAngle, -0.03752580386785247, 1e-9))
    }
}
