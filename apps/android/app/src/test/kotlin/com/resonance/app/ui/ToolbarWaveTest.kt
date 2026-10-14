package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/** The writer's toolbar wave takes as many turns as its width does (wavyPath.ts `ruleSteps`). */
class ToolbarWaveTest {
    @Test fun aTurnPerEightyFourAtTheFewestTwelveAtTheMost() {
        assertEquals(4, ruleSteps(200f))
        assertEquals(5, ruleSteps(390f))
        assertEquals(8, ruleSteps(640f))
        assertEquals(10, ruleSteps(800f))
        assertEquals(12, ruleSteps(1400f))
    }

    @Test fun beforeItIsMeasuredItKeepsTheOldTen() {
        assertEquals(10, ruleSteps(0f))
        assertEquals(10, ruleSteps(Float.NaN))
    }
}
