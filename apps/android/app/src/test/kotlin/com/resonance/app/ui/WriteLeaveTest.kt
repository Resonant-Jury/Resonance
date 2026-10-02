package com.resonance.app.ui

import com.resonance.app.DraftValues
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * When going back from the writer asks first: only when something written would be left behind.
 * A blank card, words the first-card guide seeded and a live card nobody has touched leave at once.
 */
class WriteLeaveTest {
    private val written = DraftValues(title = "A walk in the rain")

    private fun draft(values: DraftValues, lastSaved: DraftValues? = null, saved: Boolean = false) =
        holdsWork(isPublished = false, values = values, lastSaved = lastSaved, saved = saved, pendingEdit = false)

    private fun live(values: DraftValues, lastSaved: DraftValues?, pendingEdit: Boolean = false) =
        holdsWork(isPublished = true, values = values, lastSaved = lastSaved, saved = true, pendingEdit = pendingEdit)

    @Test fun aBlankCardLeavesAtOnce() {
        assertFalse(draft(DraftValues()))
        // Only whitespace is nothing either.
        assertFalse(draft(DraftValues(title = "  ", story = "\n")))
    }

    @Test fun anythingWrittenAsksFirst() {
        assertTrue(draft(written))
        assertTrue(draft(DraftValues(story = "Rain on the window.")))
        assertTrue(draft(DraftValues(tags = listOf("rain"))))
        assertTrue(draft(DraftValues(imageUrl = "https://img.example/a.webp")))
    }

    @Test fun aSavedDraftAsksWhetherOrNotTheLastEditHasLanded() {
        assertTrue(draft(written, lastSaved = written, saved = true))
        assertTrue(draft(written.copy(story = "More"), lastSaved = written, saved = true))
    }

    @Test fun aDraftEmptiedOutAgainLeavesAtOnce() {
        assertFalse(draft(DraftValues(), lastSaved = written, saved = true))
    }

    @Test fun wordsTheGuideSeededAreNotWritingUntilThereIsADraft() {
        val seeded = DraftValues(story = "> What stayed with you?\n\n")
        // Seeded: the baseline, no draft behind it.
        assertFalse(draft(seeded, lastSaved = seeded))
        // The person types on: now it is theirs.
        assertTrue(draft(seeded.copy(story = seeded.story + "The rain"), lastSaved = seeded))
    }

    @Test fun aLiveCardAsksOnlyForARevision() {
        val card = DraftValues(title = "Published", story = "Out in the world.")
        // Opened and read: nothing to lose.
        assertFalse(live(card, lastSaved = card))
        // A revision waiting in its buffer, or typed and not saved yet.
        assertTrue(live(card, lastSaved = card, pendingEdit = true))
        assertTrue(live(card.copy(story = "Out in the world, revised."), lastSaved = card))
    }
}
