package com.resonance.app

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.QueryDocumentSnapshot
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.Date

/** Someone in Messages: what a row or a thread header draws of them. */
data class Person(
    val id: String,
    val handle: String,
    val initials: String,
    val avatarUrl: String?,
    val accentColor: String?,
    val avatarSeed: String?,
) {
    companion object {
        /** The person a `users/{id}` document describes; null when it is missing or has no pen name. */
        fun from(id: String, data: Map<String, Any?>?): Person? {
            val handle = data?.get("handle") as? String
            if (handle.isNullOrEmpty()) return null
            return Person(
                id = id,
                handle = handle,
                initials = data["initials"] as? String ?: handle.take(2).uppercase(),
                avatarUrl = data["avatarUrl"] as? String,
                accentColor = data["accentColor"] as? String,
                // Text from the web's signup, a number from older seeds.
                avatarSeed = (data["avatarSeed"] as? String) ?: (data["avatarSeed"] as? Number)?.toLong()?.toString(),
            )
        }
    }
}

/**
 * The signed-in person's conversations, live — the web's useConversations
 * (listConversations + listMyConnectionUids + getMyBlockedIds), as snapshot
 * listeners instead of a 30s poll. Drives the Messages tab and its badge. The
 * twin of iOS's ConversationsStore.
 */
class ConversationsStore {
    data class Conversation(
        val id: String,
        val other: Person,
        val lastText: String?,
        val lastFromMe: Boolean,
        val sentAt: Date?,
        val unread: Int,
    )

    data class State(
        val conversations: List<Conversation> = emptyList(),
        /** Connected, no conversation yet (the list's second section). */
        val starters: List<Person> = emptyList(),
        val loaded: Boolean = false,
    ) {
        val unreadTotal: Int get() = conversations.sumOf { it.unread }
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    /** Called when the person's blocks change after they were first read. */
    var onBlocksChanged: (() -> Unit)? = null

    private var uid: String? = null
    private var listeners: List<ListenerRegistration> = emptyList()
    private var rawConversations: List<QueryDocumentSnapshot> = emptyList()
    private var connectionUids: List<String> = emptyList()
    private var blocked: Set<String> = emptySet()
    private val people = HashMap<String, Person>()
    private val missing = HashSet<String>()
    private val ready = HashSet<String>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var rebuilding: Job? = null

    fun start(uid: String) {
        stop()
        this.uid = uid
        val db = AppFirebase.db
        listeners = listOf(
            db.collection("conversations").whereArrayContains("participants", uid)
                .orderBy("updatedAt", Query.Direction.DESCENDING)
                .addSnapshotListener { snap, _ ->
                    snap ?: return@addSnapshotListener
                    rawConversations = snap.documents.filterIsInstance<QueryDocumentSnapshot>()
                    arrived("conversations")
                },
            db.collection("connections").whereArrayContains("userIds", uid)
                .addSnapshotListener { snap, _ ->
                    snap ?: return@addSnapshotListener
                    connectionUids = snap.documents.mapNotNull { doc -> (doc.get("userIds") as? List<*>)?.firstOrNull { it != uid } as? String }
                    arrived("connections")
                },
            db.collection("users").document(uid).collection("blocks")
                .addSnapshotListener { snap, _ ->
                    snap ?: return@addSnapshotListener
                    val next = snap.documents.map { it.id }.toSet()
                    val changed = "blocks" in ready && next != blocked
                    blocked = next
                    if (changed) onBlocksChanged?.invoke()
                    arrived("blocks")
                },
        )
    }

    fun stop() {
        listeners.forEach { it.remove() }
        listeners = emptyList()
        rebuilding?.cancel()
        uid = null
        rawConversations = emptyList()
        connectionUids = emptyList()
        blocked = emptySet()
        ready.clear()
        _state.value = State()
    }

    private fun arrived(source: String) {
        ready.add(source)
        rebuilding?.cancel()
        rebuilding = scope.launch { rebuild() }
    }

    private suspend fun rebuild() {
        val uid = uid ?: return
        val others = rawConversations.mapNotNull { other(it, uid) }
        val wanted = (others + connectionUids).toSet() - people.keys - missing
        coroutineScope {
            wanted.map { id ->
                async {
                    val doc = try {
                        AppFirebase.db.collection("users").document(id).get().await()
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        return@async // Asked again on the next change.
                    }
                    Person.from(id, doc.data)?.let { people[id] = it } ?: missing.add(id)
                }
            }.awaitAll()
        }
        // A row whose profile is gone is skipped; blocked people drop out entirely.
        val conversations = rawConversations.mapNotNull { doc ->
            val otherId = other(doc, uid)
            val person = otherId?.let { people[it] }
            if (otherId == null || otherId in blocked || person == null) return@mapNotNull null
            @Suppress("UNCHECKED_CAST")
            val last = doc.get("lastMessage", DocumentSnapshot.ServerTimestampBehavior.ESTIMATE) as? Map<String, Any?>
            val unread = ((doc.get("unread") as? Map<*, *>)?.get(uid) as? Number)?.toInt() ?: 0
            Conversation(
                id = doc.id,
                other = person,
                lastText = last?.get("text") as? String,
                lastFromMe = last?.get("senderId") == uid,
                sentAt = (last?.get("sentAt") as? Timestamp)?.toDate(),
                unread = unread,
            )
        }
        val talking = conversations.map { it.other.id }.toSet()
        val starters = connectionUids.filter { it !in talking && it !in blocked }.mapNotNull { people[it] }
        _state.value = State(conversations, starters, loaded = ready.containsAll(SOURCES))
    }

    private fun other(doc: QueryDocumentSnapshot, me: String): String? =
        (doc.get("participants") as? List<*>)?.firstOrNull { it != me } as? String

    private companion object {
        val SOURCES = setOf("conversations", "connections", "blocks")
    }
}
