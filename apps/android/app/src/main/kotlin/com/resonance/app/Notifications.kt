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

    private var listener: ListenerRegistration? = null

    fun start(uid: String) {
        stop()
        listener = AppFirebase.db.collection("notifications")
            .whereEqualTo("userId", uid)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener { snapshot, _ ->
                snapshot ?: return@addSnapshotListener
                _items.value = snapshot.documents.filterIsInstance<QueryDocumentSnapshot>().map(::item)
                _loaded.value = true
            }
    }

    fun stop() {
        listener?.remove()
        listener = null
        _items.value = emptyList()
        _loaded.value = false
    }

    fun markRead(item: Item) {
        if (!item.isUnread) return
        AppFirebase.db.collection("notifications").document(item.id).update("readAt", FieldValue.serverTimestamp())
    }

    private fun item(doc: QueryDocumentSnapshot): Item {
        @Suppress("UNCHECKED_CAST")
        val payload = doc.get("payload") as? Map<String, Any?> ?: emptyMap()
        return Item(
            id = doc.id,
            type = doc.getString("type") ?: "",
            fromHandle = payload["fromHandle"] as? String,
            cardId = payload["cardId"] as? String,
            preview = payload["preview"] as? String,
            noteId = payload["noteId"] as? String,
            count = (payload["count"] as? Number)?.toInt(),
            readAt = doc.getTimestamp("readAt")?.toDate(),
            createdAt = doc.getTimestamp("createdAt")?.toDate(),
        )
    }
}
