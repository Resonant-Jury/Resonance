package com.resonance.kit.chat

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The data of a chat push, as the server sends it. */
class ChatPushTest {
    private val data = mapOf(
        "type" to "message", "conversationId" to "alice_bob", "messageId" to "m1", "fromUserId" to "bob", "fromHandle" to "bob",
        "title" to "bob", "body" to "hello", "route" to "/messages/bob", "sentAt" to "1790000000000",
    )

    @Test fun readsTheKeysTheServerSends() {
        assertEquals(ChatPush("alice_bob", "m1", "bob", "bob", "hello", "/messages/bob", 1_790_000_000_000), ChatPush.from(data))
    }

    @Test fun anotherTypeOrNoConversationIsNoChatPush() {
        assertNull(ChatPush.from(data + ("type" to "resonance")))
        assertNull(ChatPush.from(data - "type"))
        assertNull(ChatPush.from(data - "conversationId"))
        assertNull(ChatPush.from(data + ("conversationId" to " ")))
        assertNull(ChatPush.from(data - "title"))
    }

    @Test fun theNotificationPayloadFillsWhatTheDataLacks() {
        val old = data - "title" - "body" - "sentAt"
        val push = ChatPush.from(old, fallbackTitle = "bob", fallbackBody = "hello", now = 5)!!
        assertEquals("bob", push.title)
        assertEquals("hello", push.body)
        assertEquals(5L, push.sentAt)
    }

    @Test fun aBadTimeIsNow() {
        assertEquals(7L, ChatPush.from(data + ("sentAt" to "soon"), now = 7)!!.sentAt)
        assertEquals(7L, ChatPush.from(data + ("sentAt" to "0"), now = 7)!!.sentAt)
    }

    @Test fun aCardAloneStillHasABody() {
        assertEquals("Shared a card", ChatPush.from(data + ("body" to "Shared a card"))!!.body)
        assertEquals("", ChatPush.from(data - "body")!!.body)
    }
}
