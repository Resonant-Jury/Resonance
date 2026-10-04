package com.resonance.kit.chat

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.MessagingApi
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import java.io.IOException
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * A note is sent under one client id from the first press of Send until it is left: a retry of
 * the same words (by hand, or a request sent again) reuses it, so the server can tell a note
 * whose answer was lost from a second one; other words, another card, or the next note after one
 * was left get ids of their own.
 */
class NoteAttemptTest {
    private val server = MockWebServer()
    private var token = "token"
    private fun api() = MessagingApi(ApiConfiguration(server.url("/").toString()) { refresh -> if (refresh) "fresh" else token })

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    private fun answer(code: Int, body: String) = MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)
    private fun sentClientId(): String = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject["clientId"]!!.jsonPrimitive.content
    private val contract = Regex("^[A-Za-z0-9_-]{16,64}$")

    @Test fun aRetryOfTheSameWordsGoesUnderTheSameIdUntilTheNoteIsLeft() = runBlocking {
        val attempt = NoteAttempt()
        val messaging = api()
        suspend fun send(text: String) = attempt.send("walk", text) { id -> messaging.sendNote("walk", text.trim(), clientId = id) }

        // The server's trouble, then the network's: the note may or may not have been left.
        server.enqueue(answer(500, """{"error":{"code":"internal","message":"Something went wrong."}}"""))
        assertFailsWith<ApiFailure> { send("Your story stayed with me.") }
        val first = sentClientId()
        assertTrue(contract.matches(first))

        // Sent again by hand — with a stray space the field kept, still the same words.
        server.enqueue(answer(201, """{"id":"$first","duplicate":true}"""))
        assertEquals(first, send("Your story stayed with me. "))
        assertEquals(first, sentClientId())

        // Left: the same words sent once more are a second note, by the writer's own choice.
        server.enqueue(answer(201, """{"id":"n2"}"""))
        send("Your story stayed with me.")
        val second = sentClientId()
        assertNotEquals(first, second)
        assertTrue(contract.matches(second))
    }

    @Test fun otherWordsOrAnotherCardAreAnotherNote() {
        val attempt = NoteAttempt()
        val first = attempt.clientId("walk", "thank you")
        assertEquals(first, attempt.clientId("walk", "  thank you\n"))
        val edited = attempt.clientId("walk", "thank you so much")
        assertNotEquals(first, edited)
        // Going back to the first words after editing is not a retry of the first send any more.
        assertNotEquals(edited, attempt.clientId("walk", "thank you"))
        val elsewhere = attempt.clientId("sea", "thank you")
        assertEquals(elsewhere, attempt.clientId("sea", "thank you"))
        assertNotEquals(elsewhere, attempt.clientId("walk", "thank you"))
    }

    @Test fun aFailureThatNeverReachedTheServerKeepsTheIdToo() = runBlocking {
        val attempt = NoteAttempt()
        val ids = mutableListOf<String>()
        assertFailsWith<IOException> { attempt.send("walk", "hi") { id -> ids += id; throw IOException("offline") } }
        attempt.send("walk", "hi") { id -> ids += id }
        assertEquals(1, ids.toSet().size)
        attempt.send("walk", "hi") { id -> ids += id }
        assertEquals(2, ids.toSet().size)
    }

    @Test fun aRequestSentAgainForAFreshTokenCarriesTheSameId() = runBlocking {
        val attempt = NoteAttempt()
        val messaging = api()
        // The token was refused (revoked): the client refreshes it and sends the same request again.
        server.enqueue(answer(401, """{"error":{"code":"unauthenticated","message":"Sign in."}}"""))
        server.enqueue(answer(201, """{"id":"n1"}"""))
        attempt.send("walk", "hi") { id -> messaging.sendNote("walk", "hi", clientId = id) }
        val refused = server.takeRequest()
        val resent = server.takeRequest()
        assertEquals("Bearer token", refused.getHeader("Authorization"))
        assertEquals("Bearer fresh", resent.getHeader("Authorization"))
        assertEquals(refused.body.readUtf8(), resent.body.readUtf8())
    }
}
