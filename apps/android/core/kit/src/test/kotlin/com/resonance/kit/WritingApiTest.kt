package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.WritingApi
import kotlinx.coroutines.flow.toList
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
import kotlin.test.assertContains
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Publishing, the editor's AI helpers and photo uploads, against a local HTTP server. */
class WritingApiTest {
    private val server = MockWebServer()
    private val asks = mutableListOf<Boolean>()
    private fun api() = WritingApi(ApiConfiguration(server.url("/").toString()) { force ->
        synchronized(asks) { asks += force }
        if (force) "fresh-token" else "stale-token"
    })

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun publishesThroughTheContract() = runBlocking {
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("""{"id":"c1","slug":"a-walk","firstPublish":true,"later":1}"""))
        val result = api().publish("c1")
        assertEquals("a-walk", result.slug)
        assertEquals(true, result.firstPublish)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/cards/c1/publish", request.path)
        assertEquals("Bearer stale-token", request.getHeader("Authorization"))
    }

    @Test fun appliesAPendingEditThroughTheContract() = runBlocking {
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("""{"id":"c1","slug":"a-walk","applied":true,"later":1}"""))
        val result = api().applyEdit("c1")
        assertEquals(true, result.applied)
        assertEquals("a-walk", result.slug)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/cards/c1/edits/apply", request.path)
        assertEquals("Bearer stale-token", request.getHeader("Authorization"))
    }

    @Test fun aRefusedEditIsTheContractsError() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(404).setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"not_found","message":"No such card."}}"""),
        )
        assertEquals(true, assertFailsWith<ApiFailure> { api().applyEdit("nope") }.isNotFound)
    }

    @Test fun asksTheSiteToRefreshItsPages() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"ok":true,"revalidated":[]}"""))
        api().revalidate(listOf("/card/a-walk"))
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/revalidate", request.path)
        val sent = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertEquals(listOf("/card/a-walk"), sent["paths"]!!.jsonArray.map { it.jsonPrimitive.content })
    }

    @Test fun aFailedRefreshIsNotAnError() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(500))
        api().revalidate(listOf("/card/a-walk"))
        assertEquals(1, server.requestCount)
    }

    @Test fun uploadsThePhotoAsTheFormsFilePart() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"publicUrl":"https://img.test/u/alice/cover.avif","key":"u/alice/cover.avif"}"""))
        val photo = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte(), 1, 2)
        assertEquals("https://img.test/u/alice/cover.avif", api().upload(photo, "cover.jpg"))
        val request = server.takeRequest()
        assertEquals("/api/upload", request.path)
        assertTrue(request.getHeader("Content-Type")!!.startsWith("multipart/form-data; boundary="))
        val body = request.body.readByteArray()
        val text = String(body, Charsets.ISO_8859_1)
        assertContains(text, "Content-Disposition: form-data; name=\"file\"; filename=\"cover.jpg\"")
        assertContains(text, "Content-Type: image/jpeg")
        assertContains(text, String(photo, Charsets.ISO_8859_1))
    }

    @Test fun refreshesARejectedTokenOnce() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setBody("""{"tags":["散步","雨天"]}"""))
        assertEquals(listOf("散步", "雨天"), api().suggestTags("一場雨後的散步", "雨停的時候…", listOf("日常")))
        assertEquals(listOf(false, true), asks)
        assertEquals("Bearer stale-token", server.takeRequest().getHeader("Authorization"))
        val retried = server.takeRequest()
        assertEquals("Bearer fresh-token", retried.getHeader("Authorization"))
        val sent = Json.parseToJsonElement(retried.body.readUtf8()).jsonObject
        assertEquals("一場雨後的散步", sent["thoughtCore"]!!.jsonPrimitive.content)
        assertEquals(listOf("日常"), sent["tags"]!!.jsonArray.map { it.jsonPrimitive.content })
    }

    @Test fun streamsTheIllustrationsPreviewsThenItsPicture() = runBlocking {
        val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47)
        val b64 = java.util.Base64.getEncoder().encodeToString(png)
        server.enqueue(MockResponse().setBody(
            "{\"type\":\"partial\",\"index\":0,\"b64\":\"$b64\"}\n" +
                "{\"type\":\"done\",\"publicUrl\":\"https://img.test/u/alice/generated.avif\",\"key\":\"k\"}\n",
        ))
        val events = api().illustrate("雨停的時候…").toList()
        assertContentEquals(png, (events[0] as WritingApi.IllustrationEvent.Partial).png)
        assertEquals(WritingApi.IllustrationEvent.Done("https://img.test/u/alice/generated.avif"), events[1])
        val request = server.takeRequest()
        assertEquals("/api/generate-image", request.path)
        assertEquals("雨停的時候…", Json.parseToJsonElement(request.body.readUtf8()).jsonObject["story"]!!.jsonPrimitive.content)
    }

    @Test fun aFailureAfterTheStreamBeganIsAnEvent() = runBlocking {
        server.enqueue(MockResponse().setBody("{\"type\":\"error\"}\n"))
        assertEquals(listOf<WritingApi.IllustrationEvent>(WritingApi.IllustrationEvent.Failed), api().illustrate("s").toList())
    }

    @Test fun anInsightMayBeMissing() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"coreInsight":null}"""))
        assertEquals(null, api().insight("t", "s"))
    }

    @Test fun asksToSignInAgainWhenTheFreshTokenIsRejectedToo() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setResponseCode(401))
        assertEquals(true, assertFailsWith<ApiFailure> { api().insight("t", "s") }.isUnauthenticated)
        assertEquals(2, server.requestCount)
    }
}
