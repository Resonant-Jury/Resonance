package com.resonance.kit.chat

/**
 * The line a search result shows for a message: a stretch of its text with the first match near
 * the front, cut with "…" where the message goes on, and the matches that fall inside it
 * ([ranges], UTF-16 indices into [text], both ends inclusive).
 */
data class SearchSnippet(val text: String, val ranges: List<IntRange>) {
    companion object {
        /** How much of a message a result shows at most (two short lines). */
        const val MAX_LENGTH = 96
        /** How much of the text before the first match is kept, so the match isn't pushed off the first line. */
        const val LEAD = 14

        /** A message's [text] cut around the first of its [ranges] (the matches, in order). */
        fun of(text: String, ranges: List<IntRange>, maxLength: Int = MAX_LENGTH): SearchSnippet {
            // A result is a line or two, not the message's own paragraphs.
            val flat = String(CharArray(text.length) { if (text[it] == '\n' || text[it] == '\r') ' ' else text[it] })
            if (flat.length <= maxLength) return SearchSnippet(flat, ranges)
            if (ranges.isEmpty()) return SearchSnippet(cut(flat, 0, maxLength), emptyList())
            val first = ranges.first()
            var from = (first.first - LEAD).coerceAtLeast(0)
            // Never open on the second half of a surrogate pair.
            if (from > 0 && Character.isLowSurrogate(flat[from])) from--
            var to = (from + maxLength).coerceAtMost(flat.length)
            // A match longer than the window still shows its beginning in full.
            if (to <= first.first) to = (first.first + 1).coerceAtMost(flat.length)
            if (to < flat.length && Character.isHighSurrogate(flat[to - 1])) to--
            val head = if (from > 0) "…" else ""
            val tail = if (to < flat.length) "…" else ""
            val shown = head + flat.substring(from, to) + tail
            val shifted = ranges.mapNotNull { r ->
                val a = (r.first - from).coerceAtLeast(0)
                val b = (r.last - from).coerceAtMost(to - from - 1)
                if (r.last < from || r.first >= to || b < a) null else (a + head.length)..(b + head.length)
            }
            return SearchSnippet(shown, shifted)
        }

        private fun cut(text: String, from: Int, to: Int): String {
            var end = to
            if (end < text.length && end > from && Character.isHighSurrogate(text[end - 1])) end--
            return text.substring(from, end) + "…"
        }
    }
}
