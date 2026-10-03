package com.resonance.kit.chat

import com.resonance.kit.api.ApiFailure
import com.resonance.kit.chat.Outbox.Outgoing
import com.resonance.kit.chat.Outbox.Status
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout
import java.io.IOException
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Sending never holds the composer: messages queue at once and go out in order, one at a time,
 * under client ids that make a resend harmless; a failure keeps its place and its id for the retry.
 */
class OutboxTest {
    private fun out(text: String, id: String = "id-$text") = Outgoing(id, "alice", text, null, null, null, Date(1_000))

    private suspend fun Outbox.until(check: (List<Outgoing>) -> Boolean) = withTimeout(5_000) { entries.first(check) }
    private fun List<Outgoing>.statuses() = map { it.clientId to it.status }

    @Test fun messagesGoOutInOrderOneAtATime() = runBlocking {
        val sent = mutableListOf<String>()
        var inFlight = 0
        var most = 0
        val gates = mapOf("a" to CompletableDeferred<Unit>(), "b" to CompletableDeferred(), "c" to CompletableDeferred())
        val box = Outbox(this, { m ->
            inFlight++
            most = maxOf(most, inFlight)
            gates.getValue(m.text).await()
            sent += m.clientId
            inFlight--
            "doc-${m.text}"
        })
        // Typed and sent back to back, the first still on its way.
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        box.enqueue(out("c"))
        assertEquals(listOf(Status.Queued, Status.Queued, Status.Queued), box.entries.value.map { it.status })
        box.until { it.first().status == Status.Sending }
        assertEquals(listOf(Status.Sending, Status.Queued, Status.Queued), box.entries.value.map { it.status })

        gates.getValue("a").complete(Unit)
        box.until { it.first().status == Status.Sent && it[1].status == Status.Sending }
        gates.getValue("b").complete(Unit)
        gates.getValue("c").complete(Unit)
        box.until { list -> list.all { it.status == Status.Sent } }

        assertEquals(listOf("id-a", "id-b", "id-c"), sent)
        assertEquals(1, most)
        assertEquals(listOf("doc-a", "doc-b", "doc-c"), box.entries.value.map { it.serverId })
        box.clear()
    }

    @Test fun aSentMessageStaysUntilTheConversationShowsIt() = runBlocking {
        val box = Outbox(this, { "doc" })
        box.enqueue(out("a"))
        box.until { it.single().status == Status.Sent }
        // The server answered; the document hasn't reached the listener yet.
        assertEquals(1, box.entries.value.size)
        box.reconcile { it.serverId == "other" }
        assertEquals(1, box.entries.value.size)
        box.reconcile { it.serverId == "doc" }
        assertEquals(emptyList(), box.entries.value)
        box.clear()
    }

    @Test fun theMessagesToSendAreWhatTheComposerHeld() = runBlocking {
        val seen = mutableListOf<Outgoing>()
        val box = Outbox(this, { seen += it; "d" })
        val reply = ReplyQuote("m0", "bob", "shall we?")
        box.enqueue(out("a").copy(cardRef = "walk", replyTo = reply))
        box.until { it.single().status == Status.Sent }
        assertEquals("walk", seen.single().cardRef)
        assertEquals(reply, seen.single().replyTo)
        // On the thread it draws as a delivered message that can't be answered yet.
        val drawn = box.entries.value.single().toMessage()
        assertEquals(Delivery.Sent, drawn.delivery)
        assertEquals(reply, drawn.replyTo)
        assertEquals("id-a", drawn.id)
        assertFalse(drawn.canReply)
        box.clear()
    }

    @Test fun aFailureThatWillPassStopsTheLineAndARetryKeepsTheOrderAndTheIds() = runBlocking {
        var offline = true
        val tries = mutableListOf<String>()
        val box = Outbox(this, { m ->
            tries += m.clientId
            if (offline) throw IOException("offline")
            "doc-${m.clientId}"
        })
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        box.until { list -> list.all { it.status == Status.Failed } }
        // The second never tried to overtake the first.
        assertEquals(listOf("id-a"), tries)

        // Another written while offline waits behind them and fails the same way.
        box.enqueue(out("c"))
        box.until { list -> list.size == 3 && list.all { it.status == Status.Failed } }
        assertEquals(listOf("id-a", "id-c"), tries)

        offline = false
        tries.clear()
        box.retryFailed()
        box.until { list -> list.all { it.status == Status.Sent } }
        // Back in the order they were written, with the ids they were written under.
        assertEquals(listOf("id-a", "id-b", "id-c"), tries)
        assertEquals(listOf("doc-id-a", "doc-id-b", "doc-id-c"), box.entries.value.map { it.serverId })
        box.clear()
    }

    @Test fun retryingOneMessageSendsTheOnesThatStoppedBeforeItFirstAndLeavesTheLaterOnesAlone() = runBlocking {
        var offline = true
        val tries = mutableListOf<String>()
        val box = Outbox(this, { m ->
            tries += m.clientId
            if (offline) throw IOException("offline")
            "doc-${m.clientId}"
        })
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        box.enqueue(out("c"))
        box.until { list -> list.all { it.status == Status.Failed } }
        offline = false
        tries.clear()

        // "b" can't overtake "a", which the same outage stopped; "c" waits for its own retry.
        box.retry("id-b")
        box.until { it[0].status == Status.Sent && it[1].status == Status.Sent }
        assertEquals(listOf("id-a", "id-b"), tries)
        assertEquals(listOf(Status.Sent, Status.Sent, Status.Failed), box.entries.value.map { it.status })

        box.retry("id-c")
        box.until { list -> list.all { it.status == Status.Sent } }
        assertEquals(listOf("id-a", "id-b", "id-c"), tries)
        box.clear()
    }

    @Test fun retryingTheFirstMessageLeavesTheOnesBehindIt() = runBlocking {
        var offline = true
        val box = Outbox(this, { m -> if (offline) throw IOException("offline") else "doc-${m.clientId}" })
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        box.until { list -> list.all { it.status == Status.Failed } }
        offline = false
        box.retry("id-a")
        box.until { it.first().status == Status.Sent }
        assertEquals(listOf(Status.Sent, Status.Failed), box.entries.value.map { it.status })
        // Only a failed message can be retried: this one is on its way already, that one isn't here.
        box.retry("id-a")
        box.retry("nobody")
        assertEquals(listOf(Status.Sent, Status.Failed), box.entries.value.map { it.status })
        box.clear()
    }

    @Test fun aRefusedMessageIsNoReasonToSendTheLaterRetryAgain() = runBlocking {
        var refuse = true
        val tries = mutableListOf<String>()
        val box = Outbox(this, { m ->
            tries += m.clientId
            if (m.text == "bad" && refuse) throw ApiFailure("blocked", "no", 403)
            if (m.text == "b" && refuse) throw IOException("offline")
            "doc-${m.clientId}"
        })
        box.enqueue(out("bad"))
        box.enqueue(out("b"))
        box.until { list -> list.all { it.status == Status.Failed } }
        refuse = false
        tries.clear()
        // "b" failed on its own account; the refused one before it isn't sent along.
        box.retry("id-b")
        box.until { it[1].status == Status.Sent }
        assertEquals(listOf("id-b"), tries)
        assertEquals(Status.Failed, box.entries.value[0].status)
        // Its own retry goes through as the server now allows it.
        box.retry("id-bad")
        box.until { list -> list.all { it.status == Status.Sent } }
        box.clear()
    }

    @Test fun aRefusalOfOneMessageDoesntStopTheOthers() = runBlocking {
        val box = Outbox(this, { m ->
            if (m.text == "bad") throw ApiFailure("invalid_request", "No such message to reply to.", 400)
            "doc-${m.text}"
        })
        box.enqueue(out("a"))
        box.enqueue(out("bad"))
        box.enqueue(out("c"))
        box.until { list -> list.none { it.status == Status.Queued || it.status == Status.Sending } }
        assertEquals(listOf("id-a" to Status.Sent, "id-bad" to Status.Failed, "id-c" to Status.Sent), box.entries.value.statuses())
        box.clear()
    }

    @Test fun whatTheServerSaysNoToAndWhatWillPass() {
        assertTrue(Outbox.refusedByServer(ApiFailure("blocked", "no", 403)))
        assertTrue(Outbox.refusedByServer(ApiFailure("invalid_request", "no", 400)))
        assertTrue(Outbox.refusedByServer(ApiFailure("not_found", "no", 404)))
        assertFalse(Outbox.refusedByServer(ApiFailure("rate_limited", "later", 429)))
        assertFalse(Outbox.refusedByServer(ApiFailure("unauthenticated", "sign in", 401)))
        assertFalse(Outbox.refusedByServer(ApiFailure("internal", "oops", 500)))
        assertFalse(Outbox.refusedByServer(ApiFailure("unexpected", "?", null)))
        assertFalse(Outbox.refusedByServer(IOException("offline")))
    }

    @Test fun onlyAFailedMessageCanBeDiscarded() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val box = Outbox(this, { m -> if (m.text == "bad") throw ApiFailure("blocked", "no", 403) else { gate.await(); "doc" } })
        box.enqueue(out("bad"))
        box.enqueue(out("a"))
        box.until { it.first().status == Status.Failed && it[1].status == Status.Sending }
        box.discard("id-a")
        assertEquals(2, box.entries.value.size)
        box.discard("id-bad")
        assertEquals(listOf("id-a"), box.entries.value.map { it.clientId })
        gate.complete(Unit)
        box.until { it.single().status == Status.Sent }
        box.clear()
    }

    @Test fun aMessageTheConversationAlreadyShowsDropsOutEvenIfItsAnswerNeverCame() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val box = Outbox(this, { gate.await(); "doc" })
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        box.until { it.first().status == Status.Sending }
        // The answer to "a" was lost, but its document arrived: it stops being drawn twice.
        box.reconcile { it.clientId == "id-a" }
        assertEquals(listOf("id-b"), box.entries.value.map { it.clientId })
        gate.complete(Unit)
        // "b" still goes out; the finished "a" finds nothing to update and does no harm.
        box.until { list -> list.single().status == Status.Sent }
        box.clear()
    }

    @Test fun clientIdsAreTwentyLettersAndDigits() {
        val ids = List(50) { Outbox.newClientId() }
        assertTrue(ids.all { it.length == 20 && it.all { c -> c.isLetterOrDigit() && c.code < 128 } })
        assertEquals(50, ids.toSet().size)
        assertNotEquals(ids[0], ids[1])
        assertTrue(ids.all { Regex("^[A-Za-z0-9_-]{16,64}$").matches(it) })
    }

    @Test fun clearForgetsEverythingAndStopsSending() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val box = Outbox(this, { gate.await(); "doc" })
        box.enqueue(out("a"))
        box.until { it.single().status == Status.Sending }
        box.clear()
        assertEquals(emptyList(), box.entries.value)
        // A message written after it goes out as usual.
        gate.complete(Unit)
        box.enqueue(out("b"))
        box.until { it.single().status == Status.Sent }
        assertEquals("id-b", box.entries.value.single().clientId)
        box.clear()
    }
}
