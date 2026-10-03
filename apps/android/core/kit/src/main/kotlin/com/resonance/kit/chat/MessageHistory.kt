package com.resonance.kit.chat

/**
 * Every message of a conversation the thread has so far, oldest first (by send time, then id).
 *
 * Two things feed it: the live window — the newest [liveLimit] messages, which a listener keeps
 * current — and older pages read one at a time. The window only ever adds to what is held: a message
 * that slides out of it (a newer one pushed it past the limit) stays, so the thread keeps what the
 * person has scrolled through. [C] is whatever the next older page starts after (a Firestore
 * document snapshot); the history only remembers the one that belongs to its oldest message.
 *
 * Used on one thread (the main one), where Firestore calls its listeners.
 */
class MessageHistory<C : Any>(private val liveLimit: Int = LIVE_LIMIT) {
    /** A message with the cursor that starts the page before it. */
    class Entry<C : Any>(val message: ChatMessage, val cursor: C)

    private val byId = HashMap<String, ChatMessage>()
    private var oldest: ChatMessage? = null
    /** Whether an older page has been read since the history was last started afresh. */
    private var paged = false

    /** All messages held, oldest first. A new list whenever something changed. */
    var messages: List<ChatMessage> = emptyList()
        private set

    /** Where the page before the oldest message held starts; null while the history is empty. */
    var oldestCursor: C? = null
        private set

    /**
     * Whether there may be messages older than the oldest held. True while that isn't known (only
     * a cached window has arrived); false once a window shorter than the limit came from the
     * server (it holds the whole conversation) or a page came back short.
     */
    var hasOlder: Boolean = false
        private set

    val size: Int get() = byId.size
    operator fun contains(id: String): Boolean = id in byId
    operator fun get(id: String): ChatMessage? = byId[id]

    /** What a window changed. */
    enum class Merged {
        Unchanged,
        Changed,
        /** The window shared nothing with what was held (the listener was away long enough for the thread to move on past it): the history started afresh from it. */
        Restarted,
    }

    /**
     * The live window arrived (in any order). [authoritative]: it came from the server, so a window
     * shorter than the limit is the whole conversation; a cached one may be only a part of it.
     */
    fun mergeWindow(window: List<Entry<C>>, authoritative: Boolean = true): Merged {
        var restarted = false
        if (byId.isNotEmpty() && window.none { it.message.id in byId }) {
            clear()
            restarted = true
        }
        val changed = upsert(window)
        if (!paged) hasOlder = window.size >= liveLimit || !authoritative
        return if (restarted) Merged.Restarted else if (changed) Merged.Changed else Merged.Unchanged
    }

    /** An older page of at most [limit] messages arrived: a shorter one was the last. Returns whether anything new came in. */
    fun mergePage(page: List<Entry<C>>, limit: Int): Boolean {
        paged = true
        hasOlder = page.size >= limit
        return upsert(page)
    }

    /** Forgets everything (the conversation is gone, or the listener lost track of it). */
    fun clear() {
        byId.clear()
        messages = emptyList()
        oldest = null
        oldestCursor = null
        hasOlder = false
        paged = false
    }

    private fun upsert(entries: List<Entry<C>>): Boolean {
        var changed = false
        for (entry in entries) {
            val message = entry.message
            if (byId.put(message.id, message) != message) changed = true
            val current = oldest
            // The oldest message's cursor is refreshed when its document comes again (an updated snapshot).
            if (current == null || current.id == message.id || ORDER.compare(message, current) < 0) {
                oldest = message
                oldestCursor = entry.cursor
            }
        }
        if (changed) messages = byId.values.sortedWith(ORDER)
        return changed
    }

    companion object {
        /** The live window's size. */
        const val LIVE_LIMIT = 50
        /** Oldest first: send time, then id. */
        val ORDER: Comparator<ChatMessage> = compareBy<ChatMessage>({ it.sentAt }, { it.id })
    }
}
