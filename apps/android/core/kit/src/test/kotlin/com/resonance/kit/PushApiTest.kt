package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.PushApi
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** The push registration speaks the contract: the install id in the path, 204 back. */
class PushApiTest {
    private val server = MockWebServer()
    private fun api(token: String = "token") = PushApi(ApiConfiguration(server.url("/").toString()) { token })

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun registersThisInstall() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))
        api().register("3F2A-install", "fcm-token", Strings.Language.ZhTW, "2.0.0")
        val request = server.takeRequest()
        assertEquals("PUT", request.method)
        assertEquals("/api/v1/me/devices/3F2A-install", request.path)
        assertEquals("Bearer token", request.getHeader("Authorization"))
        val sent = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertEquals("fcm-token", sent["token"]!!.jsonPrimitive.content)
        assertEquals("android", sent["platform"]!!.jsonPrimitive.content)
        assertEquals("zh-TW", sent["locale"]!!.jsonPrimitive.content)
        assertEquals("2.0.0", sent["appVersion"]!!.jsonPrimitive.content)
    }

    @Test fun registersWhatThisBuildCanDoWithAPush() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))
        api().register("3F2A-install", "fcm-token", Strings.Language.En, "2.0.0", capabilities = listOf("chat-push"))
        val sent = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
        assertEquals(listOf("chat-push"), sent["capabilities"]!!.jsonArray.map { it.jsonPrimitive.content })
    }

    @Test fun unregistersOnSignOutWithTheTokenItHolds() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))
        api("captured-token").unregister("3F2A-install")
        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/me/devices/3F2A-install", request.path)
        assertEquals("Bearer captured-token", request.getHeader("Authorization"))
    }

    @Test fun aRefusalIsAFailure() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(400).setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"invalid_request","message":"Not a valid installation id."}}"""),
        )
        val failure = assertFailsWith<ApiFailure> { api().unregister("x") }
        assertEquals(400, failure.status)
        assertEquals("Not a valid installation id.", failure.message)
    }
}
