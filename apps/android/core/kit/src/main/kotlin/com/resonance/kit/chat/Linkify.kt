package com.resonance.kit.chat

import java.net.IDN
import java.util.Locale

/**
 * The links in a message, and whether a tap on one may open it. Pure Kotlin; the rules are the
 * server's `firstLink` (src/lib/links/url.ts), which unfurls the first link of a message, so what
 * the apps make tappable and what the server previews are the same links — with one difference
 * on purpose: a port other than the default is a link here (it opens after a confirmation, see
 * [isSuspicious]) but the server fetches only ports 80 and 443.
 *
 * What counts as a link in text:
 *  - It starts with `http://` or `https://` (any case), or `www.`, not inside a word or a path (the
 *    character before it is no ASCII letter or digit and none of `. _ @ / % \ -`). A bare
 *    `example.com` is not a link.
 *  - It runs up to the first space or control character, any character that can't be in a
 *    link (`< > " ` \ ^`), any invisible or format character (zero-width, bidi marks), any
 *    CJK or full-width punctuation or space (`，。！？、「」（）…`), curly quotes, `« »`, an arrow,
 *    symbol or emoji, so a link written in Chinese text stops where the sentence goes on. In the
 *    host part a letter that isn't ASCII also ends it when the host so far is already a dotted ASCII
 *    name (`https://example.com很棒` is `example.com`); a host written in Unicode
 *    (`https://例子.測試`) is read whole and becomes its `xn--` form.
 *  - Trailing `. , ; : ! ? ' * ~` come off, and a `)`, `]` or `}` with no opening one in the link.
 *  - Only http and https; no userinfo (`user@host` — the classic disguise, never a link); the host
 *    has a dot, labels of letters, digits, `-` and `_`, and isn't a number in disguise (`127.1`,
 *    `0x7f.1`, `2130706433` aren't links; a plain `1.2.3.4` is, and is suspicious); a port is
 *    digits; at most [MAX_LENGTH] characters, as written and normalized.
 *
 * A link's normalized URL is what the apps open and compare: scheme and host in lower case (the
 * host in punycode), the default port dropped, an empty path `/`, anything that isn't ASCII (and
 * `{ }`) in the path, query and fragment percent-encoded; a `www.` link gets `https://`.
 *
 * Ranges are IntRange over the text's UTF-16 indices, both ends inclusive (`first`, `last + 1`
 * for an AnnotatedString).
 */
object Linkify {
    const val MAX_LENGTH = 2048

    /** One link in a text: where it is written and where it leads. */
    data class Link(val range: IntRange, val url: String)

    /** What a tap on a link does. */
    sealed interface LinkAction {
        /** Open it. */
        data class Open(val url: String) : LinkAction
        /** Ask first: [host] is the ASCII host (and port) the link really leads to. */
        data class Confirm(val url: String, val host: String) : LinkAction
        /** Not a link the app opens (another scheme, userinfo, no real host): say so, open nothing. */
        data object Unsupported : LinkAction
    }

    private val start = Regex("https?://|www\\.", RegexOption.IGNORE_CASE)

    /** Every link in [text], in order. */
    fun find(text: String): List<Link> {
        val links = ArrayList<Link>()
        var from = 0
        while (from < text.length) {
            val match = start.find(text, from) ?: break
            val begin = match.range.first
            val www = match.value.startsWith("w", ignoreCase = true)
            if (!standsAlone(text, begin)) {
                from = begin + 1
                continue
            }
            // `www.` has no scheme, so its host starts at once; after `https://` the host starts past the slashes.
            val run = scan(text, begin, if (www) begin else match.range.last + 1)
            val end = trimmed(text, begin, run)
            val url = if (end > begin) normalize(text.substring(begin, end)) else null
            if (url != null) links += Link(begin until end, url)
            // A run that isn't a link is skipped whole: what is inside it isn't a link of its own.
            from = maxOf(run, begin + 1)
        }
        return links
    }

    /** The first link in [text] — the one the server unfurls. */
    fun first(text: String): Link? = find(text).firstOrNull()

    private fun standsAlone(text: String, begin: Int): Boolean {
        if (begin == 0) return true
        val before = text[begin - 1]
        return !(before.code < 128 && (before.isLetterOrDigit() || before in "._@/%\\-"))
    }

    /** The end (exclusive) of the run of link characters from [begin]; the host starts at [hostStart]. */
    private fun scan(text: String, begin: Int, hostStart: Int): Int {
        var i = begin
        var inHost = true
        while (i < text.length) {
            val cp = text.codePointAt(i)
            if (ends(cp)) break
            if (i >= hostStart && inHost) {
                if (cp == '/'.code || cp == '?'.code || cp == '#'.code) {
                    inHost = false
                } else if (cp > 127 && hostIsDottedAscii(text, hostStart, i)) {
                    break
                }
            }
            i += Character.charCount(cp)
        }
        return i
    }

    /** The host so far is a dotted ASCII name ending in a letter, digit or hyphen: more letters after it belong to the sentence. */
    private fun hostIsDottedAscii(text: String, from: Int, to: Int): Boolean {
        if (to <= from) return false
        val so = text.substring(from, to)
        val last = so.last()
        return so.contains('.') && so.all { it.code < 128 } && (last.isLetterOrDigit() || last == '-')
    }

    private fun ends(cp: Int): Boolean {
        if (cp <= 0x20 || cp in 0x7F..0x9F) return true
        if (cp == '<'.code || cp == '>'.code || cp == '"'.code || cp == '`'.code || cp == '\\'.code || cp == '^'.code) return true
        if (cp == 0xAB || cp == 0xBB) return true
        // Separators and invisible characters of every kind: no-break and ideographic spaces, zero-width and bidi marks.
        if (Character.isSpaceChar(cp) || Character.getType(cp) == Character.FORMAT.toInt()) return true
        return when (cp) {
            // General punctuation (dashes, curly quotes, ellipsis), arrows, math, dingbats and symbols,
            in 0x2000..0x206F, in 0x2190..0x2BFF,
            // CJK symbols and punctuation, variation selectors, CJK compatibility and small forms, full-width forms,
            in 0x3000..0x303F, in 0xFE00..0xFE0F, in 0xFE30..0xFE6F, in 0xFF00..0xFFEF,
            // and emoji.
            in 0x1F000..0x1FFFF -> true
            else -> false
        }
    }

    private fun trimmed(text: String, begin: Int, run: Int): Int {
        var end = run
        while (end > begin) {
            val c = text[end - 1]
            if (c in ".,;:!?'*~") {
                end--
            } else if (c == ')' && unbalanced(text, begin, end, '(', ')')) {
                end--
            } else if (c == ']' && unbalanced(text, begin, end, '[', ']')) {
                end--
            } else if (c == '}' && unbalanced(text, begin, end, '{', '}')) {
                end--
            } else {
                break
            }
        }
        return end
    }

    private fun unbalanced(text: String, from: Int, to: Int, open: Char, close: Char): Boolean {
        var opens = 0
        var closes = 0
        for (i in from until to) {
            if (text[i] == open) opens++ else if (text[i] == close) closes++
        }
        return closes > opens
    }

    // Normalizing

    private class Split(val scheme: String, val userinfo: Boolean, val unicodeHost: Boolean, val host: String, val port: Int?, val rest: String) {
        val defaultPort get() = if (scheme == "https") 443 else 80
    }

    private fun split(url: String): Split? {
        val sep = url.indexOf("://")
        if (sep <= 0) return null
        val scheme = url.substring(0, sep).lowercase(Locale.ROOT)
        if (scheme != "http" && scheme != "https") return null
        val after = url.substring(sep + 3)
        val cut = after.indexOfFirst { it == '/' || it == '?' || it == '#' || it == '\\' }.let { if (it < 0) after.length else it }
        var authority = after.substring(0, cut)
        val rest = after.substring(cut)
        val at = authority.lastIndexOf('@')
        val userinfo = at >= 0
        if (userinfo) authority = authority.substring(at + 1)
        val bracketed = authority.startsWith("[")
        val colon = authority.lastIndexOf(':')
        var hostText = authority
        var port: Int? = null
        if (colon >= 0 && !(bracketed && colon < authority.indexOf(']'))) {
            hostText = authority.substring(0, colon)
            val digits = authority.substring(colon + 1)
            if (digits.isNotEmpty()) {
                if (digits.length > 5 || !digits.all { it in '0'..'9' }) return null
                port = digits.toInt().takeIf { it in 1..65535 } ?: return null
            }
        }
        val unicode = hostText.any { it.code > 127 }
        val host = if (unicode) {
            try {
                IDN.toASCII(hostText, IDN.ALLOW_UNASSIGNED)
            } catch (_: Exception) {
                return null
            }
        } else {
            hostText
        }
        return Split(scheme, userinfo, unicode, host.lowercase(Locale.ROOT), port, rest)
    }

    /**
     * The normalized URL of [url] (a link as written, `www.` included), or null when it isn't a link the
     * app opens: another scheme, userinfo, a host that isn't a dotted name, an address in disguise,
     * a backslash, a control character or space, too long.
     */
    fun normalize(url: String): String? {
        val written = url.trim()
        if (written.isEmpty() || written.length > MAX_LENGTH) return null
        if (written.any { it.isWhitespace() || Character.isISOControl(it) || it == '\\' }) return null
        val withScheme = if (written.regionMatches(0, "www.", 0, 4, ignoreCase = true)) "https://$written" else written
        val s = split(withScheme) ?: return null
        if (s.userinfo || !validHost(s.host)) return null
        val encoded = percentEncoded(s.rest) ?: return null
        val path = when {
            encoded.isEmpty() -> "/"
            encoded[0] == '/' -> encoded
            else -> "/$encoded"
        }
        val port = s.port?.takeIf { it != s.defaultPort }?.let { ":$it" }.orEmpty()
        return "${s.scheme}://${s.host}$port$path".takeIf { it.length <= MAX_LENGTH }
    }

    private fun validHost(host: String): Boolean {
        if (host.isEmpty() || host.length > 253) return false
        val labels = host.split('.')
        if (labels.size < 2) return false
        for (label in labels) {
            if (label.isEmpty() || label.length > 63 || label.startsWith('-') || label.endsWith('-')) return false
            if (!label.all { it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '_' }) return false
        }
        // A last label that is a number makes the whole host an address (and browsers read `127.1`, `0x7f.1` as one):
        // only the plain dotted four are kept.
        if (isNumber(labels.last())) return isDottedQuad(labels)
        return true
    }

    private fun isNumber(label: String): Boolean =
        label.isNotEmpty() && (label.all { it in '0'..'9' } || (label.startsWith("0x") && label.drop(2).all { it in '0'..'9' || it in 'a'..'f' }))

    private fun isDottedQuad(labels: List<String>): Boolean = labels.size == 4 && labels.all { l ->
        l.length in 1..3 && l.all { it in '0'..'9' } && (l == "0" || !l.startsWith('0')) && l.toInt() <= 255
    }

    /** Everything that isn't ASCII, and `{ }`, as UTF-8 percent escapes; null for a lone surrogate (not text). */
    private fun percentEncoded(s: String): String? {
        if (s.all { it.code < 128 && it != '{' && it != '}' }) return s
        val out = StringBuilder()
        var i = 0
        while (i < s.length) {
            val cp = s.codePointAt(i)
            if (cp in 0xD800..0xDFFF) return null
            if (cp < 128 && cp != '{'.code && cp != '}'.code) {
                out.append(cp.toChar())
            } else {
                String(Character.toChars(cp)).toByteArray(Charsets.UTF_8).forEach { out.append('%').append("%02X".format(it.toInt() and 0xFF)) }
            }
            i += Character.charCount(cp)
        }
        return out.toString()
    }

    // Opening

    /**
     * Whether [url] deserves a question before it opens: an address instead of a name (`1.2.3.4`,
     * `[::1]`), a punycode or Unicode host (`xn--` — lookalikes of a known name), a port other
     * than the scheme's own, an `@` before the path (userinfo hides the real host), a backslash, or
     * anything that doesn't parse. Asked of any URL, not only the ones [find] made.
     */
    fun isSuspicious(url: String): Boolean {
        if (url.contains('\\')) return true
        val s = split(url.trim()) ?: return true
        if (s.userinfo || s.unicodeHost || s.host.isEmpty()) return true
        if (s.host.startsWith("[") || isNumber(s.host.substringAfterLast('.'))) return true
        if (s.host.split('.').any { it.startsWith("xn--") }) return true
        return s.port != null && s.port != s.defaultPort
    }

    /** The host a link leads to as the confirmation shows it: ASCII (punycode for a Unicode name), with its port if not the default. */
    fun displayHost(url: String): String? {
        val s = split(url.trim()) ?: return null
        return s.host + (s.port?.takeIf { it != s.defaultPort }?.let { ":$it" }.orEmpty())
    }

    /** What a tap on [url] does: open it, ask first (it is [isSuspicious]) or nothing (not a link we open). */
    fun action(url: String): LinkAction {
        val normalized = normalize(url) ?: return LinkAction.Unsupported
        if (!isSuspicious(normalized)) return LinkAction.Open(normalized)
        return LinkAction.Confirm(normalized, displayHost(normalized) ?: normalized)
    }
}
