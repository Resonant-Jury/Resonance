package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The pen name's rules, as the contract's `Handle` states them (lib/api/v1/schemas.ts). */
class PenNameTest {
    @Test fun anyScriptOfTwoToTwentyCharactersTrimmed() {
        assertTrue(PenName.isValid("小雨"))
        assertTrue(PenName.isValid("  rain  "))
        assertTrue(PenName.isValid("a".repeat(20)))
        assertTrue(PenName.isValid("夜 行 者"))
        assertFalse(PenName.isValid("雨"))
        assertFalse(PenName.isValid(" a "))
        assertFalse(PenName.isValid("a".repeat(21)))
        assertFalse(PenName.isValid(""))
    }

    @Test fun neverAPathQueryOrControlCharacter() {
        listOf("a/b", "a?b", "a#b", "a\\b", "a\u0000b", "a\nb", "a\u007Fb").forEach { assertFalse(it, PenName.isValid(it)) }
    }

    @Test fun theFieldDropsWhatTheContractRefusesAndStopsAtTwenty() {
        assertEquals("ab", PenName.sanitize("a/b"))
        assertEquals("rain", PenName.sanitize("ra\nin"))
        assertEquals("a".repeat(20), PenName.sanitize("a".repeat(25)))
        // An emoji straddling the limit isn't cut in half.
        assertEquals("a".repeat(19), PenName.sanitize("a".repeat(19) + "😀"))
        assertEquals("a".repeat(18) + "😀", PenName.sanitize("a".repeat(18) + "😀x"))
    }
}
