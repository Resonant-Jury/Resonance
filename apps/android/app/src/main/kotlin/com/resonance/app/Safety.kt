package com.resonance.app

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.resonance.kit.api.SafetyApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await
import java.util.Date

/**
 * Report and block. Reports go through the API, which keeps a copy of what
 * was reported beside each one and fills in a card's author (so anonymous
 * cards can be reported too). Blocks are written straight to Firestore under
 * the same rules the web's client uses (lib/db/firestore/client/blocks.ts):
 * the block list is owner-only, and blocking also ends the connection and
 * withdraws the blocker's pending invites. The twin of iOS's SafetyService.
 */
class SafetyService(private val uid: String, private val api: SafetyApi) {
    enum class Reason(val key: String) { Spam("spam"), Harassment("harassment"), Hate("hate"), Sexual("sexual"), SelfHarm("self_harm"), Violence("violence"), Other("other") }

    sealed interface Target {
        /** Who a block would apply to; null for an anonymous card (the app never learns its author). */
        val userId: String?

        data class Card(val id: String, val authorId: String?) : Target {
            override val userId get() = authorId
        }
        data class User(val id: String) : Target {
            override val userId get() = id
        }
        /** A conversation, reported from its ⋯: its pair id names it, and the other person is who is reported. */
        data class Message(val id: String, val senderId: String, val conversationId: String) : Target {
            override val userId get() = senderId
        }
    }

    data class BlockedPerson(
        val id: String,
        val handle: String?,
        val initials: String,
        val since: Date?,
        val avatarUrl: String? = null,
        val accentColor: String? = null,
        val avatarSeed: Double? = null,
    )

    private val db get() = AppFirebase.db

    suspend fun report(target: Target, reason: Reason, detail: String) {
        val text = detail.trim().take(DETAIL_MAX)
        when (target) {
            is Target.Card -> api.reportCard(target.id, reason.key, text)
            is Target.User -> api.reportUser(target.id, reason.key, text)
            // The server finds who sent it (the conversation's other person, for the whole of it).
            is Target.Message -> api.reportMessage(target.id, target.conversationId, reason.key, text)
        }
    }

    suspend fun block(other: String) {
        if (other == uid) return
        // The block goes first: once it exists the rules refuse any new contact,
        // so the cleanup below can't race a fresh connection.
        db.collection("users").document(uid).collection("blocks").document(other)
            .set(mapOf("blockedUid" to other, "createdAt" to FieldValue.serverTimestamp())).await()
        val pair = if (uid < other) "${uid}_$other" else "${other}_$uid"
        val connection = db.collection("connections").document(pair)
        if (connection.get().await().exists()) connection.delete().await()
        val pending = db.collection("invites")
            .whereEqualTo("fromUserId", uid)
            .whereEqualTo("toUserId", other)
            .whereEqualTo("status", "pending")
            .get().await()
        for (invite in pending.documents) invite.reference.update("status", "withdrawn").await()
    }

    suspend fun unblock(other: String) {
        db.collection("users").document(uid).collection("blocks").document(other).delete().await()
    }

    /** The block list, newest first, with each person's current name (a deleted account shows as such). */
    suspend fun blocked(): List<BlockedPerson> = coroutineScope {
        val snap = db.collection("users").document(uid).collection("blocks")
            .orderBy("createdAt", Query.Direction.DESCENDING).get().await()
        // Everyone's profile at once, the list keeping its order.
        snap.documents.map { doc -> async { person(doc) } }.awaitAll()
    }

    private suspend fun person(doc: DocumentSnapshot): BlockedPerson {
        val user = try {
            db.collection("users").document(doc.id).get().await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        return BlockedPerson(
            id = doc.id,
            handle = user?.getString("handle"),
            initials = user?.getString("initials") ?: "·",
            since = doc.getTimestamp("createdAt")?.toDate(),
            avatarUrl = user?.getString("avatarUrl"),
            accentColor = user?.getString("accentColor"),
            // Stored as text by the web's signup, as a number by older seeds.
            avatarSeed = (user?.get("avatarSeed") as? Number)?.toDouble() ?: user?.getString("avatarSeed")?.toDoubleOrNull(),
        )
    }

    companion object {
        /** The contract's cap on a report's details (REPORT_DETAIL_MAX). */
        const val DETAIL_MAX = 1000
    }
}
