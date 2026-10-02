package com.resonance.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A passing failure — offline, a timeout, the backend busy — never stands for "gone": a listener
 * that failed listens again when the app comes back (no loader forever on the notifications). The
 * twin of iOS's LiveDataTests (which also pins which Firestore codes mean gone: Firestore's error
 * codes need Android's runtime to load).
 */
class LiveListenersTest {
    private val attached = mutableListOf<String>()
    private val detached = mutableListOf<String>()

    private fun LiveListeners.listen(name: String) = add(name) {
        attached += name
        return@add { detached += name }
    }

    @Test fun aFailedListenerListensAgainWhenResumed() {
        val listeners = LiveListeners()
        listeners.listen("notifications")
        listeners.listen("blocks")
        assertEquals(listOf("notifications", "blocks"), attached)

        listeners.fail("notifications")
        assertEquals(listOf("notifications"), detached)
        assertEquals(setOf("notifications"), listeners.failed.value)

        // Back in the foreground: only the failed one is attached again.
        assertTrue(listeners.resume())
        assertEquals(listOf("notifications", "blocks", "notifications"), attached)
        assertTrue(listeners.failed.value.isEmpty())
        // Nothing failed since: nothing to do.
        assertFalse(listeners.resume())
        assertEquals(3, attached.size)

        // Stopped (signed out): every listener goes, and a late failure brings nothing back.
        listeners.removeAll()
        assertEquals(setOf("notifications", "blocks"), detached.toSet())
        assertEquals(3, detached.size)
        listeners.fail("blocks")
        assertFalse(listeners.resume())
        assertEquals(3, attached.size)
    }
}
