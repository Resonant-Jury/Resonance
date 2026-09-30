package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ProfileApi
import com.resonance.kit.api.ReadingApi
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
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Onboarding and profile edits through the contract, against a local HTTP server. */
class ProfileApiTest {
    private val server = MockWebServer()
    private fun config() = ApiConfiguration(server.url("/").toString()) { "token" }
    private fun api() = ProfileApi(config())

    private fun me(handle: String, bio: String? = null) = """
        {"id":"u1","handle":"$handle","initials":"${handle.take(2).uppercase()}","accentColor":"oklch(88% 0.08 55)",
         "bio":${bio?.let { "\"$it\"" } ?: "null"},"avatarUrl":null,"region":"TW","primaryLocale":"zh-TW","handleChangedAt":null}
    """.trimIndent()

    private fun json(code: Int, body: String) = MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun checksAPenNameInAnyScript() = runBlocking {
        server.enqueue(json(200, """{"handle":"小雨 天","available":true}"""))
        assertTrue(api().isAvailable("小雨 天"))
        val request = server.takeRequest()
        assertEquals("GET", request.method)
        // One encoded path segment, whatever the script.
        assertEquals("/api/v1/handles/%E5%B0%8F%E9%9B%A8%20%E5%A4%A9", request.path)
        assertEquals("Bearer token", request.getHeader("Authorization"))
    }

    @Test fun createsTheProfileOfANewAccount() = runBlocking {
        server.enqueue(json(201, me("小雨")))
        val created = api().create("小雨", "TW", "zh-TW")
        assertEquals("小雨", created.handle)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/me", request.path)
        val sent = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertEquals("小雨", sent["handle"]!!.jsonPrimitive.content)
        assertEquals("TW", sent["region"]!!.jsonPrimitive.content)
        assertEquals("zh-TW", sent["primaryLocale"]!!.jsonPrimitive.content)
    }

    @Test fun anExistingProfileComesBackUnchanged() = runBlocking {
        // 200, not 201: the account already had a profile (a retried request, or made on the web meanwhile).
        server.enqueue(json(200, me("rain")))
        assertEquals("rain", api().create("小雨", "TW", "en").handle)
    }

    @Test fun aNameTakenMeanwhileIsAConflict() = runBlocking {
        server.enqueue(json(409, """{"error":{"code":"conflict","message":"That pen name is taken."}}"""))
        val failure = assertFailsWith<ApiFailure> { api().create("rain", "TW", "en") }
        assertTrue(failure.isConflict)
        assertEquals(409, failure.status)
    }

    @Test fun anEditSendsOnlyItsFields() = runBlocking {
        server.enqueue(json(200, me("rain", bio = "")))
        assertEquals("", api().update(bio = "").bio)
        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("/api/v1/me", request.path)
        val sent = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        // An empty bio clears it; the fields left out travel as null ("absent" to the contract).
        assertEquals("", sent["bio"]!!.jsonPrimitive.content)
        assertTrue(sent["handle"] == null || sent["handle"] is JsonNull)
        assertTrue(sent["region"] == null || sent["region"] is JsonNull)
    }

    @Test fun aRenameToATakenNameIsAConflict() = runBlocking {
        server.enqueue(json(409, """{"error":{"code":"conflict","message":"That pen name is taken."}}"""))
        assertTrue(assertFailsWith<ApiFailure> { api().update(handle = "bob") }.isConflict)
    }

    /**
     * The onboarding gate: only the contract's own `not_found` means "this account has no profile
     * yet" — a bare 404 (a proxy, a missing deploy) or a server error is a failure to retry.
     */
    @Test fun onlyTheContractsNotFoundMeansNoProfile() = runBlocking {
        val reading = ReadingApi(config())
        server.enqueue(json(404, """{"error":{"code":"not_found","message":"This account has no profile yet."}}"""))
        assertTrue(assertFailsWith<ApiFailure> { reading.me() }.isNotFound)
        server.enqueue(MockResponse().setResponseCode(404).setHeader("Content-Type", "text/html").setBody("<html>Not Found</html>"))
        assertFalse(assertFailsWith<ApiFailure> { reading.me() }.isNotFound)
        server.enqueue(json(503, """{"error":{"code":"internal","message":"x"}}"""))
        assertFalse(assertFailsWith<ApiFailure> { reading.me() }.isNotFound)
    }
}
