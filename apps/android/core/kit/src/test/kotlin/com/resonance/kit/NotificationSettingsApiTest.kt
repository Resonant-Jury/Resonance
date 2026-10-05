package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.NotificationSettingsApi
import com.resonance.kit.push.NotificationSwitch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The push switches speak the contract: GET reads both, PATCH sends only the one flipped and reads both back. */
class NotificationSettingsApiTest {
    private val server = MockWebServer()
    private val api get() = NotificationSettingsApi(ApiConfiguration(server.url("/").toString()) { "token" })
    private fun answer(picks: Boolean, connectionCards: Boolean) = MockResponse().setHeader("Content-Type", "application/json")
        .setBody("""{"picks":$picks,"connectionCards":$connectionCards}""")

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun readsBothSwitches() = runBlocking {
        server.enqueue(answer(picks = true, connectionCards = false))
        val settings = api.get()
        assertTrue(settings.picks)
        assertFalse(settings.connectionCards)
        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/v1/me/notifications", request.path)
        assertEquals("Bearer token", request.getHeader("Authorization"))
    }

    @Test fun flipsOnlyTheSwitchItNames() = runBlocking {
        server.enqueue(answer(picks = false, connectionCards = true))
        val saved = api.set(NotificationSwitch.ConnectionCards, true)
        assertTrue(saved.connectionCards)
        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("/api/v1/me/notifications", request.path)
        val sent = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertTrue(sent["connectionCards"]!!.jsonPrimitive.boolean)
        // The other one is left alone: absent, or null (which the server reads the same).
        assertTrue(sent["picks"] == null || sent["picks"] == JsonNull)

        server.enqueue(answer(picks = false, connectionCards = true))
        api.set(NotificationSwitch.Picks, false)
        val second = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
        assertFalse(second["picks"]!!.jsonPrimitive.boolean)
        assertTrue(second["connectionCards"] == null || second["connectionCards"] == JsonNull)
    }

    @Test fun aRefusalIsAFailure() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(500))
        val failure = assertFailsWith<ApiFailure> { api.set(NotificationSwitch.Picks, true) }
        assertEquals(500, failure.status)
    }
}
