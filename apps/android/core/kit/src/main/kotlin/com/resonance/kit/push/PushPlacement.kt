package com.resonance.kit.push

/**
 * Where a push the app draws itself goes in the shade — one that arrives while the app is open,
 * which FCM hands to the app instead of showing — so it lands where the system would have put the
 * same push with the app closed (the server's `android.notification`: its channel and tag).
 *
 * A bell row's push goes to `activity`, tagged by its row, so the same push never shows twice. The
 * pushes a person asked for in Settings → Notifications go to `picks`: tonight's card (`type: pick`)
 * replaces the last evening's (tag `picks`), and a connection's new card (`type: new_card`) is its
 * own (`card-{cardId}`). The twin of the server's src/lib/push/picks.ts and connectionCards.ts.
 */
data class PushPlacement(val channelId: String, val tag: String?) {
    companion object {
        /** The bell's pushes (and any kind this build doesn't know). */
        const val ACTIVITY_CHANNEL = "activity"
        /** The pushes a person turned on: tonight's card and connections' new cards. */
        const val PICKS_CHANNEL = "picks"
        const val TYPE_PICK = "pick"
        const val TYPE_NEW_CARD = "new_card"

        /** The placement of a push whose `data` is [data]. */
        fun of(data: Map<String, String>): PushPlacement = when (data["type"]) {
            TYPE_PICK -> PushPlacement(PICKS_CHANNEL, PICKS_CHANNEL)
            TYPE_NEW_CARD -> PushPlacement(PICKS_CHANNEL, data["cardId"]?.takeIf { it.isNotBlank() }?.let { "card-$it" } ?: data["route"])
            // An empty id (older servers sent "") names no row.
            else -> PushPlacement(ACTIVITY_CHANNEL, data["notificationId"]?.takeIf { it.isNotEmpty() })
        }
    }
}
