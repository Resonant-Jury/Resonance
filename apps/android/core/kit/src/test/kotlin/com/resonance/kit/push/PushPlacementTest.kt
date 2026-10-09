package com.resonance.kit.push

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * A push the app draws itself (it arrived while the app was open) lands where the system would have
 * put it: the server's channel and tag (src/lib/push/picks.ts, connectionCards.ts, ring.ts).
 */
class PushPlacementTest {
    @Test fun tonightsCardReplacesTheLastOneInPicks() {
        val data = mapOf("type" to "pick", "cardId" to "c1", "route" to "/card/rain-walk")
        assertEquals(PushPlacement("picks", "picks"), PushPlacement.of(data))
    }

    @Test fun aConnectionsNewCardIsItsOwnInPicks() {
        val data = mapOf("type" to "new_card", "cardId" to "c2", "route" to "/card/dawn-bus-stop")
        assertEquals(PushPlacement("picks", "card-c2"), PushPlacement.of(data))
        // Two new cards are two notifications.
        assertEquals("card-c3", PushPlacement.of(data + ("cardId" to "c3")).tag)
    }

    @Test fun aBellRowsPushStaysInActivityTaggedByItsRow() {
        assertEquals(PushPlacement("activity", "n1"), PushPlacement.of(mapOf("route" to "/card/x", "notificationId" to "n1")))
        assertEquals(PushPlacement("activity", "n2"), PushPlacement.of(mapOf("type" to "note", "notificationId" to "n2")))
        // An empty id names no row.
        assertEquals(PushPlacement("activity", null), PushPlacement.of(mapOf("notificationId" to "")))
        // A kind this build doesn't know yet goes where every push used to.
        assertEquals("activity", PushPlacement.of(mapOf("type" to "something_new")).channelId)
    }
}
