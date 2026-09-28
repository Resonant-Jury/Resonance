package com.resonance.kit

import com.resonance.kit.api.AccountApi
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import java.time.OffsetDateTime
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/** The account routes (deletion, export) against a local HTTP server. */
class AccountApiTest {
    private val server = MockWebServer()
    private fun api() = AccountApi(ApiConfiguration(server.url("/").toString()) { "token" })

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun schedulesDeletionAndReadsThePurgeDate() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"deletion":{"requestedAt":"2026-09-28T03:00:00.000Z","purgeAfter":"2026-10-05T03:00:00.000Z"}}"""))
        assertEquals(OffsetDateTime.parse("2026-10-05T03:00:00.000Z"), api().scheduleDeletion())
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/account/deletion", request.path)
        assertEquals("Bearer token", request.getHeader("Authorization"))
    }

    @Test fun noScheduledDeletionIsNull() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"deletion":null}"""))
        assertNull(api().deletion())
    }

    @Test fun exportsTheRawBackup() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"cards":[]}"""))
        assertContentEquals("""{"cards":[]}""".toByteArray(), api().export())
        assertEquals("/api/account/export", server.takeRequest().path)
    }

    @Test fun anExpiredSessionIsUnauthenticated() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setResponseCode(401))
        assertEquals(true, assertFailsWith<ApiFailure> { api().cancelDeletion() }.isUnauthenticated)
    }
}
