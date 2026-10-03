package com.resonance.app

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.QueryDocumentSnapshot
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.Date

/**
 * The signed-in person's notifications, live (a Firestore snapshot listener on
 * the same query the web's bell reads). Drives the tab badge too. The twin of
 * iOS's NotificationsStore.
 */
class NotificationsStore {
    data class Item(
        val id: String,
        val type: String,
        val fromHandle: String?,
        /** Who it is from (their conversation opens by it, whatever their pen name is now). */
        val fromUserId: String?,
        val cardId: String?,
        val preview: String?,
        /** A note's id (to quote it when replying). */
        val noteId: String?,
        val count: Int?,
        val readAt: Date?,
        val createdAt: Date?,
    ) {
        val isUnread get() = readAt == null
    }

    private val _items = MutableStateFlow<List<Item>>(emptyList())
    val items: StateFlow<List<Item>> = _items
    private val _loaded = MutableStateFlow(false)
    val loaded: StateFlow<Boolean> = _loaded
    private val _failed = MutableStateFlow(false)
    /**
     * The listener failed: the list stays as last read (or, with nothing read yet, the screen
     * offers a retry rather than a loader forever) until it listens again ([resume]).
     */
    val failed: StateFlow<Boolean> = _failed

    private val listeners = LiveListeners()

    fun start(uid: String) {
        stop()
        listeners.add(NAME) {
            val registration: ListenerRegistration = AppFirebase.db.collection("notifications")
                .whereEqualTo("userId", uid)
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(50)
                .addSnapshotListener { snapshot, _ ->
                    if (snapshot == null) {
                        listeners.fail(NAME)
                        _failed.value = true
                        return@addSnapshotListener
                    }
                    _items.value = snapshot.documents.filterIsInstance<QueryDocumentSnapshot>().map(::item)
                    _loaded.value = true
                    _failed.value = false
                }
            registration::remove
        }
    }

    /** Back in the foreground (or the retry tapped): a failed listener listens again. */
    fun resume() {
        if (listeners.resume()) _failed.value = false
    }

    fun stop() {
        listeners.removeAll()
        _items.value = emptyList()
        _loaded.value = false
        _failed.value = false
    }

    fun markRead(item: Item) {
        if (!item.isUnread) return
        markRead(item.id)
    }

    /** A tapped push reads its row (it may not have arrived in the list yet). */
    fun markRead(id: String) {
        // Not a document id (an empty one would point Firestore at the collection itself and throw).
        if (id.isEmpty() || '/' in id) return
        if (_items.value.firstOrNull { it.id == id }?.isUnread == false) return
        AppFirebase.db.collection("notifications").document(id).update("readAt", FieldValue.serverTimestamp())
    }

    /** Who a notification (a tapped push's row) is from, once the list has it. */
    fun sender(id: String?): String? = id?.let { i -> _items.value.firstOrNull { it.id == i }?.fromUserId }

    private companion object {
        const val NAME = "notifications"
    }

    private fun item(doc: QueryDocumentSnapshot): Item {
        @Suppress("UNCHECKED_CAST")
        val payload = doc.get("payload") as? Map<String, Any?> ?: emptyMap()
        return Item(
            id = doc.id,
            type = doc.getString("type") ?: "",
            fromHandle = payload["fromHandle"] as? String,
            fromUserId = payload["fromUserId"] as? String,
            cardId = payload["cardId"] as? String,
            preview = payload["preview"] as? String,
            noteId = payload["noteId"] as? String,
            count = (payload["count"] as? Number)?.toInt(),
            readAt = doc.getTimestamp("readAt")?.toDate(),
            createdAt = doc.getTimestamp("createdAt")?.toDate(),
        )
    }
}
