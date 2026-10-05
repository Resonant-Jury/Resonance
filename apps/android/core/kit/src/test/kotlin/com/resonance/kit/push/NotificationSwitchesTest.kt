package com.resonance.kit.push

import com.resonance.api.models.NotificationSettings
import com.resonance.kit.api.ApiFailure
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Settings → Notifications' switches: read when the section opens, a flip shown at once and sent
 * on its own, undone with a line when it doesn't save — and a quick second flip of the same switch
 * is the one that counts, on the screen and on the server.
 */
class NotificationSwitchesTest {
    private val off = NotificationSettings(picks = false, connectionCards = false)

    @Test fun readsTheSwitchesAndFlipsOneAtOnce() = runBlocking {
        val sent = mutableListOf<Pair<NotificationSwitch, Boolean>>()
        val answer = CompletableDeferred<Unit>()
        val switches = NotificationSwitches(this, { off }) { switch, on ->
            sent += switch to on
            answer.await()
            off.with(switch, on)
        }
        assertNull(switches.state.value.settings)
        switches.load()
        assertEquals(off, switches.state.value.settings)

        val flip = switches.set(NotificationSwitch.Picks, true)
        // Shown before the server answers.
        assertTrue(switches.state.value.settings!!.picks)
        assertFalse(switches.state.value.settings!!.connectionCards)
        answer.complete(Unit)
        withTimeout(5_000) { flip?.join() }
        assertTrue(switches.state.value.settings!!.picks)
        assertFalse(switches.state.value.saveFailed)
        // Only the switch flipped was sent.
        assertEquals(listOf(NotificationSwitch.Picks to true), sent)
    }

    @Test fun aFlipThatDoesntSaveIsUndoneWithALine() = runBlocking {
        val switches = NotificationSwitches(this, { off }) { _, _ -> throw ApiFailure("internal", "HTTP 500", 500) }
        switches.load()
        switches.set(NotificationSwitch.ConnectionCards, true)?.join()
        val state = switches.state.value
        assertEquals(off, state.settings)
        assertTrue(state.saveFailed)

        // The next flip clears the line (it is about that one now).
        switches.set(NotificationSwitch.Picks, true)
        assertFalse(switches.state.value.saveFailed)
    }

    @Test fun aFailedFlipGoesBackToWhatTheServerLastSaid() = runBlocking {
        var fail = false
        val switches = NotificationSwitches(this, { off }) { switch, on ->
            if (fail) throw IOException("offline")
            off.with(switch, on)
        }
        switches.load()
        switches.set(NotificationSwitch.Picks, true)?.join()
        fail = true
        switches.set(NotificationSwitch.Picks, false)?.join()
        // Saved on, then the "off" failed: it is on, as the server has it.
        assertTrue(switches.state.value.settings!!.picks)
        assertTrue(switches.state.value.saveFailed)
    }

    @Test fun aQuickSecondFlipIsTheOneThatCounts() = runBlocking {
        val sent = mutableListOf<Pair<NotificationSwitch, Boolean>>()
        val started = CompletableDeferred<Unit>()
        val first = CompletableDeferred<Unit>()
        var stored = off
        val switches = NotificationSwitches(this, { off }) { switch, on ->
            sent += switch to on
            if (sent.size == 1) {
                started.complete(Unit)
                first.await()
            }
            stored = stored.with(switch, on)
            stored
        }
        switches.load()
        // On, off, on again while the first is still on its way.
        switches.set(NotificationSwitch.Picks, true)
        withTimeout(5_000) { started.await() }
        switches.set(NotificationSwitch.Picks, false)
        val last = switches.set(NotificationSwitch.Picks, true)
        assertTrue(switches.state.value.settings!!.picks)
        first.complete(Unit)
        withTimeout(5_000) { last?.join() }
        // One write at a time, in order; the "off" was overtaken before its turn and never went out.
        assertEquals(listOf(NotificationSwitch.Picks to true, NotificationSwitch.Picks to true), sent)
        assertTrue(switches.state.value.settings!!.picks)
        assertTrue(stored.picks)
    }

    @Test fun anEarlierFlipsFailureDoesntUndoALaterOne() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val first = CompletableDeferred<Unit>()
        var calls = 0
        val switches = NotificationSwitches(this, { off }) { switch, on ->
            calls++
            if (calls == 1) {
                started.complete(Unit)
                first.await()
                throw IOException("timeout")
            }
            off.with(switch, on)
        }
        switches.load()
        val picks = switches.set(NotificationSwitch.Picks, true)
        withTimeout(5_000) { started.await() }
        // The other switch, flipped while the first is in flight, waits its turn and saves.
        val cards = switches.set(NotificationSwitch.ConnectionCards, true)
        first.complete(Unit)
        withTimeout(5_000) {
            picks?.join()
            cards?.join()
        }
        val shown = switches.state.value
        assertEquals(2, calls)
        // The failed one went back; the other stayed on, though the failure came while it waited.
        assertFalse(shown.settings!!.picks)
        assertTrue(shown.settings!!.connectionCards)
        assertTrue(shown.saveFailed)
    }

    @Test fun nothingFlipsBeforeTheSwitchesAreRead() = runBlocking {
        var sent = 0
        val switches = NotificationSwitches(this, { throw IOException("offline") }) { switch, on ->
            sent++
            off.with(switch, on)
        }
        switches.load()
        assertTrue(switches.state.value.loadFailed)
        assertNull(switches.set(NotificationSwitch.Picks, true))
        assertEquals(0, sent)
        assertNull(switches.state.value.settings)
    }

    @Test fun aRetriedReadClearsTheFailure() = runBlocking {
        var fail = true
        val switches = NotificationSwitches(this, { if (fail) throw IOException("offline") else off.copy(picks = true) }) { switch, on ->
            off.with(switch, on)
        }
        switches.load()
        assertTrue(switches.state.value.loadFailed)
        fail = false
        switches.load()
        assertFalse(switches.state.value.loadFailed)
        assertTrue(switches.state.value.settings!!.picks)
    }
}
