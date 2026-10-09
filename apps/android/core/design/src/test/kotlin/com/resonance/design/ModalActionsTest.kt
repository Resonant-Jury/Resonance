package com.resonance.design

import androidx.compose.ui.unit.IntOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A dialog's foot (the web's ModalActions): right-aligned in scanning order, the way out then the
 * verb, 10 apart; a pair too wide for one row stacks with the verb on top and the way out under
 * it, both still at the right — never squeezed so the labels break inside their pills.
 */
class ModalActionsTest {
    private val gap = 10

    @Test fun aPairThatFitsSitsAtTheRightTheVerbRightmost() {
        // Cancel 80 wide, the verb 100, in 300: the pair ends at the right edge.
        assertFalse(ModalActionsLayout.stacks(listOf(80, 100), gap, 300))
        val spots = ModalActionsLayout.place(listOf(80, 100), listOf(40, 40), gap, 300, stacked = false)
        assertEquals(listOf(IntOffset(110, 0), IntOffset(200, 0)), spots)
    }

    @Test fun inARowTheyShareOneCentreLine() {
        val spots = ModalActionsLayout.place(listOf(80, 100), listOf(36, 48), gap, 300, stacked = false)
        assertEquals(6, spots[0].y)
        assertEquals(0, spots[1].y)
    }

    @Test fun exactlyFittingIsStillOneRow() {
        assertFalse(ModalActionsLayout.stacks(listOf(150, 140), gap, 300))
        assertTrue(ModalActionsLayout.stacks(listOf(150, 141), gap, 300))
    }

    @Test fun tooWideStacksTheVerbOnTopBothAtTheRight() {
        // "Keep my account | Delete account" on a narrow phone.
        val widths = listOf(170, 160)
        assertTrue(ModalActionsLayout.stacks(widths, gap, 300))
        val spots = ModalActionsLayout.place(widths, listOf(48, 48), gap, 300, stacked = true)
        // The verb (the last) first, from the top; the way out under it, 10 lower.
        assertEquals(IntOffset(140, 0), spots[1])
        assertEquals(IntOffset(130, 58), spots[0])
    }
}
