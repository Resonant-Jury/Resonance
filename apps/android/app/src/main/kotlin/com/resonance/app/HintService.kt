package com.resonance.app

import android.content.SharedPreferences
import kotlin.math.max
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await

/**
 * The web's first-time hints (lib/hints.ts): a hint shows for its first
 * three displays, then stays quiet. The count lives on the device
 * (`hint:{key}`, as the web's localStorage) and is mirrored to the profile's
 * `hintsSeen` map, so a hint seen on the web counts here too. The twin of
 * iOS's HintService.
 */
class HintService(private val uid: String, private val prefs: SharedPreferences) {
    /** Whether to show the hint this time — asking counts as one display. */
    suspend fun claim(key: String): Boolean {
        val localKey = "hint:$key"
        val user = AppFirebase.db.collection("users").document(uid)
        val seen = try {
            user.get().await().get("hintsSeen") as? Map<*, *>
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        val count = max(prefs.getInt(localKey, 0), (seen?.get(key) as? Number)?.toInt() ?: 0)
        if (count >= LIMIT) return false
        prefs.edit().putInt(localKey, count + 1).apply()
        // Best effort, like syncHintCount: the device's count still governs here.
        try {
            user.update("hintsSeen.$key", count + 1).await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Offline, or no profile document yet.
        }
        return true
    }

    companion object {
        /** HINT_LIMIT. */
        const val LIMIT = 3
    }
}
