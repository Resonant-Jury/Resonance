package com.resonance.kit.chat

import com.resonance.kit.chat.MessageHistory.Entry
import com.resonance.kit.chat.Outbox.Outgoing
import com.resonance.kit.chat.Outbox.Status
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * What the thread draws while messages are on their way: the conversation first, then the
 * messages this person sent, each replaced in place — same position, same key — by its document.
 */
class ThreadMessagesTest {
    private val history = MessageHistory<String>(liveLimit = 50)
    private val thread = ThreadMessages()

    private fun doc(id: String, at: Long, sender: String = "bob", text: String = id) =
        Entry(ChatMessage(id, sender, text, Date(at)), "cursor-$id")

    private fun sending(clientId: String, at: Long, status: Status = Status.Queued, serverId: String? = null, replyTo: ReplyQuote? = null) =
        Outgoing(clientId, "alice", "text of $clientId", null, null, replyTo, Date(at), status, serverId)

    @Test fun whatIsOnItsWayComesAfterTheConversation() {
        history.mergeWindow(listOf(doc("m1", 1_000), doc("m2", 2_000)))
        val list = thread.build(history, listOf(sending("c1", 500), sending("c2", 600)))
        // Even sent "before" (a clock behind the server's): the thread is read downwards, the bottom is the latest thing you did.
        assertEquals(listOf("m1", "m2", "c1", "c2"), list.map { it.key })
        assertEquals(listOf(Delivery.Delivered, Delivery.Delivered, Delivery.Sending, Delivery.Sending), list.map { it.delivery })
        assertEquals("text of c1", list[2].text)
        assertEquals("alice", list[2].senderId)
    }

    @Test fun theDocumentTakesTheMessagesPlaceUnderTheSameKey() {
        history.mergeWindow(listOf(doc("m1", 1_000)))
        val before = thread.build(history, listOf(sending("c1", 2_000, Status.Sending)))
        assertEquals(listOf("m1", "c1"), before.map { it.key })

        // The server used the client id as the document's id (and the answer hasn't come yet).
        history.mergeWindow(listOf(doc("c1", 2_100, sender = "alice", text = "text of c1"), doc("m1", 1_000)))
        val after = thread.build(history, listOf(sending("c1", 2_000, Status.Sending)))
        assertEquals(listOf("m1", "c1"), after.map { it.key })
        assertEquals(Delivery.Delivered, after[1].delivery)
        assertEquals(1, after.count { it.text == "text of c1" })
    }

    @Test fun aServerThatNamesTheDocumentItselfStillKeepsTheRowsKey() {
        history.mergeWindow(listOf(doc("m1", 1_000)))
        // The answer arrived first: the outbox knows the document's id.
        val onItsWay = listOf(sending("c1", 2_000, Status.Sent, serverId = "server-1"))
        assertEquals(listOf("m1", "c1"), thread.build(history, onItsWay).map { it.key })
        assertEquals(Delivery.Sent, thread.build(history, onItsWay)[1].delivery)

        history.mergeWindow(listOf(doc("server-1", 2_100, sender = "alice"), doc("m1", 1_000)))
        val after = thread.build(history, onItsWay)
        assertEquals(listOf("m1", "c1"), after.map { it.key })
        assertEquals(listOf("m1", "server-1"), after.map { it.id })
        // The key stays once the outbox has let go of the message.
        assertEquals(listOf("m1", "c1"), thread.build(history, emptyList()).map { it.key })
    }

    @Test fun aFailedMessageStaysWithItsReplyUntilItIsRetriedOrDiscarded() {
        history.mergeWindow(listOf(doc("m1", 1_000)))
        val quote = ReplyQuote("m1", "bob", "m1")
        val list = thread.build(history, listOf(sending("c1", 2_000, Status.Failed, replyTo = quote)))
        assertEquals(Delivery.Failed, list[1].delivery)
        assertEquals(quote, list[1].replyTo)
        assertEquals(false, list[1].canReply)
    }

    @Test fun nothingOnItsWayIsTheHistoryAsItIs() {
        history.mergeWindow(listOf(doc("m1", 1_000), doc("m2", 2_000)))
        assertEquals(history.messages, thread.build(history, emptyList()))
    }

    @Test fun clearForgetsTheKeysOfDocumentsWithIdsOfTheirOwn() {
        history.mergeWindow(listOf(doc("server-1", 2_000, sender = "alice")))
        thread.build(history, listOf(sending("c1", 1_500, Status.Sent, serverId = "server-1")))
        thread.clear()
        assertEquals(listOf("server-1"), thread.build(history, emptyList()).map { it.key })
    }
}
