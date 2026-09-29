package com.resonance.design

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/** MessageBubble's seeds: the web's Java-style string hash (MessageBubble.tsx), pinned by its test vectors. */
class MessagesTest {
    @Test fun aBubbleSeedIsTheWebsHashFromSeven() {
        assertEquals(183.0, seedFromId("m1"), 0.0)
    }

    @Test fun aSharedCardsEmbedStartsFromEleven() {
        assertEquals(6326.0, seedFromId("card-77", start = 11), 0.0)
    }

    @Test fun theSeedStaysInOneToNinetyNineSeventyThree() {
        // Long ids overflow the 32-bit hash (negative remainders fold back with abs).
        for (id in listOf("", "a", "eBkq0mYc2pQXn8vL1sD3", "共振", "🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂")) {
            val seed = seedFromId(id)
            assert(seed in 1.0..9973.0) { "$id → $seed" }
        }
    }

    @Test fun differentIdsWobbleDifferently() {
        assertNotEquals(seedFromId("m1"), seedFromId("m2"), 0.0)
    }
}
