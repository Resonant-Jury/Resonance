package com.resonance.app.ui

import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.PaneBarRow
import com.resonance.design.TopBarRow
import com.resonance.design.generated.Tokens
import com.resonance.geometry.wavyPoints
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The two-pane Messages' lines (round 5 D4): the rule between the panes starts under the header's
 * paper — above every point of its wave, so it meets the wave wherever it is — breaks its wave
 * where the pane bar's line comes to meet it, and runs to the window's bottom edge.
 */
class PaneRuleTest {
    private val status = 24f
    private val g = paneRuleGeometry(status, height = 800f)
    private val headerFoot = status + TopBarRow.value + HeaderEdgeHeight.value

    @Test fun startsUnderTheHeadersPaperAboveEveryPointOfItsWave() {
        val line = headerFoot - 1.4 - Tokens.Ink.value
        for (width in listOf(900.0, 1280.0, 1600.0)) {
            val highest = wavyPoints(width, line, 1.4, 211.0, 12).minOf { it.y }
            assertTrue("$width: the wave reaches $highest", g.top < highest)
        }
        // Inside the header's band, not above it.
        assertTrue(g.top >= headerFoot - HeaderEdgeHeight.value)
    }

    @Test fun breaksItsWaveOnThePaneBarsLine() {
        // The pane bar's foot is its row and wavy band under the header's foot; its line ends level, 1.4 + the pen above it.
        assertEquals(headerFoot + PaneBarRow.value + HeaderEdgeHeight.value - 1.4f - Tokens.Ink.value, g.junction, 1e-4f)
        assertTrue(g.top < g.junction && g.junction < g.bottom)
    }

    @Test fun runsToTheWindowsBottomEdge() {
        assertEquals(800f, g.bottom)
    }

    @Test fun isOneOpaquePen() {
        assertEquals(1f, PanePen.alpha)
    }
}
