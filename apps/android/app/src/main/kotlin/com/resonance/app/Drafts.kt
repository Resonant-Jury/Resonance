package com.resonance.app

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.tasks.await

/** A draft's editable fields — CardEditor's DraftValues. */
data class DraftValues(
    val title: String = "",
    val story: String = "",
    val tags: List<String> = emptyList(),
    val visibility: String = "public",
    val anonymous: Boolean = false,
    /** The cover: its public URL and label (media {type: image} on the web). */
    val imageUrl: String? = null,
    val imageLabel: String? = null,
    /** The cover's hue snapped to the card palette; null keeps the position colour. */
    val accentHue: Double? = null,
) {
    /** Nothing written yet — autosave doesn't create a document for it (isEmptyDraft). */
    val isEmpty: Boolean get() = title.isBlank() && story.isBlank() && tags.isEmpty() && imageUrl == null
}

/**
 * Drafts, written straight to Firestore like the web editor's client
 * (lib/db/firestore/client/cards.ts: createCardDraft, updateCardDraft) — the
 * author's own documents under the same rules. Publishing is the server's
 * (WritingApi.publish), since it reaches other people. The twin of iOS's DraftService.
 */
class DraftService(private val uid: String) {
    private val cards get() = AppFirebase.db.collection("cards")

    private fun fields(v: DraftValues): MutableMap<String, Any?> = mutableMapOf(
        "thoughtCore" to v.title,
        "story" to v.story,
        "tags" to v.tags,
        "visibility" to v.visibility,
        "anonymous" to v.anonymous,
    )

    private fun media(v: DraftValues): Map<String, String>? = v.imageUrl?.let { mapOf("type" to "image", "url" to it, "label" to (v.imageLabel ?: "")) }

    /** createCardDraft: a new, unpublished card with zeroed counters. */
    suspend fun create(v: DraftValues, locale: String, referenceCardId: String?): String {
        val data = fields(v)
        media(v)?.let { data["media"] = it }
        v.accentHue?.let { data["accentHue"] = it }
        referenceCardId?.let { data["referenceCardId"] = it }
        data += mapOf(
            "authorId" to uid,
            "originalLocale" to locale,
            "translations" to emptyMap<String, Any>(),
            "publishedAt" to null,
            "readCount" to 0,
            "resonanceCount" to 0,
            "inviteCount" to 0,
            "createdAt" to FieldValue.serverTimestamp(),
            "updatedAt" to FieldValue.serverTimestamp(),
        )
        val ref = cards.document()
        ref.set(data).await()
        return ref.id
    }

    /** updateCardDraft: the fields as they are now (a removed cover clears media and its hue). */
    suspend fun update(id: String, v: DraftValues) {
        val data = fields(v)
        data["media"] = media(v) ?: FieldValue.delete()
        data["accentHue"] = v.accentHue
        data["updatedAt"] = FieldValue.serverTimestamp()
        cards.document(id).set(data, SetOptions.merge()).await()
    }
}
