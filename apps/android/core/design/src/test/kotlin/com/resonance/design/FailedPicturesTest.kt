package com.resonance.design

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** A picture that wouldn't load is left out at once wherever it shows again, for a while. */
class FailedPicturesTest {
    private var now = 1_000_000L
    private val pictures = FailedPictures { now }

    @Test fun aPictureThatFailedIsLeftOutEverywhereUntilItsTimeIsUp() {
        val url = "/api/link-image?u=a&s=b"
        assertFalse(pictures.has(url))
        pictures.note(url)
        // A row scrolled back into view, or the copy the long-press lifts, finds it failed.
        assertTrue(pictures.has(url))
        assertFalse(pictures.has("/api/link-image?u=other&s=c"))
        now += FailedPictures.KEEP_MILLIS - 1
        assertTrue(pictures.has(url))
        // Later (a failure while offline, say) it is asked for again.
        now += 1
        assertFalse(pictures.has(url))
    }

    @Test fun itHoldsAFewHundredAtMostTheOldestGoingFirst() {
        repeat(FailedPictures.LIMIT) { i ->
            pictures.note("p$i")
            now += 1
        }
        pictures.note("newest")
        assertTrue(pictures.has("newest"))
        assertFalse(pictures.has("p0"))
        assertTrue(pictures.has("p1"))
    }
}
