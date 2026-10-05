package com.resonance.kit.reading

import com.resonance.kit.l10n.L10n
import java.net.SocketException
import java.net.UnknownHostException

/**
 * Why a refresh asked for by hand (a pull, the Refresh action) brought nothing back while there was
 * something on screen: the phone is offline, or anything else (the server). What was on screen
 * stays, and a quiet line over it says this. The twin of iOS's RefreshFailure.
 */
enum class RefreshFailure {
    Offline,
    Failed;

    /** What the screen says, quietly, over what it kept. */
    val message: String get() = if (this == Offline) L10n.Native.offline else L10n.Native.loadError

    companion object {
        /** The failure [error] makes of a refresh: [Offline] when it was the network ([isOffline]), else [Failed]. */
        fun of(error: Throwable?): RefreshFailure = if (isOffline(error)) Offline else Failed

        /**
         * Whether [error] — or what it wraps — is the phone being offline: no name could be looked up
         * (no network), or no connection could be made or kept (`ConnectException`, a reset, no route).
         * A server that answered, or one that took too long, is not (a timeout is the server's, as on iOS).
         */
        fun isOffline(error: Throwable?): Boolean {
            var e = error
            var depth = 0
            while (e != null && depth++ < 8) {
                if (e is UnknownHostException || e is SocketException) return true
                e = e.cause
            }
            return false
        }
    }
}
