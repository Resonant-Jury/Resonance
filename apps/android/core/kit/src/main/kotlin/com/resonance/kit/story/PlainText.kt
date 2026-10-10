package com.resonance.kit.story

import com.resonance.kit.chat.Linkify
import com.resonance.kit.text.Entities
import java.util.regex.Matcher
import java.util.regex.Pattern
import kotlin.math.min

/**
 * A story's prose as lists and previews show it (src/lib/markdown/plainText.ts, line for line) — the
 * excerpt the server stores beside a card, the web's story cards, the thought map's nodes — one set
 * of rules on the server, in the browser and here.
 *
 * Where JavaScript's regular expressions and the JVM's (ICU's, on a device) read alike only when
 * spelled out, they are:
 *  - `\s` is JavaScript's: Unicode spaces, the BOM and the vertical tab ([S]; Java's `\s` is ASCII,
 *    ICU's leaves out U+000B and U+FEFF), and `\d` is `[0-9]` (ICU's is every decimal digit).
 *  - `^` and `$` on every line are JavaScript's ([BOL], [EOL]): a line ends at `\n`, `\r`, U+2028 and
 *    U+2029 only — Java and ICU end one at U+0085 too.
 *  - A bounded run counts UTF-16 units, as JavaScript does without the `u` flag, not code points as
 *    Java and ICU do: a link of 300 emoji (600 units) keeps its brackets here as on the server ([fits]).
 *  - Java's look-behind reads one UTF-16 unit back, blind to a letter outside the BMP: the underscore
 *    rule is a loop ([withoutEdgeUnderscores]), as is the trailing-space trim (linear where `\s+$` isn't).
 *  - Kotlin's trim takes U+001C–U+001F too; JavaScript's doesn't.
 */
object PlainText {
    /** How much of the prose a list's excerpt shows (the web's EXCERPT_CHARS). */
    const val EXCERPT_CHARS = 96

    /** JavaScript's `\s`: its WhiteSpace and LineTerminator. */
    private const val S = "[\\t\\n\\u000B\\f\\r\\p{Z}\\uFEFF]"
    /** JavaScript's `^` under the `m` flag. */
    private const val BOL = "(?:^|(?<=[\\n\\r\\u2028\\u2029]))"
    /** JavaScript's `$` under the `m` flag. */
    private const val EOL = "(?=[\\n\\r\\u2028\\u2029]|\\z)"

    /** Closing marks — sentence punctuation, closing brackets and quotes, CJK ones too: the sentence's, never the link's. */
    private val Closing = Regex("^[\\p{Po}\\p{Pe}\\p{Pf}]")

    /**
     * What the writer wrote as text and Markdown must not read as syntax: a backslash-escaped ASCII
     * punctuation mark (`\*`, `1\.`, `\#` — the editor writes them) and a character reference (`&gt;` —
     * the editor writes `<`, `>` and `&` typed as text that way; `->` is stored `-&gt;`). Each such mark
     * stands in as a private-use character, U+E000 plus its ASCII code, one UTF-16 unit for one, so
     * offsets agree with the restored text, until the syntax is gone ([restore]). Those private-use
     * characters are never in a story's prose otherwise: [plainText] drops any it is given.
     */
    private const val LITERAL = 0xE000
    private val Literals = Regex("[\\uE021-\\uE07E]")

    private fun isAsciiPunctuation(c: Char): Boolean = c in '!'..'/' || c in ':'..'@' || c in '['..'`' || c in '{'..'~'

    private fun literal(char: String): String =
        if (char.length == 1 && isAsciiPunctuation(char[0])) (LITERAL + char[0].code).toChar().toString() else char

    /** An escape, a hard break (a backslash at a line's end) or a character reference (group 2 its body). */
    private val EscapeOrEntity = Regex("\\\\([!-/:-@\\[-`{-~])|\\\\\\r?\\n|${Entities.PATTERN}")

    private fun literals(markdown: String): String =
        EscapeOrEntity.replace(markdown) { m ->
            val escaped = m.groups[1]?.value
            val body = m.groups[2]?.value
            when {
                escaped != null -> literal(escaped)
                // A backslash at a line's end is a hard break: a space, as any line break is here.
                body == null -> " "
                else -> Entities.value(body)?.let(::literal) ?: m.value
            }
        }

    /** The marks [literals] set aside, back as the characters they are. */
    private fun restore(text: String): String = Literals.replace(text) { (it.value[0].code - LITERAL).toChar().toString() }

    /** JavaScript's `\s+$` on [text] — a loop, not that pattern, which retries every space of a long run before anything else (quadratic). */
    private fun trimTrailingSpace(text: String): String {
        var end = text.length
        while (end > 0 && isSpace(text[end - 1])) end--
        return text.substring(0, end)
    }

    /** One UTF-16 unit of JavaScript's `\s` ([S]; no character outside the BMP is one). */
    private fun isSpace(c: Char): Boolean = when (c) {
        '\t', '\n', '\u000B', '\u000C', '\r', '\uFEFF' -> true
        else -> c.category == CharCategory.SPACE_SEPARATOR || c.category == CharCategory.LINE_SEPARATOR ||
            c.category == CharCategory.PARAGRAPH_SEPARATOR
    }

    /**
     * The text without its bare addresses: exactly the links the one link rule finds ([Linkify.find],
     * the twin of the web's findLinks — which already leaves the sentence's punctuation, CJK too, and
     * an unmatched `)` outside the link), each with the `<…>` of an autolink around it. Everything else
     * the writer wrote stays: the words either side, the punctuation after the address (and no space is
     * left hanging before it), an address the rule doesn't accept (`foo@www.…`, `localhost`). Marks set
     * aside by [literals] count as what they stand for.
     */
    fun withoutLinks(text: String): String {
        val plain = restore(text)
        val out = StringBuilder()
        var at = 0
        for (link in Linkify.find(plain)) {
            var start = link.range.first
            var end = link.range.last + 1
            if (start > 0 && end < plain.length && plain[start - 1] == '<' && plain[end] == '>') {
                start--
                end++
            }
            val before = text.substring(at, maxOf(at, start))
            // "see https://…, then" reads "see, then"; "see https://… then" keeps its space.
            out.append(if (Closing.containsMatchIn(plain.substring(end, min(end + 2, plain.length)))) trimTrailingSpace(before) else before)
            at = end
        }
        return out.append(text.substring(at)).toString()
    }

    /**
     * A picture, `![alt](src)`, and a link, `[text](destination)` (its text is group 1), on one line.
     * Every run is bounded — a link's text by [LINK_TEXT_MAX], its destination by the longest address
     * the link rule takes — so no attempt reads on to the story's end: unbounded, a story of 200 000
     * unclosed `[` (or `[a](` over and over) took seconds to read. A link whose text runs longer shows
     * its brackets in an excerpt, which is harmless. Each run is possessive (`{…}+`, which JavaScript
     * lacks): its class holds no `]` / `)`, so giving a character back could never let the mark after
     * it match — the same matches, without trying every shorter run. The runs are groups so [fits] can
     * hold them to JavaScript's count.
     */
    const val LINK_TEXT_MAX = 500
    private val Picture = Pattern.compile("!\\[([^\\]\\n]{0,$LINK_TEXT_MAX}+)\\]\\(([^)\\n]{0,${Linkify.MAX_LENGTH}}+)\\)")
    private val Link = Pattern.compile("\\[([^\\]\\n]{0,$LINK_TEXT_MAX}+)\\]\\(([^)\\n]{0,${Linkify.MAX_LENGTH}}+)\\)")
    /** A picture with a web address, `![alt](https://…)` (the address is group 2, past its scheme group 3), bounded as [Picture] is. */
    private val WebPicture =
        Pattern.compile("!\\[([^\\]\\n]{0,$LINK_TEXT_MAX}+)\\]\\((https?://([^\\t\\n\\u000B\\f\\r\\p{Z}\\uFEFF)]{1,${Linkify.MAX_LENGTH}}+))\\)")

    /**
     * Whether a match's runs — the link's text (group 1) and the run after it (the last group) — are
     * within JavaScript's bounds, which count UTF-16 units where the pattern counted code points.
     */
    private fun fits(m: Matcher): Boolean =
        m.group(1).length <= LINK_TEXT_MAX && m.group(m.groupCount()).length <= Linkify.MAX_LENGTH

    /**
     * Every match of [pattern] in [text] that [fits], each as [by] says — JavaScript's replace with that
     * pattern: one that doesn't fit is no match where it starts, and the search goes on from the next character.
     */
    private fun replaceFitting(text: String, pattern: Pattern, by: (Matcher) -> String): String {
        val m = pattern.matcher(text)
        val out = StringBuilder()
        var at = 0
        var from = 0
        while (from < text.length && m.find(from)) {
            if (!fits(m)) {
                from = m.start() + 1
                continue
            }
            out.append(text, at, m.start()).append(by(m))
            at = m.end()
            from = at
        }
        return out.append(text, at, text.length).toString()
    }

    /** The address of the story's first picture on the web — a thought-map node's little visual — or null. */
    fun firstPicture(markdown: String): String? {
        val m = WebPicture.matcher(markdown)
        var from = 0
        while (from < markdown.length && m.find(from)) {
            if (fits(m)) return m.group(2)
            from = m.start() + 1
        }
        return null
    }

    private val CodeFence = Regex("```[\\s\\S]*?```")
    private val Heading = Regex("$BOL#{1,6}$S+")
    private val Quote = Regex("$BOL>$S?")
    // A marker's indent is spaces and tabs on its own line: `^\s*` would read on across every blank line after it, at each one (quadratic).
    private val ListMarker = Regex("$BOL[ \\t]*(?:[-*+]|[0-9]+\\.)$S+")
    private val Rule = Regex("$BOL[ \\t]*(?:-{3,}|\\*{3,}|_{3,})[ \\t]*$EOL")
    private val Marks = Regex("[*~`]+")
    private val Spaces = Regex("$S+")

    /**
     * An underscore inside a word is the word's (snake_case, a_b_c): only one at a word's edge can be
     * emphasis. plainText.ts's `(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])` comes to this: a lone underscore
     * between two letters or digits stays, every other run of underscores goes (`a__b` reads `ab`). A
     * loop, not that pattern: Java's look-behind reads one UTF-16 unit back, so it never sees a letter
     * outside the BMP (`𠀀_𠀀`).
     */
    private fun withoutEdgeUnderscores(text: String): String {
        if ('_' !in text) return text
        val out = StringBuilder(text.length)
        var i = 0
        while (i < text.length) {
            if (text[i] != '_') {
                out.append(text[i++])
                continue
            }
            var end = i
            while (end < text.length && text[end] == '_') end++
            if (end - i == 1 && i > 0 && end < text.length && isWordChar(text.codePointBefore(i)) && isWordChar(text.codePointAt(end))) {
                out.append('_')
            }
            i = end
        }
        return out.toString()
    }

    /** `[\p{L}\p{N}]`: a letter or a number of any kind. */
    private fun isWordChar(cp: Int): Boolean = Character.isLetter(cp) || when (Character.getType(cp).toByte()) {
        Character.DECIMAL_DIGIT_NUMBER, Character.LETTER_NUMBER, Character.OTHER_NUMBER -> true
        else -> false
    }

    /**
     * A story's prose without Markdown syntax (links keep their text), as a reader sees it: character
     * references decoded (`-&gt;` reads `->`) and backslash escapes gone (`\*` reads `*`), without
     * either ever making syntax. A bare address is left out ([withoutLinks]): the story shows it as a
     * link or its page's card, and in an excerpt it is only a string of characters taking the prose's place.
     */
    fun plainText(markdown: String): String {
        val text = literals(markdown.replace(Literals, "").replace(CodeFence, " "))
        // After the addresses go: an address's `_`, `~` and `*` are not emphasis.
        val prose = withoutLinks(replaceFitting(replaceFitting(text, Picture) { " " }, Link) { it.group(1) })
            .replace(Heading, "")
            .replace(Quote, "")
            .replace(ListMarker, "")
            .replace(Rule, "")
            .replace(Marks, "")
        return restore(
            withoutEdgeUnderscores(prose)
                .replace(Spaces, " ")
                // Every space left is a single " ": JavaScript's trim, which Kotlin's (U+001C–U+001F too) is not.
                .trim(' '),
        )
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
