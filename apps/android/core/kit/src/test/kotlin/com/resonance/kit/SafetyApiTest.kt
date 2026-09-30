package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.SafetyApi
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

/** Card reports go through the contract, which knows the author (anonymous cards included). */
class SafetyApiTest {
    private val server = MockWebServer()
    private fun api() = SafetyApi(ApiConfiguration(server.url("/").toString()) { "token" })

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun reportsACardByItsKeyWithoutItsAuthor() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json").setBody("""{"id":"r1"}"""))
        assertEquals("r1", api().reportCard("c1", "self_harm", "worrying"))
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/cards/c1/report", request.path)
        assertEquals("Bearer token", request.getHeader("Authorization"))
        val sent = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertEquals("self_harm", sent["reason"]!!.jsonPrimitive.content)
        assertEquals("worrying", sent["detail"]!!.jsonPrimitive.content)
        assertEquals(setOf("reason", "detail"), sent.keys)
    }

    @Test fun noDetailsTravelAsAbsent() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json").setBody("""{"id":"r2"}"""))
        api().reportCard("c1", "spam", "  ")
        val sent = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
        assertTrue(sent["detail"] == null || sent["detail"] is JsonNull)
    }

    @Test fun aCardYouCannotSeeIsNotFound() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(404).setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"not_found","message":"No such card."}}"""),
        )
        assertTrue(assertFailsWith<ApiFailure> { api().reportCard("gone", "other", null) }.isNotFound)
    }
}
