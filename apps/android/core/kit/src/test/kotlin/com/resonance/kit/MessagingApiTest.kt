package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.MessagingApi
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Notes and messages go through the contract; the server's refusals surface as ApiFailure. */
class MessagingApiTest {
    private val server = MockWebServer()
    private fun api() = MessagingApi(ApiConfiguration(server.url("/").toString()) { "token" })

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun sendsANoteToTheCard() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json").setBody("""{"id":"n1"}"""))
        assertEquals("n1", api().sendNote("walk", "thank you"))
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/notes", request.path)
        assertEquals("Bearer token", request.getHeader("Authorization"))
        val sent = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertEquals("walk", sent["cardId"]!!.jsonPrimitive.content)
        assertEquals("thank you", sent["text"]!!.jsonPrimitive.content)
    }

    @Test fun sendsAMessageAndAnswersItsConversation() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json")
                .setBody("""{"conversationId":"alice_bob","id":"m1"}"""),
        )
        val id = api().sendMessage("bob", "hi", noteRef = MessagingApi.Note("walk", "n1"))
        assertEquals("alice_bob", id)
        val request = server.takeRequest()
        assertEquals("/api/v1/messages", request.path)
        val sent = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertEquals("bob", sent["to"]!!.jsonPrimitive.content)
        assertEquals("hi", sent["text"]!!.jsonPrimitive.content)
        val note = sent["noteRef"]!!.jsonObject
        assertEquals("walk", note["cardId"]!!.jsonPrimitive.content)
        assertEquals("n1", note["noteId"]!!.jsonPrimitive.content)
        // Kotlin clients send an absent optional as null (the contract accepts it).
        assertTrue(sent["cardRef"] == null || sent["cardRef"] is JsonNull)
    }

    @Test fun aBlockIsAFailureWithItsMessage() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(403).setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"blocked","message":"You cannot message this person."}}"""),
        )
        val failure = assertFailsWith<ApiFailure> { api().sendMessage("bob", "hi") }
        assertEquals(403, failure.status)
        assertEquals("You cannot message this person.", failure.message)
    }
}
