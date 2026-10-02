package com.resonance.app.ui

import com.resonance.api.apis.DefaultApi.TabGetCardBox
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * My own shelves (published, private, drafts) are read together in one request — the shelf in
 * view, and the others of them not read lately; the others' shelves one at a time, when shown.
 */
class CardBoxShelvesTest {
    @Test fun anOwnShelfBringsTheOtherOwnShelvesThatAreDue() {
        assertEquals(
            listOf(TabGetCardBox.published, TabGetCardBox.`private`, TabGetCardBox.draft),
            shelvesToRead(TabGetCardBox.published) { false },
        )
        assertEquals(
            listOf(TabGetCardBox.draft, TabGetCardBox.published),
            shelvesToRead(TabGetCardBox.draft) { it == TabGetCardBox.`private` },
        )
        // Asked for again (a retry), the shelf in view comes even when the others are current.
        assertEquals(listOf(TabGetCardBox.`private`), shelvesToRead(TabGetCardBox.`private`) { true })
    }

    @Test fun othersShelvesComeOneAtATime() {
        for (shelf in listOf(TabGetCardBox.resonated, TabGetCardBox.linked, TabGetCardBox.bookmarks)) {
            assertEquals(listOf(shelf), shelvesToRead(shelf) { false })
        }
    }
}
