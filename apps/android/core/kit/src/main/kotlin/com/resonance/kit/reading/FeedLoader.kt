package com.resonance.kit.reading

import com.resonance.api.models.FeedCard
import com.resonance.kit.api.NextPage
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.next
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

/**
 * The home feed (home/page.tsx): the latest public cards and today's picks,
 * asked for together, each shown as soon as it arrives. Picks that come first
 * — or within [picksGrace] of the latest — lead the feed ("load more" then
 * reveals the latest, deduped against them). Picks that come once the latest
 * cards are on screen wait behind a hint (`home.recommended.ready`): nothing
 * moves under the reader until they ask. A failed pick request (the day's
 * first, while the server still builds them, can outlast the client's
 * timeout) is asked once more a little later.
 *
 * With a [FeedStore] for the reader, a first read starts from the feed as it
 * was last read (on a cold start too) instead of the skeleton, and keeps what
 * each read brings for the next time.
 */
class FeedLoader(
    private val api: ReadingApi,
    private val scope: CoroutineScope,
    private val retryPicksAfter: Duration = 20.seconds,
    private val picksGrace: Duration = 400.milliseconds,
    /** Where a reader's feed is kept between launches (null: nowhere). */
    private val storeFor: (viewer: String) -> FeedStore? = { null },
) {
    enum class Phase { Loading, Loaded, Failed }

    data class State(
        val phase: Phase = Phase.Loading,
        val recommended: List<FeedCard> = emptyList(),
        val latest: List<FeedCard> = emptyList(),
        /** Where the latest cards' next page starts (null: no more). */
        val next: NextPage? = null,
        /** The reader asked for the latest cards below the picks. */
        val showLatest: Boolean = false,
        /** Picks that arrived after the latest cards were shown: the hint offers them. */
        val waitingPicks: List<FeedCard> = emptyList(),
        val loadingMore: Boolean = false,
        internal val latestSettled: Boolean = false,
        internal val latestFailed: Boolean = false,
        internal val picksSettled: Boolean = false,
    ) {
        /** With no picks there is nothing to hold back: the latest cards show at once. */
        val latestVisible: Boolean get() = recommended.isEmpty() || showLatest

        /** What the feed shows, in order. */
        val cards: List<FeedCard>
            get() {
                if (!latestVisible) return recommended
                val picked = recommended.map { it.id }.toSet()
                return recommended + latest.filter { it.id !in picked }
            }

        val canLoadMore: Boolean get() = !latestVisible || next != null
        val picksReady: Boolean get() = waitingPicks.isNotEmpty()

        /** Loading until either list has something to show, or both have answered. */
        internal fun settled(): State {
            val next = when {
                cards.isNotEmpty() -> Phase.Loaded
                !latestSettled || !picksSettled -> if (phase == Phase.Loaded) Phase.Loaded else Phase.Loading
                latestFailed -> Phase.Failed
                else -> Phase.Loaded
            }
            return copy(phase = next)
        }
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    private var loading: Job? = null
    private var generation = 0
    private var loadedFor: String? = null
    private var loadedVersion: Int? = null
    private var loadedAt = 0L
    private var store: FeedStore? = null

    /**
     * Reads the feed when what it holds isn't current: for another reader, after a change to
     * the reader's own cards (`version`: the session's count of them, which a change to the
     * blocks bumps too), after a failure, or once it is older than [maxAge] (the app back after
     * a while). Otherwise the screen comes back to it as it was left.
     */
    fun refresh(viewer: String?, version: Int, now: Long = System.currentTimeMillis(), maxAge: Duration = STALE_AFTER) {
        val current = viewer == loadedFor && version == loadedVersion && now - loadedAt < maxAge.inWholeMilliseconds
        if (current && _state.value.phase != Phase.Failed) return
        val restoring = if (viewer != loadedFor) {
            loading?.cancel()
            _state.value = State()
            store = viewer?.let(storeFor)
            store
        } else null
        loadedFor = viewer
        loadedVersion = version
        loadedAt = now
        if (restoring != null) restoreAndLoad(restoring) else load()
    }

    /**
     * Reads the feed. A first read (or a retry after a failure) shows the
     * skeleton; a re-read keeps what is on screen until the new lists arrive.
     */
    fun load(): Job {
        loading?.cancel()
        val run = ++generation
        reading()
        return scope.launch { read(run) }.also { loading = it }
    }

    /**
     * Reads the feed again now, asked for by hand (a pull): what is on screen stays until the new
     * lists arrive. Returns once both have answered or failed — picks asked for again a little
     * later don't hold it — or after [limit] at most.
     */
    suspend fun reload(now: Long = System.currentTimeMillis(), limit: Duration = RELOAD_LIMIT) {
        loadedAt = now
        load()
        withTimeoutOrNull(limit) { _state.first { it.latestSettled && it.picksSettled } }
    }

    /** A new reader's first read: the feed as they last saw it shows while it goes. */
    private fun restoreAndLoad(saved: FeedStore): Job {
        loading?.cancel()
        val run = ++generation
        return scope.launch {
            val latest = runCatching { saved.latest() }.getOrNull()
            val picks = runCatching { saved.picks() }.getOrNull()
            _state.update { s ->
                val kept = State(
                    phase = Phase.Loaded,
                    recommended = picks.orEmpty(),
                    latest = latest?.cards.orEmpty(),
                    next = latest?.next,
                    latestSettled = true,
                    picksSettled = true,
                )
                // Nothing kept (or the server was quicker): as it is.
                if (s.phase != Phase.Loading || kept.cards.isEmpty()) s else kept
            }
            reading()
            read(run)
        }.also { loading = it }
    }

    private fun reading() = _state.update { s ->
        if (s.phase == Phase.Loaded) s.copy(latestSettled = false, latestFailed = false, picksSettled = false)
        else State()
    }

    private suspend fun read(run: Int) {
        val keep = store
        coroutineScope {
            launch {
                val page = try {
                    api.feed()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    null
                }
                // Picks answering a moment later still lead: a first read waits that moment for them (never longer).
                if (page != null && _state.value.phase == Phase.Loading) {
                    withTimeoutOrNull(picksGrace) { _state.first { it.picksSettled } }
                }
                _state.update { s ->
                    if (page == null) s.copy(latestSettled = true, latestFailed = true).settled()
                    else s.copy(latest = page.cards, next = page.next, latestSettled = true, latestFailed = false).settled()
                }
                if (page != null) keep?.let { runCatching { it.saveLatest(page) } }
            }
            launch {
                val picks = picks()
                _state.update { s -> s.withPicks(picks.orEmpty()).copy(picksSettled = true).settled() }
                if (picks != null) keep?.let { runCatching { it.savePicks(picks) } }
                if (picks == null) {
                    delay(retryPicksAfter)
                    val again = picks() ?: return@launch
                    if (run == generation) {
                        _state.update { s -> s.withPicks(again).settled() }
                        keep?.let { runCatching { it.savePicks(again) } }
                    }
                }
            }
        }
    }

    /** Shows the picks the hint offered, above the latest cards (which stay). */
    fun revealPicks() {
        _state.update { s ->
            if (s.waitingPicks.isEmpty()) s
            else s.copy(recommended = s.waitingPicks, waitingPicks = emptyList(), showLatest = true)
        }
    }

    /** First reveals the latest cards; after that, reads the next page of them. */
    fun loadMore() {
        val s = _state.value
        if (s.loadingMore) return
        if (!s.latestVisible) {
            _state.update { it.copy(showLatest = true) }
            return
        }
        val next = s.next ?: return
        _state.update { it.copy(loadingMore = true) }
        scope.launch {
            val page = try {
                api.feed(after = next)
            } catch (e: CancellationException) {
                _state.update { it.copy(loadingMore = false) }
                throw e
            } catch (e: Exception) {
                null
            }
            _state.update { st ->
                if (page == null) return@update st.copy(loadingMore = false)
                val known = st.latest.map { it.id }.toSet()
                st.copy(latest = st.latest + page.cards.filter { it.id !in known }, next = page.next, loadingMore = false)
            }
        }
    }

    private suspend fun picks(): List<FeedCard>? = try {
        api.recommended()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    private fun State.withPicks(picks: List<FeedCard>): State = when {
        picks.isEmpty() -> this
        // Already leading the feed (a re-read): they stay where they are.
        recommended.isNotEmpty() -> copy(recommended = picks)
        // The latest cards are on screen: the picks wait for the reader's tap.
        phase == Phase.Loaded && cards.isNotEmpty() -> copy(waitingPicks = picks)
        else -> copy(recommended = picks)
    }

    companion object {
        /** A feed read longer ago than this is read again when the screen (or the app) comes back to it. */
        val STALE_AFTER: Duration = 15.minutes

        /** The longest a [reload] keeps its caller waiting (the reads still finish behind it). */
        val RELOAD_LIMIT: Duration = 20.seconds
    }
}
