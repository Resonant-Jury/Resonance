package com.resonance.app.ui

import com.resonance.app.Session
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A card page reads its card again only for a change that may concern it — the card itself, or a
 * resonance to it — or a block, or once what it read is old: another card's draft leaves it as it
 * is. The twin of iOS's WriteLauncher.Change.concerns and CardScreen.
 */
class CardPageReloadTest {
    private val readAt = 1_000_000_000L

    private fun current(
        changes: Int,
        last: Session.CardChange?,
        card: String? = "page",
        readFor: Int? = 4,
        after: Long = 60_000,
    ) = CardPageModel.isCurrent(readFor, readAt, changes, last, card, readAt + after)

    @Test fun aChangeConcernsItsCardAndTheCardItAnswers() {
        val reply = Session.CardChange("reply", "original")
        assertTrue(reply.concerns("reply"))
        assertTrue(reply.concerns("original"))
        assertFalse(reply.concerns("someone-else"))
        // A change that doesn't say which card (a block) concerns every page.
        assertTrue(Session.CardChange().concerns("anything"))
    }

    @Test fun anotherCardsChangeLeavesThePageAsItIs() {
        assertTrue(current(changes = 5, last = Session.CardChange("draft")))
        assertTrue(current(changes = 5, last = Session.CardChange("reply", "elsewhere")))
        assertTrue(current(changes = 4, last = null))
    }

    @Test fun itsOwnChangeAResonanceToItOrABlockReadsItAgain() {
        assertFalse(current(changes = 5, last = Session.CardChange("page")))
        assertFalse(current(changes = 5, last = Session.CardChange("reply", "page")))
        assertFalse(current(changes = 5, last = Session.CardChange()))
    }

    @Test fun aResonanceMadePrivateDeletedOrLetGoFromItsMenuReadsTheOriginalAgain() {
        // The ⋯ on "reply" (answering "page"): the original's page lists it among its resonances.
        assertFalse(current(changes = 5, last = menuChange("reply", "page")))
        // A card answering nothing concerns no other page.
        assertTrue(current(changes = 5, last = menuChange("reply", null)))
    }

    @Test fun whenItCantTellItReadsAgain() {
        // Several changes since: only the latest is known.
        assertFalse(current(changes = 6, last = Session.CardChange("draft")))
        // Not read yet, or the card not known yet (still loading, or it failed).
        assertFalse(current(changes = 4, last = null, readFor = null))
        assertFalse(current(changes = 5, last = Session.CardChange("draft"), card = null))
    }

    @Test fun aPageReadLongAgoReadsAgain() {
        assertFalse(current(changes = 4, last = null, after = 15 * 60_000L))
        assertFalse(current(changes = 5, last = Session.CardChange("draft"), after = 15 * 60_000L))
    }
}
