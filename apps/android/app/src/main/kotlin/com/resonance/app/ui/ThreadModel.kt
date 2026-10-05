package com.resonance.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateSetOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.resonance.api.models.Author
import com.resonance.api.models.FeedCard
import com.resonance.api.models.Profile
import com.resonance.app.AppFirebase
import com.resonance.app.FirestoreFailure
import com.resonance.app.Person
import com.resonance.app.PushCenter
import com.resonance.app.Session
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.chat.ChatMessage
import com.resonance.kit.chat.Linkify
import com.resonance.kit.chat.MessageHistory
import com.resonance.kit.chat.MessageSearch
import com.resonance.kit.chat.Outbox
import com.resonance.kit.chat.ReplyQuote
import com.resonance.kit.chat.SearchHit
import com.resonance.kit.chat.SharedCard
import com.resonance.kit.chat.SharedCards
import com.resonance.kit.chat.ThreadMessages
import com.resonance.kit.l10n.L10n
import com.resonance.kit.reading.cardsByKey
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.util.Date

/**
 * One conversation (ThreadView.tsx): who it's with, whether you may write, its messages — the
 * newest 50 live, older ones paged in as the thread is scrolled or searched — and sending
 * through the API. The twin of iOS's ThreadModel.
 *
 * **Messages** ([messages], oldest first) are the conversation's [MessageHistory] followed by this
 * person's own messages still on their way (the conversation's [Outbox]); a message sent from here
 * is drawn the moment it is sent and the document replaces it in place, under the same
 * [ChatMessage.key].
 *
 * **Sending** ([send]) takes what the composer holds and frees the composer at once; the outbox
 * sends in order and a failure stays in the thread as a [com.resonance.kit.chat.Delivery.Failed]
 * message ([retry], [discard]). The outbox belongs to the app's session, not to this model, so a
 * send carries on when the screen is rotated, covered by a profile or left.
 *
 * Opened from somewhere that knows the other person's uid (the conversation
 * list, a notification), it listens to the conversation by its pair id at once
 * and reads their profile beside it, only to learn whether you may write; by
 * pen name alone (a link, a push), the profile comes first to find them. A
 * conversation exists only after its first message, and reading one that
 * doesn't is refused: that refusal means "no conversation yet", and the thread
 * then watches for it to appear among the person's conversations — whoever
 * writes first — and listens from then on.
 *
 * Used on the main thread, like every Compose state it holds.
 */
class ThreadModel(val handle: String, uid: String?, note: MessagingApi.Note?, private val session: Session) {
    /** A card waiting to go with the next message: what the chip shows and what is sent. */
    data class Attachment(val id: String, val title: String)

    /** `Failed`: who they are couldn't be asked (offline, a server error) — not "nobody by that name", which is `Missing`. */
    enum class Phase { Loading, Missing, Failed, Ready }

    var phase by mutableStateOf(Phase.Loading)
        private set
    var other by mutableStateOf<Author?>(null)
        private set
    /** The other person's uid: from where the thread was opened, or their profile. */
    var otherId by mutableStateOf(uid)
        private set
    /**
     * Whether you may write (connected, no block). Null until known — the composer shows meanwhile.
     * It follows the person's connections live ([watchConnections]): a take-back by either of you
     * that ends the connection, or an answer that begins it, changes the foot at once.
     */
    var connected by mutableStateOf<Boolean?>(null)
        private set
    var isBlocked by mutableStateOf(false)
        private set
    var conversationExists by mutableStateOf(false)
        private set
    /**
     * Who left a note in this conversation that waits for its answer (the conversation's
     * `request.from`, written by the server): a note doesn't connect two people, the card's author
     * answering it does. Null when none waits.
     */
    var requestFrom by mutableStateOf<String?>(null)
        private set
    /** What the thread's foot shows: the composer, or why there is none ([ThreadFoot]). */
    internal val foot: ThreadFoot get() = ThreadFoot.of(connected, isBlocked, requestFrom, me, otherId)

    /**
     * The conversation as the thread draws it, oldest first: every message held ([history]), then
     * this person's own still on their way. A new list whenever anything in it changes; rows are
     * kept by [ChatMessage.key].
     */
    var messages by mutableStateOf<List<ChatMessage>>(emptyList())
        private set
    /** The first snapshot of messages has arrived (or there is no conversation yet). */
    var threadReady by mutableStateOf(false)
        private set
    /** The listeners failed (not "no conversation"): what was read stays; they listen again on [resumeIfFailed]. */
    var listenFailed by mutableStateOf(false)
        private set
    /**
     * The cards messages share — carried, or linked to — as the viewer may see them, by the key they
     * were asked for (an id or a slug): null when the viewer can't see it. A key not here yet is
     * being read ([cardsLoading]), or its read failed and is asked again with the next snapshot.
     */
    val cards = mutableStateMapOf<String, FeedCard?>()
    /** The card keys being read. */
    val cardsLoading = mutableStateSetOf<String>()

    // Paging

    /** There may be messages older than the oldest held: [loadOlder] reads the next page. False at the beginning of the conversation. */
    var hasOlder by mutableStateOf(false)
        private set
    /** A page of older messages (or the whole history, for a search) is being read. */
    var loadingOlder by mutableStateOf(false)
        private set
    /** The last read of older messages failed; [loadOlder] tries again. */
    var olderError by mutableStateOf(false)
        private set

    // The composer

    var draft by mutableStateOf("")
    var pendingCard by mutableStateOf<Attachment?>(null)
    /** The note the next message answers, as a chip (an older note the thread doesn't hold; see [landOnNote]). */
    var noteRef by mutableStateOf<MessagingApi.Note?>(null)
    /** The note a link to it (`?note=`) opened the thread at, until [landOnNote] has found where it lands. */
    internal var routeNote: MessagingApi.Note? = note
        private set
    /** The message the next one answers (set by [reply], cleared by sending and [cancelReply]). */
    var replyingTo by mutableStateOf<ReplyQuote?>(null)
        private set
    var error by mutableStateOf<String?>(null)

    // Search

    /** What is being searched for ([search]); blank when not searching. */
    var searchQuery by mutableStateOf("")
        private set
    /** The messages that match, newest first, each with the stretches of text to highlight. */
    var searchHits by mutableStateOf<List<SearchHit>>(emptyList())
        private set
    /** Every message of the conversation is held, so [searchHits] is complete. */
    val searchComplete: Boolean get() = !hasOlder
    /** The whole history was read as far as the cap allows and there is still more: older matches may exist. */
    var searchCapped by mutableStateOf(false)
        private set
    /** Older messages are being read for the search: [searchHits] may still grow. */
    val searchLoading: Boolean get() = loadingOlder && searchQuery.isNotBlank()

    private val history = MessageHistory<DocumentSnapshot>()
    private var listeners: List<ListenerRegistration> = emptyList()
    /** Which [listen] the live listeners belong to (a late callback of a removed one is ignored). */
    private var listening = 0
    /** Which life of the conversation's history a page read belongs to (a reset makes a late page void). */
    private var epoch = 0
    /** Refusals met while the conversation list already had it (a creation racing the first read). */
    private var refusals = 0
    private var watching: Job? = null
    private var outboxWatch: Job? = null
    private var paging: Job? = null
    private var searching: Job? = null
    private var allRequested = false
    private var unreadForMe = 0
    private val thread = ThreadMessages()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val me: String? get() = session.uid
    val pairId: String?
        get() {
            val me = me ?: return null
            val other = otherId ?: return null
            return listOf(me, other).sorted().joinToString("_")
        }

    /** ThreadView's `valid`: text or a card, within 2000, somewhere to send it. Sending in flight doesn't matter: the next message queues behind it. */
    val canSend: Boolean
        get() {
            val trimmed = draft.trim()
            return (trimmed.isNotEmpty() || pendingCard != null) && trimmed.length <= NOTE_MAX_LENGTH && pairId != null
        }

    suspend fun load() {
        if (phase == Phase.Failed) phase = Phase.Loading
        watchConnections()
        otherId?.let { id ->
            // The conversation list already drew them: the header shows at once, beside the messages.
            session.conversations.person(id)?.let { person ->
                other = person.asAuthor()
                phase = Phase.Ready
            }
            watch()
        }
        val profile = try {
            profile()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Offline or a server error: keep what's known. By pen name alone there is nothing to open yet —
            // a retry, never "user not found".
            if (other == null) phase = Phase.Failed
            return
        }
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
        // The live connections, when Firestore has said, over a profile the HTTP cache may have kept a little while.
        connected = connectionOf(session.conversations.connectedIds.value, profile.author.id, profile.isConnected, profile.isBlocked)
        phase = Phase.Ready
        watch()
    }

    private var connectionsWatch: Job? = null

    /**
     * Follows the person's connections, live (the conversation list's listener): a connection
     * that ends — a take-back of the resonance that made it, by either of you — or begins shows
     * in the foot at once, a waiting letter counting again once you are no longer connected.
     */
    private fun watchConnections() {
        if (connectionsWatch != null) return
        connectionsWatch = scope.launch {
            session.conversations.connectedIds.collect { live -> connected = connectionOf(live, otherId, connected, isBlocked) }
        }
    }

    /**
     * Re-reads whether you may still write (after a block, or an answer): a read made after the
     * write — from the server, never the profile the HTTP cache kept from before it — so its
     * "connected" stands over a live list that may not have heard yet, and its "not connected"
     * never over a live list that already has ([connectionAfterRead]).
     */
    suspend fun refreshConnection() {
        session.readAfresh()
        val read = try {
            read(other?.handle ?: handle)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return
        }
        val profile = read?.takeIf { p -> otherId.let { it == null || it == p.author.id } } ?: return
        isBlocked = profile.isBlocked
        connected = connectionAfterRead(session.conversations.connectedIds.value, profile.author.id, profile.isConnected, profile.isBlocked)
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
            // Refused is gone; anything else failed for now.
            if (FirestoreFailure.isGone(e)) null else throw e
        }
        if (current == null || current == name) return null
        return read(current)?.takeIf { it.author.id == id }
    }

    /** Their profile by pen name; null when there is nobody by it. A failed request throws. */
    private suspend fun read(handle: String): Profile? = try {
        session.reading.profile(handle)
    } catch (e: ApiFailure) {
        if (e.isNotFound) null else throw e
    }

    /** Listens to the conversation, and watches for it to appear should it not exist yet. */
    private fun watch() {
        val pair = pairId ?: return
        attachOutbox()
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
                noteRequest((doc.get("request") as? Map<*, *>)?.get("from") as? String)
                markReadIfNeeded()
            },
            ref.collection("messages").orderBy("sentAt", Query.Direction.DESCENDING).limit(MessageHistory.LIVE_LIMIT.toLong())
                .addSnapshotListener { docs, error ->
                    if (run != listening) return@addSnapshotListener
                    if (error != null) return@addSnapshotListener refused(pair, error)
                    docs ?: return@addSnapshotListener
                    // The newest 50 join what is held; the ones that slid out of the window stay.
                    val merged = history.mergeWindow(docs.documents.map { MessageHistory.Entry(toMessage(it), it) }, authoritative = !docs.metadata.isFromCache)
                    // Held nothing in common with the window: it started afresh, and a page being read for the old one is void.
                    if (merged == MessageHistory.Merged.Restarted) forgetPaging()
                    threadReady = true
                    historyChanged()
                    markReadIfNeeded()
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
        if (error.code != FirebaseFirestoreException.Code.PERMISSION_DENIED) {
            // Not "no conversation" — offline for good, the backend busy: what was read stays, and the
            // listeners attach again back in the foreground ([resumeIfFailed]).
            listenFailed = true
            threadReady = true
            return
        }
        conversationExists = false
        requestFrom = null
        resetHistory()
        threadReady = true
        if (error.code == FirebaseFirestoreException.Code.PERMISSION_DENIED && pair in session.conversations.ids.value && refusals++ < 3) {
            listen(pair)
        }
    }

    /**
     * Back in the foreground: a thread that couldn't find its person asks again, and listeners
     * that failed listen again.
     */
    suspend fun resumeIfFailed() {
        if (phase == Phase.Failed) return load()
        if (!listenFailed) return
        listenFailed = false
        pairId?.let(::listen)
    }

    /** Stops listening (the screen is going away, or the conversation is being deleted). */
    fun stop() {
        listening++
        listeners.forEach { it.remove() }
        listeners = emptyList()
    }

    /** The screen is gone: listeners, the watch and card lookups stop. Messages still sending carry on (they belong to the session). */
    fun close() {
        stop()
        scope.cancel()
    }

    /** Opening a thread reads it: the unread count says whether it needs resetting; the push for it, if any, goes. */
    fun markReadIfNeeded() {
        val pair = pairId ?: return
        val me = me ?: return
        // Only while the screen is on show: a message that arrives behind the lock screen (or with the app in
        // the background, the listeners still live) is not read yet — its notification and its unread count
        // stay until the thread is resumed, which calls this again.
        if (PushCenter.viewingConversation != pair) return
        PushCenter.cancelConversation(pair)
        if (unreadForMe <= 0) return
        AppFirebase.db.collection("conversations").document(pair).update("unread.$me", 0)
    }

    // History

    /** The documents or the outbox changed: what the thread draws, what paging and search know, the cards to look up. */
    private fun historyChanged() {
        hasOlder = history.hasOlder
        rebuild()
        loadCards()
        if (searchQuery.isNotBlank()) {
            loadAll()
            runSearch()
        }
    }

    /** History and what is on its way, as one list; a message on its way whose document has arrived is dropped from the outbox. */
    private fun rebuild() {
        val box = outbox
        messages = thread.build(history, box?.entries?.value.orEmpty())
        box?.reconcile { it.isIn(history) }
    }

    /** Everything held is forgotten (the conversation is gone, or the listener lost track of it). */
    private fun resetHistory() {
        history.clear()
        forgetPaging()
        thread.clear()
        historyChanged()
    }

    /** Pages being read belong to a history that is no more: they stop, and the next read starts from the new one. */
    private fun forgetPaging() {
        epoch++
        paging?.cancel()
        paging = null
        loadingOlder = false
        olderError = false
        allRequested = false
        searchCapped = false
    }

    /** The message with this id or key, if the thread holds it. */
    fun find(idOrKey: String): ChatMessage? = messages.firstOrNull { it.id == idOrKey || it.key == idOrKey }

    /**
     * Reads the next page of older messages (50) into the thread. Does nothing at the beginning of the
     * conversation or while a page is already being read. Prepends: nothing already held moves.
     */
    fun loadOlder() {
        if (!history.hasOlder || paging?.isActive == true) return
        page { fetchOlder(OLDER_PAGE) }
    }

    /**
     * Reads older pages until the message with [id] is held, at most [maxPages] of 100; false if it
     * isn't (it isn't in this conversation, the beginning came first, a read failed).
     */
    suspend fun ensureLoaded(id: String, maxPages: Int = 20): Boolean {
        // A read that failed before is tried again: the person asked for this one.
        olderError = false
        var pages = 0
        while (id !in history) {
            if (!history.hasOlder || pages++ >= maxPages) return false
            val running = paging?.takeIf { it.isActive }
            (running ?: page { fetchOlder(JUMP_PAGE) }).join()
            if (olderError) return false
        }
        return true
    }

    /**
     * Reads the whole conversation, 200 at a time, up to [cap] messages (the search needs all of
     * them); once per start of a search. [searchCapped] says whether the cap cut it short.
     */
    fun loadAll(cap: Int = LOAD_ALL_CAP) {
        if (allRequested) return
        allRequested = true
        page {
            while (history.hasOlder && history.size < cap) {
                if (!fetchOlder(ALL_PAGE)) break
            }
            searchCapped = history.hasOlder && history.size >= cap
            // Done only once it reached the beginning or the cap: a read that failed, or one that found no
            // window to page back from yet (a restored search before the first snapshot), is asked again
            // as the history changes or by the next search.
            allRequested = !olderError && (!history.hasOlder || searchCapped) && history.size > 0
        }
    }

    /** One paging job at a time: [work] runs after the one before it. */
    private fun page(work: suspend () -> Unit): Job {
        val before = paging
        val job = scope.launch {
            before?.join()
            loadingOlder = true
            try {
                work()
            } finally {
                loadingOlder = false
            }
        }
        paging = job
        return job
    }

    /** One older page into the history; whether it brought a page in. */
    private suspend fun fetchOlder(limit: Int): Boolean {
        val pair = pairId ?: return false
        val cursor = history.oldestCursor ?: return false
        val life = epoch
        olderError = false
        try {
            val docs = AppFirebase.db.collection("conversations").document(pair).collection("messages")
                .orderBy("sentAt", Query.Direction.DESCENDING).startAfter(cursor).limit(limit.toLong())
                .get().await()
            if (life != epoch) return false
            // Offline, Firestore answers from what it has: a short answer then is no sign of the beginning.
            if (docs.metadata.isFromCache && docs.size() < limit) {
                olderError = true
                return false
            }
            history.mergePage(docs.documents.map { MessageHistory.Entry(toMessage(it), it) }, limit)
            historyChanged()
            return true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (life == epoch) olderError = true
            return false
        }
    }

    // Outbox

    /** This conversation's outbox (kept by the session, so it outlives this model). Null until we know whom it is with. */
    private val outbox: Outbox?
        get() {
            val pair = pairId ?: return null
            val to = otherId ?: return null
            return session.outboxes.of(pair, to)
        }

    private fun attachOutbox() {
        if (outboxWatch?.isActive == true) return
        val box = outbox ?: return
        outboxWatch = scope.launch { box.entries.collect { onOutbox(it) } }
    }

    private fun onOutbox(entries: List<Outbox.Outgoing>) {
        // A message that failed shows on its own row, with its retry.
        rebuild()
        // A card sent from here is drawn as the card while it is on its way.
        loadCards()
        // The first message made the conversation: listen to it now.
        val pair = pairId
        if (pair != null && listeners.isEmpty() && entries.any { it.status == Outbox.Status.Sent }) listen(pair)
        // An answer to their note connected you: whether you may write is asked again.
        if (foot == ThreadFoot.Answer && entries.any { it.status == Outbox.Status.Sent }) reaskConnection()
    }

    /**
     * The conversation says who left a note waiting, if anyone (it may stay while you are
     * connected another way: the foot ignores it then). A note of theirs that stops waiting was
     * answered (most likely by you, just now): until the connection shows, the composer stays —
     * "not known" rather than "not connected".
     */
    private fun noteRequest(from: String?) {
        val answered = requestFrom != null && from == null && connected == false
        requestFrom = from
        if (answered) reaskConnection()
    }

    private var reasking: Job? = null

    private fun reaskConnection() {
        if (reasking?.isActive == true) return
        if (connected == false && !isBlocked) connected = null
        reasking = scope.launch { refreshConnection() }
    }

    /**
     * Sends what the composer holds — the text, the card, the quoted note, the message being replied
     * to — and clears the composer at once. The message appears in the thread as sending; failure
     * keeps it there to [retry] or [discard]. Never waits: the next one can be written and sent while
     * this one is on its way.
     */
    fun send() {
        if (!canSend) return
        val me = me ?: return
        val box = outbox ?: return
        attachOutbox()
        box.enqueue(
            Outbox.Outgoing(
                clientId = Outbox.newClientId(),
                senderId = me,
                text = draft.trim(),
                cardRef = pendingCard?.id,
                noteRef = noteRef,
                replyTo = replyingTo,
                queuedAt = Date(),
            ),
        )
        draft = ""
        pendingCard = null
        noteRef = null
        replyingTo = null
        error = null
    }

    /**
     * Sends a message that failed again ([ChatMessage.key] or id), under the id it was first written
     * under (the server doesn't write one twice). The messages written before it that failed with it go
     * first, so the order the person wrote them in holds.
     */
    fun retry(keyOrId: String) {
        outbox?.let { box -> clientIdOf(box, keyOrId)?.let(box::retry) }
    }

    /** Sends again every message that failed, in the order they were written. */
    fun retryAll() {
        outbox?.retryFailed()
    }

    /** Deletes a message that failed ([ChatMessage.key] or id); one still sending can't be taken back. */
    fun discard(keyOrId: String) {
        outbox?.let { box -> clientIdOf(box, keyOrId)?.let(box::discard) }
    }

    private fun clientIdOf(box: Outbox, keyOrId: String): String? =
        box.entries.value.firstOrNull { it.clientId == keyOrId || it.serverId == keyOrId }?.clientId

    // Replying

    /** The next message answers [message]; only a delivered one can be answered (a pending one has no document yet). */
    fun reply(message: ChatMessage) {
        if (message.canReply) replyingTo = ReplyQuote.of(message)
    }

    fun cancelReply() {
        replyingTo = null
    }

    /** The reply the composer held before the screen was covered (see [threadSaver]). */
    internal fun restoreReply(quote: ReplyQuote) {
        replyingTo = quote
    }

    /**
     * Where the note a link opened the thread at lands ([NoteLanding]): its own message — read in from
     * older pages if need be, a few at most — which the screen jumps to and answers; otherwise the
     * chip, unless its card is anonymous (or can't be read). Once per note; null when there was none
     * or it has landed already.
     */
    internal suspend fun landOnNote(): NoteLanding? {
        val note = routeNote ?: return null
        snapshotFlow { threadReady }.first { it }
        val found = if (ensureLoaded(note.noteId, maxPages = NOTE_PAGES)) find(note.noteId) else null
        val card = if (found != null) null else try {
            cards[note.cardId] ?: session.reading.cardsByKey(listOf(note.cardId))[note.cardId]
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        val landing = NoteLanding.of(found, card)
        routeNote = null
        if (landing == NoteLanding.Chip) noteRef = note
        return landing
    }

    /** The messages that are mine, to tell mine from theirs. */
    fun isMine(message: ChatMessage): Boolean = message.senderId == me

    /** A build on a local stack shares its own card links too (its API's host and port); production's are [SharedCards.HOSTS]. */
    private val ownHost: String? = session.config.takeIf { it.usesEmulator }?.origin?.substringAfter("://")
    /** What [sharedCard] found for each message, by its id and what can change about it (the preview arrives later). */
    private val sharedMemo = HashMap<String, SharedCard?>()

    /** The card [message] shares — the one it carries, or the card page its link leads to — if any. */
    fun sharedCard(message: ChatMessage): SharedCard? {
        val memo = "${message.id}|${message.cardRef}|${message.preview?.url}"
        return if (sharedMemo.containsKey(memo)) sharedMemo[memo] else SharedCards.of(message, ownHost).also { sharedMemo[memo] = it }
    }

    /** A Resonance link (a card page of the site) opens in the app; the key it names, if it is one. */
    fun cardKeyOf(url: String): String? = SharedCards.keyOf(url, ownHost)

    /**
     * The cards shared in the messages — carried, or linked to — each read once: the ones not yet
     * asked for go out together (GET /cards?keys=…, ids and slugs alike); a card's summary is all a
     * message shows. A read that fails is forgotten — the whole of it, or only the request of 30 that
     * failed ([cardsByKey]) — so the next snapshot asks for those again.
     */
    private fun loadCards() {
        val wanted = messages.mapNotNull { sharedCard(it)?.key }.distinct().filterNot { it in cards || it in cardsLoading }
        if (wanted.isEmpty()) return
        cardsLoading.addAll(wanted)
        scope.launch {
            try {
                val read = session.reading.cardsByKey(wanted)
                read.values.filterNotNull().forEach(session.cardCache::rememberPreview)
                cards.putAll(read)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Nothing came back: the next snapshot asks for them again (as for any left out of the answer).
            } finally {
                cardsLoading.removeAll(wanted.toSet())
            }
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
            session.outboxes.forget(pair)
            resetHistory()
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

    /**
     * Searches the conversation for [query] (case and the width of ASCII letters don't matter): the
     * matches, newest first, are [searchHits]. The first search of a visit also reads the whole
     * history ([loadAll]), and the hits grow as it arrives. A blank query ends the search.
     */
    fun search(query: String) {
        searchQuery = query
        if (query.isBlank()) return endSearch()
        loadAll()
        runSearch()
    }

    /** Leaves the search: no query, no hits (the history read for it stays). */
    fun endSearch() {
        searching?.cancel()
        searching = null
        searchQuery = ""
        searchHits = emptyList()
    }

    private fun runSearch() {
        val query = searchQuery
        val held = history.messages
        searching?.cancel()
        searching = scope.launch {
            // A long conversation is searched off the main thread.
            val hits = if (held.size < SEARCH_OFF_MAIN) MessageSearch.find(held, query) else withContext(Dispatchers.Default) { MessageSearch.find(held, query) }
            searchHits = hits
        }
    }

    /**
     * Cards shared here (in thread order, once each) — carried, or linked to, as the bubbles find
     * them ([sharedCard]) — and the other links written in messages.
     */
    val shared: Pair<List<String>, List<String>>
        get() {
            val seenCards = LinkedHashSet<String>()
            val seenLinks = LinkedHashSet<String>()
            for (m in messages) {
                sharedCard(m)?.let { seenCards.add(it.key) }
                Linkify.find(m.text).forEach { if (cardKeyOf(it.url) == null) seenLinks.add(it.url) }
            }
            return seenCards.toList() to seenLinks.toList()
        }

    private fun toMessage(doc: DocumentSnapshot): ChatMessage = ChatMessage.from(
        id = doc.id,
        fields = doc.data ?: emptyMap(),
        // A pending server time (a document just written) reads as an estimate, so it sorts last.
        sentAt = doc.getTimestamp("sentAt", DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)?.toDate() ?: Date(),
        origin = session.config.origin,
    )

    private companion object {
        /** The page [loadOlder] reads. */
        const val OLDER_PAGE = 50
        /** The page [ensureLoaded] reads while it looks for a message. */
        const val JUMP_PAGE = 100
        /** The page [loadAll] reads. */
        const val ALL_PAGE = 200
        const val LOAD_ALL_CAP = 5000
        /** Above this many messages a search runs off the main thread. */
        const val SEARCH_OFF_MAIN = 400
        /** How many pages of older messages a link to a note reads in looking for it. */
        const val NOTE_PAGES = 5
    }
}

/**
 * What the composer holds (the draft, the quoted note, the attached card, the message being
 * replied to), kept while the thread is covered by a profile or a card. Navigation composes only
 * the top screen, so without this the person would come back to an empty field; on iOS the
 * covered screen simply stays alive. Messages already sent are not here: they are in the session's
 * outbox, which survives the screen.
 */
internal fun threadSaver(handle: String, uid: String?, session: Session): Saver<ThreadModel, Any> = listSaver(
    save = { m ->
        val reply = m.replyingTo
        listOf(
            m.draft, m.noteRef?.cardId.orEmpty(), m.noteRef?.noteId.orEmpty(), m.pendingCard?.id.orEmpty(), m.pendingCard?.title.orEmpty(),
            reply?.id.orEmpty(), reply?.senderId.orEmpty(), reply?.text.orEmpty(), reply?.cardRef.orEmpty(),
            // A note the link opened at that hadn't landed yet lands when the thread comes back.
            m.routeNote?.cardId.orEmpty(), m.routeNote?.noteId.orEmpty(),
        )
    },
    restore = { v ->
        fun note(card: Int, id: Int) = if (v.size > id && v[card].isNotEmpty() && v[id].isNotEmpty()) MessagingApi.Note(v[card], v[id]) else null
        ThreadModel(handle, uid, note(9, 10), session).also { m ->
            m.draft = v[0]
            m.noteRef = note(1, 2)
            if (v[3].isNotEmpty()) m.pendingCard = ThreadModel.Attachment(v[3], v[4])
            if (v.size >= 9 && v[5].isNotEmpty()) m.restoreReply(ReplyQuote(v[5], v[6], v[7], v[8].ifEmpty { null }))
        }
    },
)

/** The header's person as the conversation list drew them, until their profile arrives. */
private fun Person.asAuthor() = Author(
    id = id, handle = handle, initials = initials, accentColor = accentColor ?: "",
    avatarUrl = avatarUrl, avatarSeed = avatarSeed, verified = false, region = null,
)
