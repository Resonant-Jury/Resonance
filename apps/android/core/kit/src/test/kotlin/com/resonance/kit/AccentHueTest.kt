package com.resonance.kit

import com.resonance.kit.images.AccentHue
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The web's dominantHue.test.ts, on ARGB pixels. */
class AccentHueTest {
    private fun argb(a: Int, r: Int, g: Int, b: Int) = (a shl 24) or (r shl 16) or (g shl 8) or b
    private fun near(expected: Double, actual: Double?, within: Double = 0.5) =
        assertTrue(actual != null && abs(actual - expected) <= within, "expected ≈$expected, got $actual")

    @Test fun mapsSaturatedColoursToTheirHueRegions() {
        assertTrue(AccentHue.rgbToOklch(128, 128, 128).c < 0.001)
        near(29.0, AccentHue.rgbToOklch(255, 0, 0).h, 1.0)
        near(142.0, AccentHue.rgbToOklch(0, 255, 0).h, 1.0)
        near(264.0, AccentHue.rgbToOklch(0, 0, 255).h, 1.0)
    }

    @Test fun ignoresGreyNearBlackNearWhiteAndTransparentPixels() {
        val px = intArrayOf(
            argb(255, 128, 128, 128),
            argb(255, 2, 2, 4),
            argb(255, 254, 254, 253),
            argb(10, 255, 0, 0),
            argb(255, 0, 0, 255),
        )
        near(264.0, AccentHue.dominantHue(px), 1.0)
    }

    @Test fun theSaturatedSubjectOutvotesAWashedBackground() {
        val px = IntArray(12) { argb(255, 200, 210, 230) } + IntArray(4) { argb(255, 220, 40, 30) }
        assertTrue(AccentHue.dominantHue(px)!! < 60)
    }

    @Test fun anAchromaticPictureKeepsThePositionColour() {
        assertNull(AccentHue.of(intArrayOf(argb(255, 255, 255, 255), argb(255, 0, 0, 0), argb(255, 128, 128, 128))))
    }

    @Test fun snapsToTheNearestFamilyAroundTheCircle() {
        assertEquals(55.0, AccentHue.nearestCardHue(60.0))
        assertEquals(290.0, AccentHue.nearestCardHue(300.0))
        assertEquals(140.0, AccentHue.nearestCardHue(150.0))
        assertEquals(18.0, AccentHue.nearestCardHue(0.0))
        assertEquals(18.0, AccentHue.nearestCardHue(350.0))
        assertEquals(215.0, AccentHue.nearestCardHue(230.0))
        assertEquals(18.0, AccentHue.of(IntArray(16) { argb(255, 255, 0, 0) }))
    }
}
