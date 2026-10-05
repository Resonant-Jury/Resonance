package com.resonance.kit.chat

/**
 * The client id a note is sent under (the twin of the web composer's `attempt`). Pressing Send
 * makes one; every send of the same words to the same card after that one failed — the writer
 * pressing Send again, or OkHttp resending the same request — goes under the same id, so the
 * server finds a note whose answer was lost instead of leaving it twice (and ringing its author
 * twice, and spending a second of the letter's notes). Other words, or another card, are another
 * note with an id of their own; once a note is left, the next one starts afresh.
 *
 * One per composer; the words are compared trimmed, as they are sent.
 */
class NoteAttempt {
    private data class Attempt(val cardId: String, val text: String, val clientId: String)

    private var current: Attempt? = null

    /** The id to send [text] to [cardId] under: the unfinished attempt's own when these are its words, else a new one. */
    @Synchronized
    fun clientId(cardId: String, text: String): String {
        val words = text.trim()
        current?.takeIf { it.cardId == cardId && it.text == words }?.let { return it.clientId }
        return Outbox.newClientId().also { current = Attempt(cardId, words, it) }
    }

    /** The note sent under [clientId] was left: the next words, even the same ones, are a new note. */
    @Synchronized
    fun sent(clientId: String) {
        if (current?.clientId == clientId) current = null
    }

    /**
     * Sends [text] to [cardId] through [deliver] under the attempt's id. The attempt ends only
     * when [deliver] returns; a failure (or a cancellation, which may have reached the server
     * too) keeps it for the retry.
     */
    suspend fun <T> send(cardId: String, text: String, deliver: suspend (clientId: String) -> T): T {
        val id = clientId(cardId, text)
        return deliver(id).also { sent(id) }
    }
}
