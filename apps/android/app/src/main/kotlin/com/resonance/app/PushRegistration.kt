package com.resonance.app

/**
 * What this install last told the server about its pushes — whose they are, the token, the
 * language they are written in, the app's version, what this build does with a push
 * ([PushCenter.CAPABILITIES]) and the device's time zone — so a cold start doesn't send the same
 * registration every time. It goes again when any of it changes (a trip to another zone too), and
 * at least once a [TTL_MS] (the server may have dropped the device meanwhile: a token FCM refused,
 * another account signed in on this install elsewhere). Signing out forgets it. The twin of iOS's
 * PushRegistration.
 */
data class PushRegistration(
    val installationId: String,
    val uid: String,
    val token: String,
    val language: String,
    val version: String,
    /** What this build does with a push beyond showing it, comma-separated (`chat-push`). */
    val capabilities: String = "",
    /** The device's time zone, an IANA name (`Asia/Taipei`). */
    val timeZone: String = "",
) {
    /** As kept on the device, with when it was sent. */
    fun encode(sentAt: Long): String =
        listOf(installationId, uid, token, language, version, capabilities, timeZone, sentAt.toString()).joinToString(SEPARATOR)

    companion object {
        const val TTL_MS = 24L * 60 * 60 * 1000
        private const val SEPARATOR = "\n"

        /** Whether [wanted] was sent (as [kept] says) recently enough not to send it again. */
        fun isFresh(kept: String?, wanted: PushRegistration, now: Long): Boolean {
            val parts = kept?.split(SEPARATOR) ?: return false
            // One kept by a build before capabilities (six parts) or the time zone (seven) is sent again,
            // which tells the server what this build can do and where the device is.
            if (parts.size != 8) return false
            val sentAt = parts[7].toLongOrNull() ?: return false
            val sent = PushRegistration(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6])
            // A clock set back counts as stale too.
            return sent == wanted && now >= sentAt && now - sentAt < TTL_MS
        }
    }
}
