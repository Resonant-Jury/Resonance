package com.resonance.app

/**
 * What this install last told the server about its pushes — whose they are, the token, the
 * language they are written in and the app's version — so a cold start doesn't send the same
 * registration every time. It goes again when any of it changes, and at least once a [TTL_MS]
 * (the server may have dropped the device meanwhile: a token FCM refused, another account
 * signed in on this install elsewhere). Signing out forgets it. The twin of iOS's
 * PushRegistration.
 */
data class PushRegistration(
    val installationId: String,
    val uid: String,
    val token: String,
    val language: String,
    val version: String,
) {
    /** As kept on the device, with when it was sent. */
    fun encode(sentAt: Long): String = listOf(installationId, uid, token, language, version, sentAt.toString()).joinToString(SEPARATOR)

    companion object {
        const val TTL_MS = 24L * 60 * 60 * 1000
        private const val SEPARATOR = "\n"

        /** Whether [wanted] was sent (as [kept] says) recently enough not to send it again. */
        fun isFresh(kept: String?, wanted: PushRegistration, now: Long): Boolean {
            val parts = kept?.split(SEPARATOR) ?: return false
            if (parts.size != 6) return false
            val sentAt = parts[5].toLongOrNull() ?: return false
            val sent = PushRegistration(parts[0], parts[1], parts[2], parts[3], parts[4])
            // A clock set back counts as stale too.
            return sent == wanted && now >= sentAt && now - sentAt < TTL_MS
        }
    }
}
