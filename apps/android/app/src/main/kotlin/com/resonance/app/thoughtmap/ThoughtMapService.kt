package com.resonance.app.thoughtmap

import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.resonance.api.models.FeedCard
import com.resonance.app.AppFirebase
import com.resonance.app.FirestoreFailure
import com.resonance.kit.api.ReadingApi
import java.time.OffsetDateTime
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
    /** Empty for someone else's anonymous card: the server never names its author. */
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
 * batches the same way. Its cards are read under the rules too, except those
 * the rules keep from me (someone else's anonymous card I resonated with),
 * which the server answers for (`reading`). The twin of iOS's ThoughtMapService.
 */
class ThoughtMapService(val uid: String, private val reading: ReadingApi) {
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
     * resonated with (my latest 60 cards' references: see [cards] by id — one
     * I can no longer read just isn't there).
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
        val originals = cards(refs)
        val published = own.await().documents.mapNotNull { d -> card(d)?.takeIf { it.publishedAt != null } }
        val recentDrafts = drafts.await().documents
            .sortedByDescending { it.getTimestamp("updatedAt")?.toDate()?.time ?: 0L }
            .take(OWN_LIMIT)
            .mapNotNull(::card)
        cardSet(uid, originals, published, recentDrafts)
    }

    /**
     * One card as it is now: null when it is gone, or no longer readable by me (deleted, made
     * private); a read that failed for now throws. Someone else's anonymous card, which the rules
     * keep from me, comes from the server.
     */
    suspend fun card(id: String): MapCard? = readCard(
        id,
        read = { card(db.collection("cards").document(it).get().await()) },
        refused = FirestoreFailure::isGone,
        summaries = reading::cards,
    )

    /**
     * Cards by id: the originals I resonated with, or cards already on the map that the newest-40
     * read didn't bring (an older card placed long ago). See [readCards].
     */
    suspend fun cards(ids: List<String>): List<MapCard> {
        val cardsCol = db.collection("cards")
        return readCards(ids, read = { id -> attempt { card(cardsCol.document(id).get().await()) } }, summaries = reading::cards)
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

        /**
         * The cards the map can hold, by id: the originals I resonated with first, so my own card
         * by the same id (one answering itself) keeps its own entry; then my published cards and
         * drafts, in that order (the store keeps drafts as they come: newest edit first). The
         * originals someone else wrote — an anonymous one, whose author I never learn, included —
         * are the resonated ones.
         */
        fun cardSet(uid: String, originals: List<MapCard>, published: List<MapCard>, drafts: List<MapCard>): CardSet {
            val byId = LinkedHashMap<String, MapCard>()
            for (c in originals + published + drafts) byId[c.id] = c
            return CardSet(byId, originals.filter { it.authorId != uid }.map { it.id }.toSet())
        }

        /**
         * Cards by id, in that order: each read under the rules (`read`: null when refused or
         * failed), and the ones that didn't come asked of the server in one go (GET /cards?keys=),
         * which answers for someone else's anonymous card without its author. One neither gives
         * isn't there; should the server fail, those are left out this time (the map keeps their
         * places), as the web's useMyThoughtMap does.
         */
        suspend fun readCards(
            ids: List<String>,
            read: suspend (String) -> MapCard?,
            summaries: suspend (List<String>) -> List<FeedCard>,
        ): List<MapCard> = coroutineScope {
            val wanted = ids.distinct()
            val found = wanted.map { id -> async { read(id) } }.awaitAll().filterNotNull().associateBy { it.id }.toMutableMap()
            val unread = wanted.filter { it !in found }
            if (unread.isNotEmpty()) {
                val served = try {
                    summaries(unread)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    emptyList()
                }
                for (c in served) if (c.id in unread) found[c.id] = mapCard(c)
            }
            wanted.mapNotNull { found[it] }
        }

        /**
         * One card by id, read under the rules (`read`: null when there's no such card). One the
         * rules refuse (`refused`) is asked of the server, which answers for someone else's
         * anonymous card and leaves out one I may no longer see. Null when it is gone; a read that
         * failed for now throws.
         */
        suspend fun readCard(
            id: String,
            read: suspend (String) -> MapCard?,
            refused: (Exception) -> Boolean,
            summaries: suspend (List<String>) -> List<FeedCard>,
        ): MapCard? {
            try {
                return read(id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (!refused(e)) throw e
            }
            return summaries(listOf(id)).firstOrNull { it.id == id }?.let(::mapCard)
        }

        /**
         * What a node shows of a card the server listed (the web's summaryCard): its excerpt stands
         * in for the story, and an anonymous card names no author.
         */
        fun mapCard(c: FeedCard) = MapCard(
            id = c.id,
            authorId = c.author?.id ?: "",
            slug = c.slug,
            title = c.title,
            story = c.excerpt,
            tags = c.tags,
            visibility = c.visibility.value,
            publishedAt = c.publishedAt?.let { runCatching { OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull() },
            mediaUrl = c.imageUrl,
            accentHue = c.accentHue,
        )

        /** A shelf's size (the web's BOX_LIMIT). */
        private const val OWN_LIMIT = 40
        /** How many drafts are read to find the most recently edited ones (DRAFT_SCAN). */
        private const val DRAFT_SCAN = 200
    }
}
