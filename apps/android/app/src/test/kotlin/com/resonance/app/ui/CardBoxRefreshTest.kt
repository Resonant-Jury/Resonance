package com.resonance.app.ui

import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.reading.RefreshFailure
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.UnknownHostException

/**
 * A pull of a card-box shelf that brings nothing back keeps the shelf on screen and says why — over
 * that shelf only, until its next answer or another shelf is shown (iOS's RefreshNote); a shelf
 * not on screen yet fails as the page's own failure, with its retry.
 */
class CardBoxRefreshTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    private var answer: (List<TabGetCardBox>) -> Map<TabGetCardBox, List<FeedCard>> = { emptyMap() }
    private val model = CardBoxModel(uid = null, readShelves = { answer(it) }, kept = { null }, scope = scope)

    @After fun stop() = scope.cancel()

    private fun card(id: String) = FeedCard(
        id = id, slug = id, title = id, excerpt = "…", tags = emptyList(), publishedAt = "2026-09-01T08:00:00.000Z",
        author = null, anonymous = false, visibility = FeedCard.Visibility.`public`, imageUrl = null, imageLabel = null,
        accentHue = 140.0, readMinutes = 1, referenceCardId = null, reason = null,
    )

    private fun shelfOf(vararg ids: String): (List<TabGetCardBox>) -> Map<TabGetCardBox, List<FeedCard>> =
        { asked -> asked.associateWith { ids.map(::card) } }

    private fun ids(shelf: TabGetCardBox) = model.shelves[shelf]?.map { it.id }

    @Test fun aPullThatBringsNothingBackKeepsTheShelfAndSaysWhyOverItOnly() = runBlocking {
        answer = shelfOf("a")
        model.refresh(TabGetCardBox.resonated, changes = 0)?.join()
        assertEquals(listOf("a"), ids(TabGetCardBox.resonated))

        answer = { throw UnknownHostException("no network") }
        model.refresh(TabGetCardBox.resonated, changes = 0, retry = true)?.join()
        assertEquals(listOf("a"), ids(TabGetCardBox.resonated))
        assertEquals(RefreshFailure.Offline, model.failureOver(TabGetCardBox.resonated))
        // Never said over another shelf.
        assertNull(model.failureOver(TabGetCardBox.bookmarks))

        // Another shelf shown: gone, and not back when the first is shown again.
        model.shelfShown(TabGetCardBox.bookmarks)
        model.shelfShown(TabGetCardBox.resonated)
        assertNull(model.failureOver(TabGetCardBox.resonated))
    }

    @Test fun theShelfsNextAnswerTakesTheLineAway() = runBlocking {
        answer = shelfOf("a")
        model.refresh(TabGetCardBox.bookmarks, changes = 0)?.join()
        answer = { throw ApiFailure("internal", "HTTP 500", 500) }
        model.refresh(TabGetCardBox.bookmarks, changes = 0, retry = true)?.join()
        assertEquals(RefreshFailure.Failed, model.failureOver(TabGetCardBox.bookmarks))

        answer = shelfOf("a", "b")
        model.refresh(TabGetCardBox.bookmarks, changes = 0, retry = true)?.join()
        assertEquals(listOf("a", "b"), ids(TabGetCardBox.bookmarks))
        assertNull(model.failureOver(TabGetCardBox.bookmarks))
    }

    @Test fun anAnswerThatLeavesTheShelfOutIsAFailureToo() = runBlocking {
        answer = shelfOf("a")
        model.refresh(TabGetCardBox.linked, changes = 0)?.join()
        answer = { emptyMap() }
        model.refresh(TabGetCardBox.linked, changes = 0, retry = true)?.join()
        assertEquals(listOf("a"), ids(TabGetCardBox.linked))
        assertEquals(RefreshFailure.Failed, model.failureOver(TabGetCardBox.linked))
    }

    @Test fun aShelfNotOnScreenYetFailsAsThePagesOwnFailure() = runBlocking {
        answer = { throw UnknownHostException("no network") }
        model.refresh(TabGetCardBox.resonated, changes = 0, retry = true)?.join()
        assertNull(ids(TabGetCardBox.resonated))
        assertTrue(model.failed)
        assertNull(model.failureOver(TabGetCardBox.resonated))
    }
}
