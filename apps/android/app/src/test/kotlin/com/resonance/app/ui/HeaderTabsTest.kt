package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which pages a tablet's header shows its tabs and pen over (round 5, part C), and what choosing
 * the tab already shown does — on the phone's bottom bar and the tablet's header alike.
 */
class HeaderTabsTest {
    @Test fun theTabsLieOverATabsRootAndNeverOverAPushedPage() {
        for (tab in listOf(Tab.Feed, Tab.Messages, Tab.Notifications, Tab.CardBox)) {
            assertTrue(headerTabsShown(listOf(Route.Root(tab)), expanded = false))
            assertTrue(headerTabsShown(listOf(Route.Root(tab)), expanded = true))
        }
        // Pushed pages lead out by their back arrow alone: a card, a profile, settings, the writer.
        for (pushed in listOf(Route.Card("a-walk"), Route.Author("bob"), Route.Settings, Route.Write())) {
            assertFalse(headerTabsShown(listOf(Route.Root(Tab.Feed), pushed), expanded = true))
            assertFalse(headerTabsShown(listOf(Route.Root(Tab.Feed), pushed), expanded = false))
        }
    }

    @Test fun messagesInTwoPanesKeepsTheRootsHeaderButAThreadFillingTheWindowIsPushed() {
        val thread = listOf(Route.Root(Tab.Messages), Route.Thread("bob"))
        // Expanded: the thread sits in the pane beside the conversations, under the root's header.
        assertTrue(headerTabsShown(thread, expanded = true))
        // Medium: the thread takes the window, a pushed page.
        assertFalse(headerTabsShown(thread, expanded = false))
        // A card opened from the thread takes the whole window, even on an expanded one.
        assertFalse(headerTabsShown(thread + Route.Card("a-walk"), expanded = true))
    }

    @Test fun choosingTheTabShownPopsToItsRootThenScrollsItToTheTop() {
        val stack = mutableListOf<Route>(Route.Root(Tab.Feed), Route.Card("a-walk"), Route.Author("bob"))
        // Off the root: back to it, nothing to scroll yet.
        assertFalse(stack.reselect())
        assertEquals(listOf<Route>(Route.Root(Tab.Feed)), stack)
        // At the root: it stays, and its list goes to the top.
        assertTrue(stack.reselect())
        assertEquals(listOf<Route>(Route.Root(Tab.Feed)), stack)
    }
}
