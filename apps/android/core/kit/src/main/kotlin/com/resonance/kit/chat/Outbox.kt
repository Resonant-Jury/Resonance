package com.resonance.kit.chat

import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.MessagingApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.security.SecureRandom
import java.util.Date

/**
 * A conversation's messages on their way out, so that sending never holds the composer: a message
 * is queued the moment it is written and the field is free again. One worker sends the queue in
 * order, one at a time, each under its own client id (which the server makes the message's
 * document id, so sending it again after a lost answer finds the message instead of writing a
 * second one).
 *
 * A message is [Status.Queued], [Status.Sending] (in flight), [Status.Sent] (the server took it —
 * it stays until the conversation's listener shows the document, see [reconcile]) or
 * [Status.Failed]. A failure that the network or the server's trouble caused (offline, a timeout,
 * a 5xx, too many requests) stops the line: everything queued behind it fails with it, so nothing
 * overtakes it; [retry] of one of them sends it after the ones written before it that stopped
 * with it, and [retryFailed] puts them all back in their order. A refusal of the message itself
 * (a 4xx: blocked, no such message to reply to) fails only that message — the others don't
 * depend on it, nor does its retry depend on them.
 *
 * It belongs to the conversation, not to the screen: the app keeps one per conversation for as
 * long as the person is signed in, so a send carries on while the thread is rotated, covered by a
 * profile or left, and a failure is still there to retry when they come back. Used on one thread
 * (the main one); [deliver] does the sending.
 */
class Outbox(
    private val scope: CoroutineScope,
    /** Sends one message; returns the document id the server gave it. Throws on failure. */
    private val deliver: suspend (Outgoing) -> String,
    private val isRefusal: (Throwable) -> Boolean = ::refusedByServer,
) {
    enum class Status { Queued, Sending, Sent, Failed }

    /** A message from this person: what the composer held when they sent it. */
    data class Outgoing(
        val clientId: String,
        val senderId: String,
        val text: String,
        val cardRef: String?,
        val noteRef: MessagingApi.Note?,
        /** The message it answers; the server makes its own snapshot of it. */
        val replyTo: ReplyQuote?,
        val queuedAt: Date,
        val status: Status = Status.Queued,
        /** The document id the server answered with (once [Status.Sent]); the clientId, from a server that uses it. */
        val serverId: String? = null,
        /** [Status.Failed] because the server said no to this message itself, not because the line stopped. */
        val refused: Boolean = false,
    ) {
        /** The message as the thread draws it while it is on its way. */
        fun toMessage() = ChatMessage(
            id = clientId, senderId = senderId, text = text, sentAt = queuedAt, cardRef = cardRef, noteRef = noteRef, replyTo = replyTo,
            delivery = when (status) {
                Status.Queued, Status.Sending -> Delivery.Sending
                Status.Sent -> Delivery.Sent
                Status.Failed -> Delivery.Failed
            },
        )

        /** Whether the conversation's own document of this message is in [history]. */
        fun isIn(history: MessageHistory<*>): Boolean = clientId in history || (serverId != null && serverId in history)
    }

    private val _entries = MutableStateFlow<List<Outgoing>>(emptyList())
    /** Every message not yet shown by the conversation, in the order they were written. */
    val entries: StateFlow<List<Outgoing>> = _entries

    private var worker: Job? = null

    /**
     * Queues [message] (its status is set to Queued) and starts sending if no send is under way.
     * Messages that failed with the line (offline, a server hiccup — not refused on their own account)
     * go back in the queue ahead of it: writing again is the moment to try, and a new message must
     * never reach the other person before the ones written earlier.
     */
    fun enqueue(message: Outgoing) {
        _entries.value = _entries.value.map { if (it.status == Status.Failed && !it.refused) it.copy(status = Status.Queued) else it } +
            message.copy(status = Status.Queued, serverId = null, refused = false)
        wake()
    }

    /** Puts every failed message back in the queue, in the order they were written. */
    fun retryFailed() = requeue { true }

    /**
     * Sends the failed message [clientId] again, under the id it was written under. The ones written
     * before it that failed with the line (not on their own account) go first, so a retry never
     * overtakes a message the person wrote earlier; the ones written after it wait for their own retry.
     */
    fun retry(clientId: String) {
        val at = _entries.value.indexOfFirst { it.clientId == clientId && it.status == Status.Failed }
        if (at < 0) return
        val ahead = _entries.value.take(at).map { it.clientId }.toSet()
        requeue { (it.clientId in ahead && !it.refused) || it.clientId == clientId }
    }

    private fun requeue(which: (Outgoing) -> Boolean) {
        val now = _entries.value
        if (now.none { it.status == Status.Failed && which(it) }) return
        _entries.value = now.map { if (it.status == Status.Failed && which(it)) it.copy(status = Status.Queued, refused = false) else it }
        wake()
    }

    /** Drops a message that failed (the person chose to delete it). A message still sending can't be taken back. */
    fun discard(clientId: String) {
        _entries.value = _entries.value.filterNot { it.clientId == clientId && it.status == Status.Failed }
    }

    /**
     * Forgets the messages the conversation now shows ([shown]): their document replaced them. Any
     * status — a message whose answer was lost can have arrived all the same.
     */
    fun reconcile(shown: (Outgoing) -> Boolean) {
        val now = _entries.value
        val left = now.filterNot(shown)
        if (left.size != now.size) _entries.value = left
    }

    /** Everything goes: another account signed in, or the conversation was deleted. */
    fun clear() {
        worker?.cancel()
        worker = null
        _entries.value = emptyList()
    }

    private fun wake() {
        if (worker?.isActive == true) return
        worker = scope.launch { drain() }
    }

    private suspend fun drain() {
        while (true) {
            val next = _entries.value.firstOrNull { it.status == Status.Queued } ?: return
            update(next.clientId) { it.copy(status = Status.Sending) }
            try {
                val id = deliver(next)
                update(next.clientId) { it.copy(status = Status.Sent, serverId = id) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (isRefusal(e)) update(next.clientId) { it.copy(status = Status.Failed, refused = true) } else stopTheLine(next.clientId)
            }
        }
    }

    /** [from] failed for a reason that will pass: it and everything queued behind it fail, so the order holds on retry. */
    private fun stopTheLine(from: String) {
        var behind = false
        _entries.value = _entries.value.map {
            if (it.clientId == from) behind = true
            if (behind && (it.status == Status.Queued || it.status == Status.Sending)) it.copy(status = Status.Failed) else it
        }
    }

    /** A message may have left the list meanwhile (reconciled), so this is a no-op for one that is gone. */
    private fun update(clientId: String, change: (Outgoing) -> Outgoing) {
        _entries.value = _entries.value.map { if (it.clientId == clientId) change(it) else it }
    }

    companion object {
        private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        private val random = SecureRandom()

        /** A client id: 20 characters of [A-Za-z0-9] (the contract takes 16–64 of `[A-Za-z0-9_-]`). */
        fun newClientId(): String = String(CharArray(20) { ALPHABET[random.nextInt(ALPHABET.length)] })

        /**
         * The server answered and said no to this message itself (a 4xx other than "signed out",
         * "timed out" and "too many"), as opposed to a failure that will pass.
         */
        fun refusedByServer(e: Throwable): Boolean {
            val status = (e as? ApiFailure)?.status ?: return false
            return status in 400..499 && status != 401 && status != 408 && status != 429
        }
    }
}
