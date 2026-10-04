package com.resonance.app.ui

import com.resonance.app.NotificationsStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A bell row opens where it happened. A note or resonance on one of your anonymous cards opens
 * that card — never a conversation with its writer (whose unread count there would answer for
 * it), and so never a reply; every other row is as before. Its push routes by its own path.
 */
class NotificationRoutesTest {
    private fun item(type: String, anonymous: Boolean = false, noteId: String? = null, cardId: String? = "card1") = NotificationsStore.Item(
        id = "n1", type = type, fromHandle = "carol", fromUserId = "c1", cardId = cardId,
        preview = if (type == "note") "I walked there too" else null, noteId = noteId,
        count = null, readAt = null, createdAt = null, anonymous = anonymous,
    )

    @Test fun aNoteOnAnAnonymousCardOpensTheCardNotItsWritersThread() {
        val note = item("note", anonymous = true, noteId = "note1")
        assertTrue(note.onAnonymousCard)
        assertEquals(Route.Card("card1"), notificationRoute(note))
    }

    @Test fun aResonanceOnAnAnonymousCardOpensTheCard() {
        assertEquals(Route.Card("card1"), notificationRoute(item("resonance", anonymous = true)))
    }

    @Test fun anAnonymousCardsRowWithoutItsCardOpensNothingRatherThanAThread() {
        assertNull(notificationRoute(item("note", anonymous = true, noteId = "note1", cardId = null)))
        assertNull(notificationRoute(item("resonance", anonymous = true, cardId = null)))
    }

    @Test fun rowsWithoutTheFlagOpenTheConversationAsBefore() {
        // A note arrives quoted, ready to answer; a resonance opens the thread.
        assertEquals(Route.Thread("carol", "card1", "note1", uid = "c1"), notificationRoute(item("note", noteId = "note1")))
        assertEquals(Route.Thread("carol", uid = "c1"), notificationRoute(item("resonance")))
        assertEquals(Route.Thread("carol", uid = "c1"), notificationRoute(item("message")))
        assertEquals(Route.Card("card1"), notificationRoute(item("card_link")))
    }

    @Test fun onlyNotesAndResonancesTakeTheFlag() {
        // The flag means "your anonymous card" on these two only; a message row stays a conversation.
        assertFalse(item("message", anonymous = true).onAnonymousCard)
        assertEquals(Route.Thread("carol", uid = "c1"), notificationRoute(item("message", anonymous = true)))
    }

    @Test fun itsPushRoutesByItsPathAndNeverFallsBackToAThread() {
        // The push of such a row carries `/card/{id}` and no `fromUserId`: the bell list isn't asked who sent it.
        var asked = false
        assertEquals(Route.Card("card1"), pushedRoute(Route.fromPath("/card/card1"), null) { asked = true; "c1" })
        assertFalse(asked)
        // One with no page of its own opens the notifications, not a thread.
        assertNull(pushedRoute(Route.fromPath(""), null) { "c1" })
        assertEquals(Tab.Notifications, pushedTab(""))
    }
}
