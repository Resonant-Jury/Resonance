package com.resonance.app.ui

import com.resonance.kit.api.MessagingApi
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * A tapped push (or a link) for the conversation already on top of Messages
 * leaves it where it is instead of stacking the same thread twice; a push
 * that names its sender opens their conversation by uid.
 */
class ThreadRoutesTest {
    private val root = Route.Root(Tab.Messages)

    @Test fun aPushForTheThreadOnTopKeepsIt() {
        val stack = mutableListOf<Route>(root, Route.Thread("alice", uid = "a1"))
        openThread(stack, Route.Thread("alice"))
        openThread(stack, Route.Thread("ALICE"))
        openThread(stack, Route.Thread("alice", uid = "a1"))
        assertEquals(listOf(root, Route.Thread("alice", uid = "a1")), stack)
    }

    @Test fun anotherPersonsThreadIsPushed() {
        val stack = mutableListOf<Route>(root, Route.Thread("alice", uid = "a1"))
        openThread(stack, Route.Thread("bob", uid = "b1"))
        assertEquals(Route.Thread("bob", uid = "b1"), stack.last())
        assertEquals(3, stack.size)
    }

    @Test fun theUidDecidesWhenBothKnowIt() {
        // Renamed: the old pen name in an older push is still the same person…
        val stack = mutableListOf<Route>(root, Route.Thread("alice-new", uid = "a1"))
        openThread(stack, Route.Thread("alice-old", uid = "a1"))
        assertEquals(2, stack.size)
        // …and someone who took a pen name over is someone else.
        openThread(stack, Route.Thread("alice-new", uid = "c1"))
        assertEquals(3, stack.size)
    }

    @Test fun aNoteToQuoteTakesThePlaceOfTheThreadOnTop() {
        val stack = mutableListOf<Route>(root, Route.Thread("alice", uid = "a1"))
        openThread(stack, Route.Thread("alice", "card1", "note1"))
        assertEquals(listOf(root, Route.Thread("alice", "card1", "note1", uid = "a1")), stack)
        assertEquals(MessagingApi.Note("card1", "note1"), (stack.last() as Route.Thread).note)
    }

    @Test fun aPushThatNamesItsSenderOpensTheThreadByUid() {
        var asked = false
        val route = pushedRoute(Route.Thread("alice"), "a1") { asked = true; null }
        assertEquals(Route.Thread("alice", uid = "a1"), route)
        // The push said who: the bell list (which may not have the row yet) isn't asked.
        assertEquals(false, asked)
    }

    @Test fun aPushWithoutItsSenderAsksTheBellRowAsBefore() {
        assertEquals(Route.Thread("alice", uid = "a1"), pushedRoute(Route.Thread("alice"), null) { "a1" })
        assertEquals(Route.Thread("alice"), pushedRoute(Route.Thread("alice"), null) { null })
        // Only a conversation takes the sender; another page, or none (the notifications), stays as it is.
        assertEquals(Route.Card("a-walk"), pushedRoute(Route.Card("a-walk"), "a1") { "a1" })
        assertEquals(null, pushedRoute(null, "a1") { "a1" })
    }

    @Test fun aPushFromSomeoneRenamedSinceKeepsTheirThreadOnTop() {
        // The thread is open under their new pen name; the push still carries the old one, and their uid.
        val stack = mutableListOf<Route>(root, Route.Thread("alice-new", uid = "a1"))
        openThread(stack, pushedRoute(Route.Thread("alice-old"), "a1") { null } as Route.Thread)
        assertEquals(listOf(root, Route.Thread("alice-new", uid = "a1")), stack)
    }

    @Test fun aThreadUnderAnotherScreenIsOpenedAgainOnTop() {
        val stack = mutableListOf(root, Route.Thread("alice", uid = "a1"), Route.Author("alice"))
        openThread(stack, Route.Thread("alice"))
        assertEquals(Route.Thread("alice"), stack.last())
    }
}
