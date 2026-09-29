package com.resonance.app

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import kotlinx.coroutines.tasks.await
import java.util.Date

/**
 * Report and block, written straight to Firestore under the same rules the
 * web's client uses (lib/db/firestore/client/reports.ts, blocks.ts): reports
 * are create-only; the block list is owner-only, and blocking also ends the
 * connection and withdraws the blocker's pending invites. The twin of iOS's
 * SafetyService.
 */
class SafetyService(private val uid: String) {
    enum class Reason(val key: String) { Spam("spam"), Harassment("harassment"), Hate("hate"), Sexual("sexual"), SelfHarm("self_harm"), Violence("violence"), Other("other") }

    sealed interface Target {
        val userId: String
        val fields: Map<String, Any>

        data class Card(val id: String, val authorId: String) : Target {
            override val userId get() = authorId
            override val fields get() = mapOf("targetType" to "card", "targetId" to id, "targetUserId" to authorId)
        }
        data class User(val id: String) : Target {
            override val userId get() = id
            override val fields get() = mapOf("targetType" to "user", "targetId" to id, "targetUserId" to id)
        }
        /** A conversation, reported from its ⋯: its pair id names it, and the other person is who is reported. */
        data class Message(val id: String, val senderId: String, val conversationId: String) : Target {
            override val userId get() = senderId
            override val fields get() = mapOf("targetType" to "message", "targetId" to id, "targetUserId" to senderId, "contextId" to conversationId)
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
        val data = target.fields + mapOf(
            "reporterId" to uid,
            "reason" to reason.key,
            "detail" to detail.trim().take(DETAIL_MAX),
            "createdAt" to FieldValue.serverTimestamp(),
            "status" to "open",
        )
        db.collection("reports").add(data).await()
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
    suspend fun blocked(): List<BlockedPerson> {
        val snap = db.collection("users").document(uid).collection("blocks")
            .orderBy("createdAt", Query.Direction.DESCENDING).get().await()
        return snap.documents.map { doc ->
            val user = runCatching { db.collection("users").document(doc.id).get().await() }.getOrNull()
            BlockedPerson(
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
    }

    companion object {
        /** Mirrors the cap in firestore.rules. */
        const val DETAIL_MAX = 1000
    }
}
