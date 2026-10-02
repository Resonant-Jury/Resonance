package com.resonance.app.thoughtmap

import com.resonance.app.Session
import com.resonance.app.thoughtmap.ThoughtMapStore.Refresh
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The thought map, kept by the session between visits, reads everything again only once what it
 * read is old; until then a visit reads only the cards the writer changed since — just the one it
 * names, or every card when it can't tell. The twin of iOS's WriterChangesTests.
 */
class ThoughtMapVisitsTest {
    private val readAt = 1_000_000_000L

    private fun refresh(
        loaded: Boolean = true,
        readAt: Long? = this.readAt,
        seen: Int = 4,
        changes: Int = 4,
        last: Session.CardChange? = null,
        after: Long = 60_000,
    ): Refresh = ThoughtMapStore.refresh(loaded, readAt, seen, changes, last, this.readAt + after)

    @Test fun backWithinAWhileWithNothingWrittenReadsNothing() {
        assertEquals(Refresh.Nothing, refresh())
    }

    @Test fun oneCardWrittenSinceReadsThatCardAndTheOneItAnswers() {
        assertEquals(Refresh.Cards(listOf("reply", "original")), refresh(changes = 5, last = Session.CardChange("reply", "original")))
        assertEquals(Refresh.Cards(listOf("draft")), refresh(changes = 5, last = Session.CardChange("draft")))
    }

    @Test fun severalChangesOrOneWithoutItsCardReadEveryCard() {
        assertEquals(Refresh.AllCards, refresh(changes = 6, last = Session.CardChange("reply")))
        // A block changes which cards show, not one card.
        assertEquals(Refresh.AllCards, refresh(changes = 5, last = Session.CardChange()))
    }

    @Test fun neverReadOrReadLongAgoReadsEverything() {
        assertEquals(Refresh.Everything, refresh(loaded = false))
        assertEquals(Refresh.Everything, refresh(readAt = null))
        assertEquals(Refresh.Everything, refresh(after = ThoughtMapStore.STALE_AFTER_MS))
        // A clock set back.
        assertEquals(Refresh.Everything, refresh(after = -1))
    }
}
