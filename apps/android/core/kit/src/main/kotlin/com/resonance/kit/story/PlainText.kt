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
    private val Image = Regex("!\\[[^\\]]*\\]\\([^)]*\\)")
    private val Link = Regex("\\[([^\\]]*)\\]\\([^)]*\\)")
    private val Heading = Regex("^#{1,6}$S+", RegexOption.MULTILINE)
    private val Quote = Regex("^>$S?", RegexOption.MULTILINE)
    private val ListMarker = Regex("^$S*(?:[-*+]|\\d+\\.)$S+", RegexOption.MULTILINE)
    private val Rule = Regex("^$S*(?:-{3,}|\\*{3,}|_{3,})$S*$", RegexOption.MULTILINE)
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
     * a string of characters taking the prose's place.
     */
    fun plainText(markdown: String): String =
        withoutLinks(markdown.replace(CodeFence, " ").replace(Image, " ").replace(Link, "$1"))
            // After the addresses go: an address's `_`, `~` and `*` are not emphasis.
            .replace(Heading, "")
            .replace(Quote, "")
            .replace(ListMarker, "")
            .replace(Rule, "")
            .replace(Marks, "")
            .replace(Spaces, " ")
            .trim()

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
