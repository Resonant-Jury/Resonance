package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Messages stack on an expanded window (design note §9): one navigation state, drawn as the
 * conversations beside a thread pane — the same routes a phone stacks, so rotating or folding
 * never loses place. A card's page, the writer or the map take the whole content area instead.
 */
class MessagesPanesTest {
    private val root = Route.Root(Tab.Messages)
    private val ben = Route.Thread("ben", uid = "b1")
    private val cyd = Route.Thread("cyd", uid = "c1")

    @Test fun theConversationsAndWhatIsPushedOverAThreadDrawAsPanes() {
        assertTrue(drawsAsPanes(listOf(root)))
        assertTrue(drawsAsPanes(listOf(root, ben)))
        assertTrue(drawsAsPanes(listOf(root, ben, Route.Author("ben"))))
    }

    @Test fun aCardTheWriterOrTheMapTakeTheWholeWindow() {
        assertFalse(drawsAsPanes(listOf(root, ben, Route.Card("a-walk"))))
        assertFalse(drawsAsPanes(listOf(root, ben, Route.Write(referenceCardId = "c1"))))
        assertFalse(drawsAsPanes(listOf(root, Route.ThoughtMap)))
        // Another tab's stack is never drawn so.
        assertFalse(drawsAsPanes(listOf(Route.Root(Tab.Feed), ben)))
    }

    @Test fun choosingAConversationReplacesWhatThePaneShowed() {
        val stack = mutableListOf<Route>(root, ben, Route.Author("ben"))
        stack.chooseInPane(cyd)
        assertEquals(listOf(root, cyd), stack)
        stack.chooseInPane(ben)
        assertEquals(listOf(root, ben), stack)
    }
}
