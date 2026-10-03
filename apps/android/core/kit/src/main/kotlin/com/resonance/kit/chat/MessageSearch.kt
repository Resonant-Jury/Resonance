package com.resonance.kit.chat

/** Where a search matched: the message and the stretches of its text that match (UTF-16 indices, both ends inclusive, in order). */
data class SearchHit(val messageId: String, val ranges: List<IntRange>)

/**
 * Searching a conversation's messages the way a person types the query: case doesn't matter, and
 * neither does the width of ASCII letters and digits (`ＡＢＣ１２３` finds `abc123` and back — a CJK
 * keyboard types the full-width ones), nor an ideographic space for a plain one. The text is
 * folded one character at a time, so the hits' ranges are positions in the message as written.
 * The whole query is one phrase; a query that is only spaces matches nothing.
 */
object MessageSearch {
    /** The hits among [messages] (those with text), the newest message first. */
    fun find(messages: List<ChatMessage>, query: String): List<SearchHit> {
        val needle = fold(query.trim())
        if (needle.isEmpty()) return emptyList()
        val hits = ArrayList<SearchHit>()
        for (message in messages.asReversed()) {
            if (message.text.isEmpty()) continue
            val ranges = ranges(fold(message.text), needle)
            if (ranges.isNotEmpty()) hits += SearchHit(message.id, ranges)
        }
        return hits
    }

    /** Every non-overlapping match of the (already folded) [needle] in the (already folded) [haystack]. */
    internal fun ranges(haystack: String, needle: String): List<IntRange> {
        val out = ArrayList<IntRange>()
        var from = 0
        while (true) {
            val at = haystack.indexOf(needle, from)
            if (at < 0) return out
            out += at until at + needle.length
            from = at + needle.length
        }
    }

    /** One character in, one out (so indices stay put): lower case, full-width ASCII to plain, ideographic space to a space. */
    internal fun fold(text: String): String {
        val out = CharArray(text.length)
        for (i in text.indices) {
            val c = text[i]
            out[i] = when {
                c.code in 0xFF01..0xFF5E -> Character.toLowerCase((c.code - 0xFEE0).toChar())
                c == '\u3000' -> ' '
                else -> Character.toLowerCase(c)
            }
        }
        return String(out)
    }
}
