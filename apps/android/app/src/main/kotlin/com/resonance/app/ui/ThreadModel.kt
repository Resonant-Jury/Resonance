package com.resonance.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.setValue
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.resonance.api.models.Author
import com.resonance.api.models.CardDetail
import com.resonance.api.models.Profile
import com.resonance.app.AppFirebase
import com.resonance.app.Person
import com.resonance.app.Session
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.Date

/**
 * One conversation (ThreadView.tsx): who it's with, whether you may write, the
 * newest 50 messages live, and sending through the API. The twin of iOS's
 * ThreadModel.
 *
 * Opened from somewhere that knows the other person's uid (the conversation
 * list, a notification), it listens to the conversation by its pair id at once
 * and reads their profile beside it, only to learn whether you may write; by
 * pen name alone (a link, a push), the profile comes first to find them. A
 * conversation exists only after its first message, and reading one that
 * doesn't is refused: that refusal means "no conversation yet", and the thread
 * then watches for it to appear among the person's conversations — whoever
 * writes first — and listens from then on.
 */
class ThreadModel(val handle: String, uid: String?, noteRef: MessagingApi.Note?, private val session: Session) {
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
    /** The other person's uid: from where the thread was opened, or their profile. */
    var otherId by mutableStateOf(uid)
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
    /** Which [listen] the live listeners belong to (a late callback of a removed one is ignored). */
    private var listening = 0
    /** Refusals met while the conversation list already had it (a creation racing the first read). */
    private var refusals = 0
    private var watching: Job? = null
    private var unreadForMe = 0
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val me: String? get() = session.uid
    val pairId: String?
        get() {
            val me = me ?: return null
            val other = otherId ?: return null
            return listOf(me, other).sorted().joinToString("_")
        }

    /** ThreadView's `valid`: text or a card, within 2000, somewhere to send it. */
    val canSend: Boolean
        get() {
            val trimmed = draft.trim()
            return (trimmed.isNotEmpty() || pendingCard != null) && trimmed.length <= NOTE_MAX_LENGTH && pairId != null && !sending
        }

    suspend fun load() {
        otherId?.let { id ->
            // The conversation list already drew them: the header shows at once, beside the messages.
            session.conversations.person(id)?.let { person ->
                other = person.asAuthor()
                phase = Phase.Ready
            }
            watch()
        }
        val profile = profile()
        if (profile == null || profile.isSelf) {
            // Nobody by that name (or it's you). With their uid and a header to show, a failed read keeps the thread.
            if (profile != null || other == null) {
                close()
                phase = Phase.Missing
            }
            return
        }
        other = profile.author
        otherId = profile.author.id
        isBlocked = profile.isBlocked
        connected = profile.isConnected && !profile.isBlocked
        phase = Phase.Ready
        watch()
    }

    /** Re-reads whether you may still write (after a block, or coming back). */
    suspend fun refreshConnection() {
        val profile = read(other?.handle ?: handle)?.takeIf { p -> otherId.let { it == null || it == p.author.id } } ?: return
        isBlocked = profile.isBlocked
        connected = profile.isConnected && !profile.isBlocked
    }

    /**
     * The other person's profile: by the pen name the route carries — or, when their uid is
     * known and that name isn't theirs any more (renamed since the row or the notification was
     * written), by the one they have now.
     */
    private suspend fun profile(): Profile? {
        val id = otherId ?: return read(handle)
        val name = session.conversations.person(id)?.handle ?: handle
        read(name)?.takeIf { it.author.id == id }?.let { return it }
        val current = try {
            AppFirebase.db.collection("users").document(id).get().await().getString("handle")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        if (current == null || current == name) return null
        return read(current)?.takeIf { it.author.id == id }
    }

    private suspend fun read(handle: String): Profile? = try {
        session.reading.profile(handle)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    /** Listens to the conversation, and watches for it to appear should it not exist yet. */
    private fun watch() {
        val pair = pairId ?: return
        if (watching == null) {
            watching = scope.launch {
                session.conversations.ids.collect { ids -> if (pair in ids && listeners.isEmpty()) listen(pair) }
            }
        }
        if (listeners.isEmpty()) listen(pair)
    }

    private fun listen(pair: String) {
        stop()
        val run = ++listening
        val ref = AppFirebase.db.collection("conversations").document(pair)
        listeners = listOf(
            ref.addSnapshotListener { doc, error ->
                if (run != listening) return@addSnapshotListener
                if (error != null) return@addSnapshotListener refused(pair, error)
                if (doc == null || !doc.exists()) return@addSnapshotListener
                conversationExists = true
                refusals = 0
                unreadForMe = ((doc.get("unread") as? Map<*, *>)?.get(me ?: "") as? Number)?.toInt() ?: 0
                markReadIfNeeded()
            },
            ref.collection("messages").orderBy("sentAt", Query.Direction.DESCENDING).limit(50)
                .addSnapshotListener { docs, error ->
                    if (run != listening) return@addSnapshotListener
                    if (error != null) return@addSnapshotListener refused(pair, error)
                    docs ?: return@addSnapshotListener
                    // A pending server time (our own message, in flight) sorts last.
                    messages = docs.documents.map { message(it) }.reversed()
                    threadReady = true
                    markReadIfNeeded()
                    loadCards()
                },
        )
    }

    /**
     * A listener was refused: the conversation isn't there (not yet, or deleted). Nothing to
     * show until it appears among the person's conversations, when [watch] listens again —
     * at once if the list already has it (it was created while this read was on its way).
     */
    private fun refused(pair: String, error: FirebaseFirestoreException) {
        stop()
        conversationExists = false
        messages = emptyList()
        threadReady = true
        if (error.code == FirebaseFirestoreException.Code.PERMISSION_DENIED && pair in session.conversations.ids.value && refusals++ < 3) {
            listen(pair)
        }
    }

    /** Stops listening (the screen is going away, or the conversation is being deleted). */
    fun stop() {
        listening++
        listeners.forEach { it.remove() }
        listeners = emptyList()
    }

    /** The screen is gone: listeners, the watch and card lookups stop. */
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
                    session.reading.card(id).also { session.cardCache.rememberPreview(it.card) }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    null
                }
            }
        }
    }

    suspend fun send() {
        val other = otherId ?: return
        if (!canSend) return
        sending = true
        error = null
        try {
            session.messaging.sendMessage(other, draft.trim(), pendingCard?.id, noteRef)
            draft = ""
            pendingCard = null
            noteRef = null
            // The first message made the conversation: listen to it now.
            pairId?.let { if (!conversationExists) listen(it) }
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
            listen(pair)
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
internal fun threadSaver(handle: String, uid: String?, session: Session): Saver<ThreadModel, Any> = listSaver(
    save = { m ->
        listOf(m.draft, m.noteRef?.cardId.orEmpty(), m.noteRef?.noteId.orEmpty(), m.pendingCard?.id.orEmpty(), m.pendingCard?.title.orEmpty())
    },
    restore = { v ->
        val note = if (v[1].isNotEmpty() && v[2].isNotEmpty()) MessagingApi.Note(v[1], v[2]) else null
        ThreadModel(handle, uid, note, session).also { m ->
            m.draft = v[0]
            if (v[3].isNotEmpty()) m.pendingCard = ThreadModel.Attachment(v[3], v[4])
        }
    },
)

/** The header's person as the conversation list drew them, until their profile arrives. */
private fun Person.asAuthor() = Author(
    id = id, handle = handle, initials = initials, accentColor = accentColor ?: "",
    avatarUrl = avatarUrl, avatarSeed = avatarSeed, verified = false, region = null,
)
