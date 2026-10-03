package com.resonance.kit.chat

/**
 * What a thread draws: the conversation's [MessageHistory] (oldest first), then this person's own
 * messages still on their way ([Outbox.Outgoing], in the order they were written).
 *
 * A message sent from here is drawn the moment it is sent, under a [ChatMessage.key] — its client
 * id — that the document keeps when it arrives, so the row is replaced in place instead of
 * jumping: the server makes the client id the document's id, and where an older server gave
 * the document another id, the answer to the send ([Outbox.Outgoing.serverId]) tells which
 * document is whose and the key is carried over to it from then on.
 *
 * Used on one thread (the main one).
 */
class ThreadMessages {
    /** Document id → the key it is drawn under, for the messages sent from here whose document has an id of its own. */
    private val keys = HashMap<String, String>()

    /** The thread's messages: all of [history], then the ones of [onItsWay] whose document isn't in it yet. */
    fun build(history: MessageHistory<*>, onItsWay: List<Outbox.Outgoing>): List<ChatMessage> {
        for (m in onItsWay) {
            val id = m.serverId
            if (id != null && id != m.clientId) keys[id] = m.clientId
        }
        val held = history.messages
        val delivered = if (keys.isEmpty()) held else held.map { m -> keys[m.id]?.let { m.copy(key = it) } ?: m }
        val pending = onItsWay.filterNot { it.isIn(history) }.map { it.toMessage() }
        return if (pending.isEmpty()) delivered else delivered + pending
    }

    /** The conversation is gone or started afresh: nothing is carried over. */
    fun clear() {
        keys.clear()
    }
}
