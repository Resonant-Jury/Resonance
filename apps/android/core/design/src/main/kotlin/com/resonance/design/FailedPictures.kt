package com.resonance.design

import androidx.compose.runtime.mutableStateMapOf

/**
 * Pictures that wouldn't load — a link preview's, a shared card's cover, a story link card's — as
 * the whole app knows them, for a while ([KEEP_MILLIS]). The image loader remembers only what
 * loaded, and a part that keeps its own "failed" forgets it as its row leaves the screen: scrolled
 * back, the row would draw the picture's box, ask again, fail again and drop it — the bubble
 * growing and shrinking under the reader every time. Asked here first, it is drawn without at
 * once. Read while composing, so a failure noted redraws the parts showing that picture. Kept a
 * while, not for good: a picture that failed while offline is asked for again later.
 */
class FailedPictures(private val clock: () -> Long = System::currentTimeMillis) {
    private val failed = mutableStateMapOf<String, Long>()

    /** Whether [url] failed to load not long ago: draw what it is in without it. */
    fun has(url: String): Boolean {
        val at = failed[url] ?: return false
        return clock() - at < KEEP_MILLIS
    }

    /** [url] wouldn't load. */
    fun note(url: String) {
        val now = clock()
        if (failed.size >= LIMIT) failed.entries.filter { now - it.value >= KEEP_MILLIS }.forEach { failed.remove(it.key) }
        if (failed.size >= LIMIT) failed.entries.minByOrNull { it.value }?.let { failed.remove(it.key) }
        failed[url] = now
    }

    companion object {
        /** How long a failed picture stays failed. */
        const val KEEP_MILLIS = 5 * 60_000L

        /** The most it holds (the oldest go first). */
        const val LIMIT = 200

        /** The app's one memory of them. */
        val shared = FailedPictures()
    }
}
