package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/** The tag field's rules (TagField.tsx and its test), without a keyboard: separators, trimming, repeats. */
class TagInputTest {
    @Test fun textWithoutASeparatorIsStillBeingTyped() {
        assertEquals(emptyList<String>() to "travel", TagInput.split("travel"))
        assertEquals(emptyList<String>() to "", TagInput.split(""))
    }

    @Test fun aCommaOfEitherWidthOrTheEnumerationCommaEndsATag() {
        assertEquals(listOf("travel") to "", TagInput.split("travel,"))
        assertEquals(listOf("travel") to "", TagInput.split("travel，"))
        assertEquals(listOf("travel") to "", TagInput.split("travel、"))
    }

    @Test fun whatFollowsTheLastSeparatorStaysToBeTypedOn() {
        assertEquals(listOf("home") to "fa", TagInput.split("home,fa"))
        // Leading space after a separator is not part of the next word.
        assertEquals(listOf("home") to "fa", TagInput.split("home,  fa"))
    }

    @Test fun aPastedListSplitsInOneGo() {
        val (words, rest) = TagInput.split("home, travel，family、 ,memory")
        // Untrimmed and blanks included: merge is what cleans them.
        assertEquals(listOf("home", " travel", "family", " "), words)
        assertEquals("memory", rest)
        assertEquals(listOf("home", "travel", "family"), TagInput.merge(emptyList(), words))
    }

    @Test fun mergeTrimsAndSkipsBlanksAndRepeats() {
        assertEquals(listOf("home", "travel", "family"), TagInput.merge(listOf("home"), listOf(" travel ", "", "home", "family", "  ", "travel")))
    }

    @Test fun mergeKeepsTheOrderTheyWereAdded() {
        assertEquals(listOf("b", "a", "c"), TagInput.merge(listOf("b"), listOf("a", "c")))
    }

    @Test fun nothingNewLeavesTheListAsItWas() {
        val tags = listOf("a", "b")
        assertEquals(tags, TagInput.merge(tags, listOf("b", " ")))
    }
}
