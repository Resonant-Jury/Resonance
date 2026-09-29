package com.resonance.app

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.CancellationException
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
 * Also opens a card of yours for editing, keeps a published card's pending
 * edit, and does the card box's own changes (visibility, delete).
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

    // Opening a card to edit

    /**
     * A card of yours as the editor opens it (write/[id]/page.tsx): a draft
     * with its own fields, or a published card with its pending edit when
     * there is one — buffered edits win over the live fields.
     */
    data class OpenedCard(
        val id: String,
        val values: DraftValues,
        val isPublished: Boolean,
        val slug: String?,
        val referenceCardId: String?,
        val hasPendingEdit: Boolean,
    ) {
        /** Where it lives once published: the slug, or the id. */
        val routeKey: String get() = slug ?: id
    }

    /** Your card by id, or null when it is missing or someone else's (rules deny → null). */
    suspend fun open(id: String): OpenedCard? {
        val data = attempt { cards.document(id).get().await() }?.data ?: return null
        if (data["authorId"] != uid) return null
        val isPublished = data["publishedAt"] is Timestamp
        val buffered = if (isPublished) attempt { editRef(id).get().await() }?.data else null
        return OpenedCard(
            id = id,
            values = values(buffered ?: data),
            isPublished = isPublished,
            slug = data["slug"] as? String,
            referenceCardId = data["referenceCardId"] as? String,
            hasPendingEdit = buffered != null,
        )
    }

    private fun values(d: Map<String, Any?>): DraftValues {
        val media = d["media"] as? Map<*, *>
        return DraftValues(
            title = d["thoughtCore"] as? String ?: "",
            story = d["story"] as? String ?: "",
            tags = (d["tags"] as? List<*>)?.filterIsInstance<String>() ?: emptyList(),
            visibility = d["visibility"] as? String ?: "public",
            anonymous = d["anonymous"] as? Boolean ?: false,
            imageUrl = media?.get("url") as? String,
            imageLabel = media?.get("label") as? String,
            accentHue = (d["accentHue"] as? Number)?.toDouble(),
        )
    }

    /** A read that may be refused or fail: null then (a cancelled one still cancels). */
    private suspend fun <T> attempt(read: suspend () -> T): T? = try {
        read()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    // Pending edits (lib/db/firestore/client/cardEdits.ts)

    private fun editRef(id: String): DocumentReference = cards.document(id).collection("edits").document("current")

    /**
     * savePendingCardEdit: a published card autosaves its whole working copy
     * here (owner-only), never onto the card readers are looking at. A full
     * replace, not a merge — the cover is simply absent when there is none.
     */
    suspend fun saveEdit(id: String, v: DraftValues) {
        val data = fields(v)
        media(v)?.let { data["media"] = it }
        data["accentHue"] = v.accentHue
        data["updatedAt"] = FieldValue.serverTimestamp()
        editRef(id).set(data).await()
    }

    /** discardPendingCardEdit: the live card is left exactly as it was. */
    suspend fun discardEdit(id: String) {
        editRef(id).delete().await()
    }

    // The card box's ⋯ (CardActionsMenu)

    /** 轉為公開／私人: the card's visibility alone. */
    suspend fun setVisibility(id: String, visibility: String) {
        cards.document(id).set(mapOf("visibility" to visibility, "updatedAt" to FieldValue.serverTimestamp()), SetOptions.merge()).await()
    }

    /** deleteCardDraft — drafts and published cards alike. */
    suspend fun delete(id: String) {
        cards.document(id).delete().await()
    }

    // Reads of your own cards

    /** getMyResonanceCard: your card (draft or published) answering this one, if any. Throws when the lookup fails. */
    suspend fun myResonance(cardId: String): String? =
        cards.whereEqualTo("authorId", uid).whereEqualTo("referenceCardId", cardId).limit(1).get().await().documents.firstOrNull()?.id

    /**
     * hasAnyOwnCards: whether you have written anything at all (drafts count).
     * A failed read counts as "has written": the guide is for newcomers only.
     */
    suspend fun hasAnyCards(): Boolean =
        attempt { cards.whereEqualTo("authorId", uid).limit(1).get().await().isEmpty.not() } ?: true
}
