package com.resonance.app

import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.tasks.await

/**
 * Bookmarks (收藏), written straight to Firestore like the web's client
 * (lib/db/firestore/client/bookmarks.ts): users/{uid}/bookmarks/{cardId},
 * owner-only, never counted and never notified. The twin of iOS's BookmarkService.
 */
class BookmarkService(private val uid: String) {
    private fun ref(cardId: String) = AppFirebase.db.collection("users").document(uid).collection("bookmarks").document(cardId)

    suspend fun isBookmarked(cardId: String): Boolean = ref(cardId).get().await().exists()

    /** Flips the bookmark (the doc id is the card id, so it is idempotent); returns the new state. */
    suspend fun toggle(cardId: String): Boolean {
        val doc = ref(cardId)
        if (doc.get().await().exists()) {
            doc.delete().await()
            return false
        }
        doc.set(mapOf("cardId" to cardId, "createdAt" to FieldValue.serverTimestamp())).await()
        return true
    }
}
