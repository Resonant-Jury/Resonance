package com.resonance.app.thoughtmap

import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.resonance.app.AppFirebase
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await

/** A node document: a card on my map — where it sits (world units, top-left) and the region it's filed in. */
data class MapNodeDoc(val cardId: String, val x: Double, val y: Double, val groupId: String?)

/** An arrow document (`{source}_{target}`), with its optional words. */
data class MapEdgeDoc(val id: String, val sourceCardId: String, val targetCardId: String, val label: String)

/** A region document (分類): a titled, tinted box cards are filed into. */
data class MapGroupDoc(val id: String, val title: String, val hue: Double, val x: Double, val y: Double, val w: Double, val h: Double)

/** What a node shows of its card (the fields ThoughtMapNode reads). */
data class MapCard(
    val id: String,
    val authorId: String,
    val slug: String?,
    val title: String,
    val story: String,
    val tags: List<String>,
    val visibility: String,
    /** Epoch millis; null is a draft. */
    val publishedAt: Long?,
    val mediaUrl: String?,
    val accentHue: Double?,
)

/**
 * The thought map (thoughtMaps/{uid}/nodes|edges|groups), read and written
 * straight to Firestore like the web's client/thoughtMap.ts — the owner's own
 * documents, `isSelf` in the rules. Every function mirrors its web twin and
 * batches the same way. The twin of iOS's ThoughtMapService.
 */
class ThoughtMapService(private val uid: String) {
    private val db get() = AppFirebase.db
    private val map: DocumentReference get() = db.collection("thoughtMaps").document(uid)
    private val nodesCol get() = map.collection("nodes")
    private val edgesCol get() = map.collection("edges")
    private val groupsCol get() = map.collection("groups")

    data class Loaded(val nodes: List<MapNodeDoc>, val edges: List<MapEdgeDoc>, val groups: List<MapGroupDoc>)

    /** loadMyThoughtMap: the three collections in full (document-id order). */
    suspend fun load(): Loaded = coroutineScope {
        val n = async { nodesCol.get().await() }
        val e = async { edgesCol.get().await() }
        val g = async { groupsCol.get().await() }
        Loaded(
            nodes = n.await().documents.map { d ->
                MapNodeDoc(d.getString("cardId") ?: d.id, d.getDouble("x") ?: 0.0, d.getDouble("y") ?: 0.0, d.getString("groupId"))
            },
            edges = e.await().documents.map { d ->
                MapEdgeDoc(d.id, d.getString("sourceCardId") ?: "", d.getString("targetCardId") ?: "", d.getString("label") ?: "")
            },
            groups = g.await().documents.map { d ->
                MapGroupDoc(
                    d.id, d.getString("title") ?: "", d.getDouble("hue") ?: 55.0,
                    d.getDouble("x") ?: 0.0, d.getDouble("y") ?: 0.0, d.getDouble("w") ?: 320.0, d.getDouble("h") ?: 240.0,
                )
            },
        )
    }

    suspend fun addNode(cardId: String, x: Double, y: Double) {
        nodesCol.document(cardId).set(
            mapOf(
                "cardId" to cardId, "x" to x, "y" to y, "groupId" to null,
                "createdAt" to FieldValue.serverTimestamp(), "updatedAt" to FieldValue.serverTimestamp(),
            ),
        ).await()
    }

    suspend fun moveNode(cardId: String, x: Double, y: Double, groupId: String?) {
        nodesCol.document(cardId).update(
            mapOf("x" to x, "y" to y, "groupId" to groupId, "updatedAt" to FieldValue.serverTimestamp()),
        ).await()
    }

    /** setNodeGroups: re-file cards in one batch. */
    suspend fun setNodeGroups(changes: List<Pair<String, String?>>) {
        if (changes.isEmpty()) return
        val batch = db.batch()
        for ((cardId, groupId) in changes) {
            batch.update(nodesCol.document(cardId), mapOf("groupId" to groupId, "updatedAt" to FieldValue.serverTimestamp()))
        }
        batch.commit().await()
    }

    /** removeMapNode: the node and every arrow touching it (the card itself stays). */
    suspend fun removeNode(cardId: String) = coroutineScope {
        val out = async { edgesCol.whereEqualTo("sourceCardId", cardId).get().await() }
        val inn = async { edgesCol.whereEqualTo("targetCardId", cardId).get().await() }
        val batch = db.batch()
        batch.delete(nodesCol.document(cardId))
        for (d in out.await().documents + inn.await().documents) batch.delete(d.reference)
        batch.commit().await()
    }

    suspend fun createEdge(source: String, target: String, label: String = "") {
        if (source == target) return
        edgesCol.document(edgeId(source, target)).set(
            mapOf("sourceCardId" to source, "targetCardId" to target, "label" to label, "createdAt" to FieldValue.serverTimestamp()),
        ).await()
    }

    suspend fun updateEdgeLabel(id: String, label: String) {
        edgesCol.document(id).update("label", label).await()
    }

    suspend fun removeEdge(id: String) {
        edgesCol.document(id).delete().await()
    }

    suspend fun createGroup(title: String, hue: Double, x: Double, y: Double, w: Double, h: Double): String {
        val ref = groupsCol.document()
        ref.set(mapOf("title" to title, "hue" to hue, "x" to x, "y" to y, "w" to w, "h" to h, "createdAt" to FieldValue.serverTimestamp())).await()
        return ref.id
    }

    suspend fun updateGroup(id: String, patch: Map<String, Any?>) {
        groupsCol.document(id).update(patch).await()
    }

    /** A region moved with its cards: the web's two writes, here in one batch so they land together. */
    suspend fun moveGroup(id: String, x: Double, y: Double, members: List<Triple<String, Double, Double>>) {
        val batch = db.batch()
        batch.update(groupsCol.document(id), mapOf("x" to x, "y" to y))
        for ((cardId, mx, my) in members) {
            batch.update(nodesCol.document(cardId), mapOf("x" to mx, "y" to my, "updatedAt" to FieldValue.serverTimestamp()))
        }
        batch.commit().await()
    }

    /** removeMapGroup: the region goes, its cards stay on the map, unfiled. */
    suspend fun removeGroup(id: String) {
        val members = nodesCol.whereEqualTo("groupId", id).get().await()
        val batch = db.batch()
        batch.delete(groupsCol.document(id))
        for (d in members.documents) {
            batch.update(d.reference, mapOf("groupId" to null, "updatedAt" to FieldValue.serverTimestamp()))
        }
        batch.commit().await()
    }

    // The cards the map can hold (useMyThoughtMap)

    data class CardSet(val cards: Map<String, MapCard>, val resonated: Set<String>)

    /**
     * My own cards (getCardsByAuthor: the newest 40 published, and my drafts
     * read apart — the 40 last edited, newest first) and the originals I
     * resonated with (my latest 60 cards' references, each read under the
     * rules — one I can no longer read just isn't there).
     */
    suspend fun cards(): CardSet = coroutineScope {
        val cardsCol = db.collection("cards")
        val own = async { cardsCol.whereEqualTo("authorId", uid).orderBy("publishedAt", Query.Direction.DESCENDING).limit(OWN_LIMIT.toLong()).get().await() }
        // A draft's publishedAt is null, which sorts last in the read above: past 40 published
        // cards, every draft fell off the tray. Read them on their own (equality filters only, so
        // no composite index) and keep the most recently edited, as the web and /api/v1 do.
        val drafts = async { cardsCol.whereEqualTo("authorId", uid).whereEqualTo("publishedAt", null).limit(DRAFT_SCAN.toLong()).get().await() }
        val replies = async { cardsCol.whereEqualTo("authorId", uid).limit(60).get().await() }
        val refs = replies.await().documents.mapNotNull { it.getString("referenceCardId") }.distinct()
        val originals = refs.map { id -> async { attempt { card(cardsCol.document(id).get().await()) } } }.awaitAll().filterNotNull()
        val byId = LinkedHashMap<String, MapCard>()
        for (c in originals) byId[c.id] = c
        for (d in own.await().documents) card(d)?.takeIf { it.publishedAt != null }?.let { byId[it.id] = it }
        val recentDrafts = drafts.await().documents
            .sortedByDescending { it.getTimestamp("updatedAt")?.toDate()?.time ?: 0L }
            .take(OWN_LIMIT)
        // In this order: the store keeps drafts as they come (newest edit first).
        for (d in recentDrafts) card(d)?.let { byId[it.id] = it }
        CardSet(byId, originals.filter { it.authorId != uid }.map { it.id }.toSet())
    }

    /** Cards already on the map that the newest-40 read didn't bring (an older card placed long ago). */
    suspend fun cards(ids: List<String>): List<MapCard> = coroutineScope {
        val cardsCol = db.collection("cards")
        ids.map { id -> async { attempt { card(cardsCol.document(id).get().await()) } } }.awaitAll().filterNotNull()
    }

    private fun card(d: DocumentSnapshot): MapCard? {
        if (!d.exists()) return null
        val media = d.get("media") as? Map<*, *>
        return MapCard(
            id = d.id,
            authorId = d.getString("authorId") ?: "",
            slug = d.getString("slug"),
            title = d.getString("thoughtCore") ?: "",
            story = d.getString("story") ?: "",
            tags = (d.get("tags") as? List<*>)?.filterIsInstance<String>() ?: emptyList(),
            visibility = d.getString("visibility") ?: "public",
            publishedAt = d.getTimestamp("publishedAt")?.toDate()?.time,
            mediaUrl = if (media?.get("type") == "image") media["url"] as? String else null,
            accentHue = d.getDouble("accentHue"),
        )
    }

    /** A read that may be refused (a card I can no longer read) or fail: null then; a cancelled one still cancels. */
    private suspend fun <T> attempt(read: suspend () -> T): T? = try {
        read()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    companion object {
        fun edgeId(source: String, target: String) = "${source}_$target"

        /** A shelf's size (the web's BOX_LIMIT). */
        private const val OWN_LIMIT = 40
        /** How many drafts are read to find the most recently edited ones (DRAFT_SCAN). */
        private const val DRAFT_SCAN = 200
    }
}
