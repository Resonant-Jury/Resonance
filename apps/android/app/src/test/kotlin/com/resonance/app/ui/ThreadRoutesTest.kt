package com.resonance.app.ui

import com.resonance.kit.api.MessagingApi
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * A tapped push (or a link) for the conversation already on top of Messages
 * leaves it where it is instead of stacking the same thread twice.
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

    @Test fun aThreadUnderAnotherScreenIsOpenedAgainOnTop() {
        val stack = mutableListOf(root, Route.Thread("alice", uid = "a1"), Route.Author("alice"))
        openThread(stack, Route.Thread("alice"))
        assertEquals(Route.Thread("alice"), stack.last())
    }
}
