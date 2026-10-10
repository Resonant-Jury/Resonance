package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.WritingApi
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
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
import kotlin.test.assertFalse
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

    @Test fun changesACardsVisibilityThroughTheContract() = runBlocking {
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody(cardJson("c1", "a-walk", visibility = "private")))
        val card = api().updateCard("c1", visibility = "private")
        assertEquals("private", card.visibility.value)
        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("/api/v1/cards/c1", request.path)
        assertEquals("Bearer stale-token", request.getHeader("Authorization"))
        // Only the visibility changes: the byline goes as null, which the contract leaves as it is.
        val sent = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertEquals("private", sent["visibility"]!!.jsonPrimitive.content)
        assertTrue(sent["anonymous"] == null || sent["anonymous"] is JsonNull)
    }

    @Test fun someoneElsesCardIsNotFoundAndAnUnknownVisibilityNeverLeaves() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(404).setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"not_found","message":"No such card."}}"""),
        )
        assertTrue(assertFailsWith<ApiFailure> { api().updateCard("theirs", visibility = "public") }.isNotFound)
        assertFailsWith<IllegalArgumentException> { api().updateCard("c1", visibility = "friends") }
        assertEquals(1, server.requestCount)
    }

    @Test fun resonatesWithOneOfYourCardsThroughTheContract() = runBlocking {
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("""{"card":${cardJson("mine", "my-walk", authorId = "alice")},"changed":true}"""))
        val result = api().resonate("theirs", "mine")
        assertEquals("mine", result.card.id)
        assertEquals(true, result.changed)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/cards/theirs/resonances", request.path)
        assertEquals("Bearer stale-token", request.getHeader("Authorization"))
        assertEquals("mine", Json.parseToJsonElement(request.body.readUtf8()).jsonObject["cardId"]!!.jsonPrimitive.content)
    }

    @Test fun aCardAlreadyAnsweringAnotherIsAConflict() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(409).setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"conflict","message":"That card already answers another card."}}"""),
        )
        assertTrue(assertFailsWith<ApiFailure> { api().resonate("theirs", "mine") }.isConflict)
    }

    @Test fun stopsResonatingThroughTheContract() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))
        api().unresonate("theirs", "mine")
        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/cards/theirs/resonances/mine", request.path)
        assertEquals("Bearer stale-token", request.getHeader("Authorization"))
    }

    @Test fun deletesACardThroughTheContract() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))
        api().deleteCard("c1")
        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/cards/c1", request.path)
        assertEquals("Bearer stale-token", request.getHeader("Authorization"))
    }

    @Test fun aCardAlreadyGoneCountsAsDeletedButAFailureDoesNot() = runBlocking {
        // A retry after an answer that never arrived: the server has nothing left to delete.
        server.enqueue(
            MockResponse().setResponseCode(404).setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"not_found","message":"No such card."}}"""),
        )
        api().deleteCard("c1")
        server.enqueue(MockResponse().setResponseCode(500))
        assertEquals("internal", assertFailsWith<ApiFailure> { api().deleteCard("c1") }.code)
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
        // A cover says nothing of what it is for.
        assertFalse(text.contains("name=\"purpose\""))
    }

    @Test fun aProfilePhotoSaysItIsAnAvatar() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"publicUrl":"https://img.test/avatar/2026-10/a.webp","key":"avatar/2026-10/a.webp"}"""))
        val photo = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte(), 3, 4)
        assertEquals("https://img.test/avatar/2026-10/a.webp", api().upload(photo, "avatar.jpg", purpose = "avatar"))
        val text = String(server.takeRequest().body.readByteArray(), Charsets.ISO_8859_1)
        assertContains(text, "Content-Disposition: form-data; name=\"file\"; filename=\"avatar.jpg\"")
        // The route fits it to 256 when the form's `purpose` is `avatar`.
        assertContains(text, "Content-Disposition: form-data; name=\"purpose\"\r\nContent-Length: 6\r\n\r\navatar")
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
