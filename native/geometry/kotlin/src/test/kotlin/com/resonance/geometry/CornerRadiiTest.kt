package com.resonance.geometry

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/** A rect that draws each corner with a radius of its own (a message bubble tucked against its neighbour). */
class CornerRadiiTest {
    private val bubble = WobRectOptions(curve = 1.3, cornerJitter = 1.6, cornerOffset = 1.5, segmentsH = SegValue.Count(3.0), segmentsV = SegValue.Count(1.0))

    @Test fun fourEqualRadiiDrawTheSameRectAsOne() {
        val one = wobRect(180.0, 44.0, 16.0, 91.0, 2.2, bubble)
        val four = wobRect(180.0, 44.0, 99.0, 91.0, 2.2, bubble.copy(cornerRadii = CornerRadii(16.0, 16.0, 16.0, 16.0)))
        assertEquals(one, four)
    }

    @Test fun noRadiiLeavesTheRectAsItWas() {
        assertEquals(wobRect(180.0, 44.0, 16.0, 91.0, 2.2, bubble), wobRect(180.0, 44.0, 16.0, 91.0, 2.2, bubble.copy(cornerRadii = null)))
    }

    @Test fun aTuckedCornerStartsItsArcCloserToTheCorner() {
        // No jitter and no drift: the path opens on the left edge at the top-left radius.
        val flat = WobRectOptions(cornerJitter = 0.0, cornerOffset = 0.0, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0))
        val round = wobRect(160.0, 40.0, 16.0, 5.0, 1.0, flat)
        val tucked = wobRect(160.0, 40.0, 16.0, 5.0, 1.0, flat.copy(cornerRadii = CornerRadii(5.0, 16.0, 16.0, 16.0)))
        assertEquals(16.0, (round.first() as PathCommand.Move).y, 1e-9)
        assertEquals(5.0, (tucked.first() as PathCommand.Move).y, 1e-9)
        assertNotEquals(round, tucked)
        // The other three corners are untouched: the top edge still ends 16 short of the right side.
        val roundTop = round.filterIsInstance<PathCommand.Cubic>().map { it.x }
        val tuckedTop = tucked.filterIsInstance<PathCommand.Cubic>().map { it.x }
        assertTrue(tuckedTop.contains(144.0) && roundTop.contains(144.0))
    }

    @Test fun eachCornerTakesItsOwnRadius() {
        val flat = WobRectOptions(cornerJitter = 0.0, cornerOffset = 0.0, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0))
        val path = wobRect(160.0, 40.0, 16.0, 5.0, 1.0, flat.copy(cornerRadii = CornerRadii(4.0, 6.0, 8.0, 10.0)))
        val move = path.first() as PathCommand.Move
        // tla = (0, rtl); the arc into the top edge ends at tlb = (rtl, 0); the top edge reaches tra = (W − rtr, 0).
        assertEquals(4.0, move.y, 1e-9)
        val edgeEnds = path.filterIsInstance<PathCommand.Cubic>().map { it.x to it.y }
        assertTrue((4.0 to 0.0) in edgeEnds)
        assertTrue((160.0 - 6.0 to 0.0) in edgeEnds)
        assertTrue((160.0 to 6.0) in edgeEnds)
        assertTrue((160.0 to 40.0 - 8.0) in edgeEnds)
        assertTrue((160.0 - 8.0 to 40.0) in edgeEnds)
        assertTrue((10.0 to 40.0) in edgeEnds)
        assertTrue((0.0 to 40.0 - 10.0) in edgeEnds)
    }
}
