package com.resonance.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.setValue
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.resonance.api.models.Author
import com.resonance.api.models.CardDetail
import com.resonance.app.AppFirebase
import com.resonance.app.Session
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.Date

/**
 * One conversation (ThreadView.tsx): who it's with, whether you may write, the
 * newest 50 messages live, and sending through the API. The conversation
 * exists only after its first message, so its listeners start then. The twin
 * of iOS's ThreadModel.
 */
class ThreadModel(val handle: String, noteRef: MessagingApi.Note?, private val session: Session) {
    data class Message(
        val id: String,
        val senderId: String,
        val text: String,
        val sentAt: Date,
        val cardRef: String?,
        val noteRef: MessagingApi.Note?,
    )

    /** A card waiting to go with the next message: what the chip shows and what is sent. */
    data class Attachment(val id: String, val title: String)

    enum class Phase { Loading, Missing, Ready }

    var phase by mutableStateOf(Phase.Loading)
        private set
    var other by mutableStateOf<Author?>(null)
        private set
    /** Whether you may write (connected, no block). Null until known — the composer shows meanwhile. */
    var connected by mutableStateOf<Boolean?>(null)
        private set
    var isBlocked by mutableStateOf(false)
        private set
    var conversationExists by mutableStateOf(false)
        private set
    var messages by mutableStateOf<List<Message>>(emptyList())
        private set
    /** The first snapshot of messages has arrived (or there is no conversation yet). */
    var threadReady by mutableStateOf(false)
        private set
    /** Shared cards, as the viewer may see them (a null value: not visible to them — drawn as nothing). */
    val cards = mutableStateMapOf<String, CardDetail?>()

    var draft by mutableStateOf("")
    var pendingCard by mutableStateOf<Attachment?>(null)
    var noteRef by mutableStateOf(noteRef)
    var sending by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)

    private var listeners: List<ListenerRegistration> = emptyList()
    private var unreadForMe = 0
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val me: String? get() = session.uid
    val pairId: String?
        get() {
            val me = me ?: return null
            val other = other ?: return null
            return listOf(me, other.id).sorted().joinToString("_")
        }

    /** ThreadView's `valid`: text or a card, within 2000, somewhere to send it. */
    val canSend: Boolean
        get() {
            val trimmed = draft.trim()
            return (trimmed.isNotEmpty() || pendingCard != null) && trimmed.length <= NOTE_MAX_LENGTH && pairId != null && !sending
        }

    suspend fun load() {
        try {
            val profile = session.reading.profile(handle)
            if (profile.isSelf) {
                phase = Phase.Missing
                return
            }
            other = profile.author
            isBlocked = profile.isBlocked
            connected = profile.isConnected && !profile.isBlocked
            phase = Phase.Ready
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            phase = Phase.Missing
            return
        }
        openConversation()
    }

    /** Re-reads whether you may still write (after a block, or coming back). */
    suspend fun refreshConnection() {
        val profile = try {
            session.reading.profile(handle)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return
        }
        isBlocked = profile.isBlocked
        connected = profile.isConnected && !profile.isBlocked
    }

    /** Listens once the conversation exists: reading a missing one is refused. */
    private suspend fun openConversation() {
        val pair = pairId ?: return
        if (listeners.isNotEmpty()) return
        val ref = AppFirebase.db.collection("conversations").document(pair)
        val snap = try {
            ref.get().await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null // A denied read of a conversation that isn't there yet.
        }
        if (snap == null || !snap.exists()) {
            threadReady = true
            return
        }
        conversationExists = true
        listeners = listOf(
            ref.addSnapshotListener { doc, _ ->
                if (doc == null || !doc.exists()) return@addSnapshotListener
                unreadForMe = ((doc.get("unread") as? Map<*, *>)?.get(me ?: "") as? Number)?.toInt() ?: 0
                markReadIfNeeded()
            },
            ref.collection("messages").orderBy("sentAt", Query.Direction.DESCENDING).limit(50)
                .addSnapshotListener { docs, _ ->
                    docs ?: return@addSnapshotListener
                    // A pending server time (our own message, in flight) sorts last.
                    messages = docs.documents.map { message(it) }.reversed()
                    threadReady = true
                    markReadIfNeeded()
                    loadCards()
                },
        )
    }

    /** Stops listening (the screen is going away, or the conversation is being deleted). */
    fun stop() {
        listeners.forEach { it.remove() }
        listeners = emptyList()
    }

    /** The screen is gone: listeners and card lookups stop. */
    fun close() {
        stop()
        scope.cancel()
    }

    /** Opening a thread reads it: the unread count says whether it needs resetting. */
    private fun markReadIfNeeded() {
        val pair = pairId ?: return
        val me = me ?: return
        if (unreadForMe <= 0) return
        AppFirebase.db.collection("conversations").document(pair).update("unread.$me", 0)
    }

    private fun loadCards() {
        for (id in messages.mapNotNull { it.cardRef }.toSet()) {
            if (cards.containsKey(id)) continue
            cards[id] = null
            scope.launch {
                cards[id] = try {
                    session.reading.card(id)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    null
                }
            }
        }
    }

    suspend fun send() {
        val other = other ?: return
        if (!canSend) return
        sending = true
        error = null
        try {
            session.messaging.sendMessage(other.id, draft.trim(), pendingCard?.id, noteRef)
            draft = ""
            pendingCard = null
            noteRef = null
            openConversation()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = L10n.Messages.sendError
        } finally {
            sending = false
        }
    }

    /** Deletes the whole conversation, for both people (deleteConversation: messages in batches, then the parent). */
    suspend fun deleteConversation(): Boolean {
        val pair = pairId ?: return false
        val db = AppFirebase.db
        val ref = db.collection("conversations").document(pair)
        return try {
            stop()
            val all = ref.collection("messages").get().await().documents
            for (chunk in all.chunked(450)) {
                val batch = db.batch()
                chunk.forEach { batch.delete(it.reference) }
                batch.commit().await()
            }
            ref.delete().await()
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = L10n.Messages.deleteError
            openConversation()
            false
        }
    }

    // Search and media

    /** Messages matching the search (card-only ones step aside while searching). */
    fun filtered(query: String): List<Message> {
        val q = query.trim().lowercase()
        if (q.isEmpty()) return messages
        return messages.filter { it.text.lowercase().contains(q) }
    }

    /** Cards shared here (in thread order, once each) and links written in messages. */
    val shared: Pair<List<String>, List<String>>
        get() {
            val seenCards = LinkedHashSet<String>()
            val seenLinks = LinkedHashSet<String>()
            for (m in messages) {
                m.cardRef?.let { seenCards.add(it) }
                LINK.findAll(m.text).forEach { seenLinks.add(it.value) }
            }
            return seenCards.toList() to seenLinks.toList()
        }

    private fun message(doc: DocumentSnapshot): Message {
        @Suppress("UNCHECKED_CAST")
        val note = doc.get("noteRef") as? Map<String, Any?>
        val noteCard = note?.get("cardId") as? String
        val noteId = note?.get("noteId") as? String
        return Message(
            id = doc.id,
            senderId = doc.getString("senderId") ?: "",
            text = doc.getString("text") ?: "",
            sentAt = doc.getTimestamp("sentAt", DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)?.toDate() ?: Date(),
            cardRef = doc.getString("cardRef"),
            noteRef = if (noteCard != null && noteId != null) MessagingApi.Note(noteCard, noteId) else null,
        )
    }

    private companion object {
        val LINK = Regex("""https?://[^\s)]+""")
    }
}

/**
 * What the composer holds (the draft, the quoted note, the attached card), kept
 * while the thread is covered by a profile or a card. Navigation composes only
 * the top screen, so without this the person would come back to an empty field;
 * on iOS the covered screen simply stays alive.
 */
internal fun threadSaver(handle: String, session: Session): Saver<ThreadModel, Any> = listSaver(
    save = { m ->
        listOf(m.draft, m.noteRef?.cardId.orEmpty(), m.noteRef?.noteId.orEmpty(), m.pendingCard?.id.orEmpty(), m.pendingCard?.title.orEmpty())
    },
    restore = { v ->
        val note = if (v[1].isNotEmpty() && v[2].isNotEmpty()) MessagingApi.Note(v[1], v[2]) else null
        ThreadModel(handle, note, session).also { m ->
            m.draft = v[0]
            if (v[3].isNotEmpty()) m.pendingCard = ThreadModel.Attachment(v[3], v[4])
        }
    },
)
