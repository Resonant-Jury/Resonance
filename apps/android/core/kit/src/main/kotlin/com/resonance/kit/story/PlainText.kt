package com.resonance.kit.story

import com.resonance.kit.chat.Linkify
import kotlin.math.min

/**
 * A story's prose as lists and previews show it (src/lib/markdown/plainText.ts) — the excerpt the
 * server stores beside a card, the web's story cards, the thought map's nodes — one set of rules on
 * the server, in the browser and here, line for line.
 *
 * JavaScript's `\s` is Unicode-aware (the ideographic space, NBSP, the BOM); Java's regex needs them
 * spelled out ([S]).
 */
object PlainText {
    /** How much of the prose a list's excerpt shows (the web's EXCERPT_CHARS). */
    const val EXCERPT_CHARS = 96

    private const val S = "[\\s\\p{Z}\\uFEFF]"
    private val CodeFence = Regex("```[\\s\\S]*?```")
    /**
     * A picture, `![alt](src)`, and a link, `[text](destination)` (its text is group 1), on one line,
     * every run bounded (plainText.ts's PICTURE and LINK): a link's text by [LINK_TEXT_MAX], its
     * destination by the longest address the link rule takes, so no attempt reads on to the story's
     * end — unbounded, a story of 200 000 unclosed `[` took seconds. A longer link text shows its brackets.
     * Each run is possessive (`{…}+`, which JavaScript lacks): its class holds no `]` / `)`, so giving a
     * character back could never let the mark after it match — the same matches, without trying every
     * shorter run.
     */
    const val LINK_TEXT_MAX = 500
    private val Image = Regex("!\\[[^\\]\\n]{0,$LINK_TEXT_MAX}+\\]\\([^)\\n]{0,${Linkify.MAX_LENGTH}}+\\)")
    private val Link = Regex("\\[([^\\]\\n]{0,$LINK_TEXT_MAX}+)\\]\\([^)\\n]{0,${Linkify.MAX_LENGTH}}+\\)")
    /** A picture with a web address (group 1), bounded as [Image] is: a thought-map node's little visual. */
    private val WebPicture = Regex("!\\[[^\\]\\n]{0,$LINK_TEXT_MAX}+\\]\\((https?://[^\\s)]{1,${Linkify.MAX_LENGTH}}+)\\)")
    private val Heading = Regex("^#{1,6}$S+", RegexOption.MULTILINE)
    private val Quote = Regex("^>$S?", RegexOption.MULTILINE)
    // A marker's indent is spaces and tabs on its own line: `^\s*` would read on across every blank line after it, at each one (quadratic).
    private val ListMarker = Regex("^[ \\t]*(?:[-*+]|\\d+\\.)$S+", RegexOption.MULTILINE)
    private val Rule = Regex("^[ \\t]*(?:-{3,}|\\*{3,}|_{3,})[ \\t]*$", RegexOption.MULTILINE)
    private val Marks = Regex("[*_~`]+")
    private val Spaces = Regex("$S+")
    private val TrailingSpaces = Regex("$S+$")
    /** Closing marks — sentence punctuation, closing brackets and quotes, CJK ones too: the sentence's, never the link's. */
    private val Closing = Regex("^[\\p{Po}\\p{Pe}\\p{Pf}]")

    /**
     * The text without its bare addresses: exactly the links the one link rule finds ([Linkify.find],
     * the twin of the web's findLinks — which already leaves the sentence's punctuation, CJK too, and
     * an unmatched `)` outside the link), each with the `<…>` of an autolink around it. Everything else
     * the writer wrote stays: the words either side, the punctuation after the address (and no space is
     * left hanging before it), an address the rule doesn't accept (`foo@www.…`, `localhost`).
     */
    fun withoutLinks(text: String): String {
        val out = StringBuilder()
        var at = 0
        for (link in Linkify.find(text)) {
            var start = link.range.first
            var end = link.range.last + 1
            if (start > 0 && end < text.length && text[start - 1] == '<' && text[end] == '>') {
                start--
                end++
            }
            val before = text.substring(at, start)
            // "see https://…, then" reads "see, then"; "see https://… then" keeps its space.
            out.append(if (Closing.containsMatchIn(text.substring(end, min(end + 2, text.length)))) before.replace(TrailingSpaces, "") else before)
            at = end
        }
        return out.append(text.substring(at)).toString()
    }

    /**
     * A story's prose without Markdown syntax (links keep their text). A bare address is left out
     * ([withoutLinks]): the story shows it as a link or its page's card, and in an excerpt it is only
     * a string of characters taking the prose's place. What the writer typed as a character stays
     * that character, as the reader shows it: an entity the editor wrote for it (`-&gt;` reads `->`,
     * `&lt;b&gt;` reads `<b>`) and a Markdown escape (`\#`, `1\.`, `\*`) are the character itself,
     * never syntax ([literals]).
     */
    fun plainText(markdown: String): String =
        restore(
            withoutLinks(literals(markdown).replace(CodeFence, " ").replace(Image, " ").replace(Link, "$1"))
                // After the addresses go: an address's `_`, `~` and `*` are not emphasis.
                .replace(Heading, "")
                .replace(Quote, "")
                .replace(ListMarker, "")
                .replace(Rule, "")
                .replace(Marks, "")
                .replace(Spaces, " ")
                .trim(),
        )

    /** The address of the story's first picture on the web (plainText.ts's firstPicture), or null. */
    fun firstPicture(markdown: String): String? = WebPicture.find(markdown)?.groupValues?.get(1)

    /** CommonMark's backslash escapes: a backslash before ASCII punctuation. */
    private val Escape = Regex("""\\([!-/:-@\[-`{-~])""")
    /** CommonMark's entity references: decimal, hexadecimal, named. */
    private val Entity = Regex("&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));")
    /** The named entities a story can carry (the editor writes the first three; the rest are typed by hand). */
    private val Named = mapOf(
        "amp" to '&'.code, "lt" to '<'.code, "gt" to '>'.code, "quot" to '"'.code, "apos" to '\''.code,
        "nbsp" to 0xA0, "hellip" to 0x2026, "mdash" to 0x2014, "ndash" to 0x2013, "lsquo" to 0x2018, "rsquo" to 0x2019,
        "ldquo" to 0x201C, "rdquo" to 0x201D, "middot" to 0xB7, "bull" to 0x2022, "laquo" to 0xAB, "raquo" to 0xBB,
        "copy" to 0xA9, "reg" to 0xAE, "trade" to 0x2122, "times" to 0xD7, "divide" to 0xF7, "deg" to 0xB0,
    )
    /** Where a literal ASCII mark waits while the syntax is taken out (a private-use plane no story types in). */
    private const val LITERAL = 0xF0000

    /** One character as written: ASCII punctuation set aside where no syntax rule can take it, anything else as it is. */
    private fun literal(code: Int): String =
        if (code in 0x21..0x7E && !Character.isLetterOrDigit(code)) String(Character.toChars(LITERAL + code))
        else String(Character.toChars(code))

    /** The escapes and entities of [markdown] as the characters they stand for (ASCII marks set aside, [restore]). */
    private fun literals(markdown: String): String {
        if ('\\' !in markdown && '&' !in markdown) return markdown
        val escaped = Escape.replace(markdown) { literal(it.groupValues[1][0].code) }
        return Entity.replace(escaped) { m ->
            val (dec, hex, name) = m.destructured
            val code = when {
                dec.isNotEmpty() -> dec.toInt()
                hex.isNotEmpty() -> hex.toInt(16)
                else -> Named[name] ?: return@replace m.value
            }
            // CommonMark: an invalid code point reads as the replacement character.
            if (code == 0 || code > 0x10FFFF || code in 0xD800..0xDFFF) "\uFFFD" else literal(code)
        }
    }

    /** The set-aside marks back as themselves. */
    private fun restore(text: String): String {
        if (text.none { it.isSurrogate() }) return text
        val out = StringBuilder(text.length)
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            if (cp in (LITERAL + 0x21)..(LITERAL + 0x7E)) out.append((cp - LITERAL).toChar()) else out.appendCodePoint(cp)
            i += Character.charCount(cp)
        }
        return out.toString()
    }

    /**
     * The first [max] characters, cut between code points (never half an emoji: slicing UTF-16 units
     * can leave a lone surrogate), with an ellipsis when anything was cut.
     */
    fun excerpt(text: String, max: Int = EXCERPT_CHARS): String {
        val points = text.codePointCount(0, text.length)
        return if (points > max) text.substring(0, text.offsetByCodePoints(0, max)) + "…" else text
    }

    /** The web's plainExcerpt (lib/adapters/story): the prose of [markdown], cut at [max] code points. */
    fun plainExcerpt(markdown: String, max: Int = 80): String = excerpt(plainText(markdown), max)
}
