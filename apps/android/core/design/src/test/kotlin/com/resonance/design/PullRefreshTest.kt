package com.resonance.design

import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A pull let go past its threshold runs the screen's refresh once, keeps the loader docked while
 * it runs (and for a moment at least, so a quick answer doesn't just flicker), and lets go of it
 * whether the refresh worked or not. The loader fades and grows in with the pull. Whoever can't
 * pull asks for the same refresh with the list's accessibility action.
 */
class PullRefreshTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @After fun stop() = scope.cancel()

    private suspend fun untilLetGo(pull: SketchPull) = withTimeout(4_000) { while (pull.refreshing) delay(5) }

    @Test fun aRefreshRunsOnceWhileItIsDocked() = runBlocking {
        var runs = 0
        val answer = CompletableDeferred<Unit>()
        val pull = SketchPull(scope, 64.dp, 64f) { { runs++; answer.await() } }
        pull.refresh()
        // Let go again while it runs (a second pull can't start one, but say it did): still one.
        pull.refresh()
        assertTrue(pull.refreshing)
        assertTrue(pull.docked)
        delay(MIN_REFRESH_MILLIS + 100)
        assertTrue("waits for the refresh itself", pull.refreshing)
        answer.complete(Unit)
        untilLetGo(pull)
        assertEquals(1, runs)
    }

    @Test fun aQuickAnswerStillShowsTheLoaderForAMoment() = runBlocking {
        val pull = SketchPull(scope, 64.dp, 64f) { {} }
        val started = System.currentTimeMillis()
        pull.refresh()
        untilLetGo(pull)
        assertTrue(System.currentTimeMillis() - started >= MIN_REFRESH_MILLIS)
    }

    @Test fun aRefreshThatFailsLetsGoQuietly() = runBlocking {
        val pull = SketchPull(scope, 64.dp, 64f) { { error("offline") } }
        pull.refresh()
        untilLetGo(pull)
        assertFalse(pull.refreshing)
        // …and the next pull runs again.
        pull.refresh()
        assertTrue(pull.refreshing)
    }

    private suspend fun untilDone(pull: SketchPull) = withTimeout(4_000) { while (pull.running) delay(5) }

    @Test fun theRefreshActionAtTheTopRefreshesAsAPullDoes() = runBlocking {
        var runs = 0
        val answer = CompletableDeferred<Unit>()
        val pull = SketchPull(scope, 64.dp, 64f) { { runs++; answer.await() } }
        val action = pull.refreshAction("Refresh") { true }
        assertEquals("Refresh", action.label)
        assertTrue(action.action())
        // Docked as a pull's would be, and asked again meanwhile: still the one refresh.
        assertTrue(pull.refreshing)
        assertTrue(pull.docked)
        assertTrue(action.action())
        answer.complete(Unit)
        untilLetGo(pull)
        assertEquals(1, runs)
        // …and the next one runs again.
        action.action()
        untilLetGo(pull)
        assertEquals(2, runs)
    }

    @Test fun theRefreshActionFurtherDownLeavesTheListWhereItIs() = runBlocking {
        var runs = 0
        val answer = CompletableDeferred<Unit>()
        val pull = SketchPull(scope, 64.dp, 64f) { { runs++; answer.await() } }
        var top = false
        val action = pull.refreshAction("Refresh") { top }
        assertTrue(action.action())
        assertTrue(pull.running)
        // No gap, no loader over the stories in view.
        assertFalse(pull.refreshing)
        assertFalse(pull.docked)
        // A pull (or the action back at the top) meanwhile is answered by the refresh already running.
        pull.refresh()
        top = true
        action.action()
        assertFalse(pull.refreshing)
        answer.complete(Unit)
        untilDone(pull)
        assertEquals(1, runs)
        // Nothing to show for: it ends as soon as the refresh does, and the next pull runs again.
        pull.refresh()
        assertTrue(pull.refreshing)
        untilLetGo(pull)
        assertEquals(2, runs)
    }

    @Test fun theLoaderFadesAndGrowsInWithThePull() {
        assertEquals(0f, pullAlpha(0f), 0f)
        assertEquals(0.7f, pullScale(0f), 1e-6f)
        assertEquals(1f, pullAlpha(0.45f), 1e-6f)
        assertEquals(1f, pullAlpha(1f), 0f)
        assertEquals(1f, pullScale(1f), 1e-6f)
        // Pulled past the threshold, it stays as it is there.
        assertEquals(1f, pullAlpha(1.8f), 0f)
        assertEquals(1f, pullScale(1.8f), 1e-6f)
    }
}
