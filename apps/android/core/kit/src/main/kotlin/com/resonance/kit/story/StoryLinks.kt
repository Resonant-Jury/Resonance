package com.resonance.kit.story

import com.resonance.kit.chat.ChatMessage
import com.resonance.kit.chat.LinkPreview
import com.resonance.kit.chat.Linkify
import com.resonance.api.models.LinkPreview as ApiLinkPreview

/**
 * Which links in a story stand alone — a paragraph that is one link and nothing else — and so may
 * be drawn as their page's card (the server's `standaloneLinks`, src/lib/links/storyLinks.ts, which
 * unfurls them on publish and hands their previews over with the card page). The twin of iOS's
 * story-link rule; native/fixtures/story-link-cards.json is the agreement between them.
 *
 * A paragraph is a standalone link when its only meaningful child is
 *  - an http(s) link (`[text](url)`, `<url>`, a resolved reference link) with no picture inside, or
 *  - a run of plain text that is, trimmed, exactly one link ([Linkify.find]) from end to end.
 *
 * Its key is the URL as the server writes it — `new URL(link).href`, the WHATWG URL serializer —
 * so a preview is found by the address it was made for, and the same links become cards on every
 * platform ([key]). A key with no preview is a paragraph like any other.
 */
object StoryLinks {
    private val HTTP = Regex("^https?://", RegexOption.IGNORE_CASE)

    /** The key of a link written explicitly (`[text](href)`, `<href>`), or null when it isn't a standalone link's. */
    fun keyOf(href: String): String? {
        if (!HTTP.containsMatchIn(href)) return null
        return key(href)
    }

    /** The key of a run of plain text that is one link and nothing else (trimmed), or null. */
    fun bareKey(text: String): String? {
        val trimmed = text.trim()
        val found = Linkify.find(trimmed).singleOrNull() ?: return null
        if (found.range.first != 0 || found.range.last + 1 != trimmed.length) return null
        // In running text the server takes a host written in ASCII only (an IDN there is the homograph trick).
        if (authorityOf(trimmed).any { it.code > 127 }) return null
        return key(trimmed)
    }

    /**
     * The server's key for a link as written: the link rules decide whether it is one at all
     * ([Linkify.normalize] — with the server's own readings: an address in disguise, `127.1`, is the
     * dotted four a browser reads it as; and its own port rule: the scheme's own, or the other of
     * 80 and 443, which it keeps as written), and the rest is WHATWG's serialization of what
     * follows the host ([afterHost]): dot segments resolved, and each part percent-encoded with its
     * own set — so `?q=what's` is `?q=what%27s`, and `{ }` are encoded in the path but not in the
     * query or the fragment.
     */
    private fun key(written: String): String? {
        val url = Linkify.normalize(written) ?: withDottedQuad(written)?.let(Linkify::normalize) ?: return null
        val port = Linkify.displayHost(url)?.substringAfter(':', "").orEmpty()
        if (port.isNotEmpty() && port != "80" && port != "443") return null
        val hostAt = url.indexOf("://") + 3
        val origin = url.substring(0, url.indexOf('/', hostAt).takeIf { it >= 0 } ?: url.length)
        return (origin + afterHost(written.substring(authorityEnd(written)))).takeIf { it.length <= Linkify.MAX_LENGTH }
    }

    /** Where a written link's host (and port) begins: past `scheme://`, or at once for a `www.` link. */
    private fun authorityStart(written: String): Int =
        if (written.regionMatches(0, "www.", 0, 4, ignoreCase = true)) 0 else written.indexOf("://") + 3

    /** Where a written link's host (and port) ends: its path, query or fragment, or the end. */
    private fun authorityEnd(written: String): Int {
        val from = authorityStart(written)
        return written.indexOfAny(charArrayOf('/', '?', '#'), from).takeIf { it >= 0 } ?: written.length
    }

    private fun authorityOf(written: String): String = written.substring(authorityStart(written), authorityEnd(written))

    /**
     * What follows the host of an http(s) URL as WHATWG serializes it ([rest]: the path, query and
     * fragment as written, empty or starting with `/`, `?` or `#`): the path's `.` and `..` segments
     * (also as `%2e`) resolved; then the path, the query (a special scheme's) and the fragment each
     * percent-encoded with their own sets, UTF-8 with upper-case hex; a `%` written stays as it is.
     */
    internal fun afterHost(rest: String): String {
        val hash = rest.indexOf('#')
        val beforeHash = if (hash < 0) rest else rest.substring(0, hash)
        val question = beforeHash.indexOf('?')
        val path = if (question < 0) beforeHash else beforeHash.substring(0, question)
        val out = StringBuilder(serializedPath(path))
        if (question >= 0) out.append('?').append(encoded(beforeHash.substring(question + 1), QUERY))
        if (hash >= 0) out.append('#').append(encoded(rest.substring(hash + 1), FRAGMENT))
        return out.toString()
    }

    private fun serializedPath(path: String): String {
        val segments = ArrayList<String>()
        val parts = path.removePrefix("/").split('/')
        parts.forEachIndexed { i, raw ->
            val last = i == parts.lastIndex
            val segment = encoded(raw, PATH)
            when (segment.lowercase()) {
                // `..` goes up a level; ending the path, it leaves it ending in a slash, as `.` does.
                "..", ".%2e", "%2e.", "%2e%2e" -> {
                    segments.removeLastOrNull()
                    if (last) segments += ""
                }
                ".", "%2e" -> if (last) segments += ""
                else -> segments += segment
            }
        }
        return "/" + segments.joinToString("/")
    }

    /** WHATWG's percent-encode sets past the C0 controls (and everything past `~`, encoded always). */
    private const val FRAGMENT = " \"<>`"
    private const val QUERY = " \"#<>'"
    private const val PATH = " \"#<>?^`{}"

    private fun encoded(part: String, set: String): String {
        if (part.all { it.code in 0x20..0x7E && it !in set }) return part
        val out = StringBuilder()
        var i = 0
        while (i < part.length) {
            val cp = part.codePointAt(i)
            if (cp in 0x20..0x7E && cp.toChar() !in set) {
                out.append(cp.toChar())
            } else {
                // A lone surrogate is no text: the URL parser writes it as U+FFFD (the link rules refuse it first).
                val text = if (cp in 0xD800..0xDFFF) "\uFFFD" else String(Character.toChars(cp))
                text.toByteArray(Charsets.UTF_8).forEach { out.append('%').append("%02X".format(it.toInt() and 0xFF)) }
            }
            i += Character.charCount(cp)
        }
        return out.toString()
    }

    /**
     * The previews the card page brought for its standalone links, by key — each only when it can
     * be drawn: a title, an address the app opens, and a picture only from the API's own image
     * proxy ([origin] is the API's: the server writes the picture as a path of it).
     */
    fun previews(previews: List<ApiLinkPreview>?, origin: String): Map<String, LinkPreview> {
        if (previews.isNullOrEmpty()) return emptyMap()
        val byKey = LinkedHashMap<String, LinkPreview>()
        for (p in previews) {
            // Keyed by the address as the server wrote it, read as a paragraph's key is (the same, for what the server
            // writes: it is that key already); opened as the link rules read it.
            if (Linkify.normalize(p.url) == null) continue
            val key = keyOf(p.url) ?: p.url
            if (byKey.containsKey(key)) continue
            val title = p.title.trim().takeIf { it.isNotEmpty() } ?: continue
            byKey[key] = LinkPreview(
                url = p.url,
                title = title,
                description = p.description?.trim()?.takeIf { it.isNotEmpty() },
                siteName = p.siteName?.trim()?.takeIf { it.isNotEmpty() },
                imageUrl = ChatMessage.imageUrl(p.image, origin),
            )
        }
        return byKey
    }

    /**
     * [href] with its host written as the dotted four a browser reads it as, when the host is an
     * IPv4 address in disguise (`127.1`, `0x7f.1`, `2130706433`: the WHATWG URL parser's reading,
     * which the server's keys come from); null for any other host.
     */
    internal fun withDottedQuad(href: String): String? {
        val sep = href.indexOf("://")
        if (sep < 0) return null
        val rest = href.substring(sep + 3)
        val cut = rest.indexOfFirst { it == '/' || it == '?' || it == '#' }.let { if (it < 0) rest.length else it }
        val authority = rest.substring(0, cut)
        if ('@' in authority) return null
        val host = authority.substringBefore(':')
        val quad = dottedQuad(host.lowercase()) ?: return null
        return href.substring(0, sep + 3) + quad + authority.substring(host.length) + rest.substring(cut)
    }

    /** The WHATWG IPv4 parser: a host of one to four numbers (decimal, `0x` hex, `0` octal) as `a.b.c.d`, or null. */
    internal fun dottedQuad(host: String): String? {
        var parts = host.split('.')
        if (parts.size > 1 && parts.last().isEmpty()) parts = parts.dropLast(1)
        if (parts.isEmpty() || parts.size > 4) return null
        val numbers = parts.map { ipv4Number(it) ?: return null }
        if (numbers.dropLast(1).any { it > 255 }) return null
        val lastLimit = 1L shl (8 * (5 - numbers.size))
        if (numbers.last() >= lastLimit) return null
        var address = numbers.last()
        numbers.dropLast(1).forEachIndexed { i, n -> address += n shl (8 * (3 - i)) }
        return (3 downTo 0).joinToString(".") { ((address shr (8 * it)) and 0xFF).toString() }
    }

    private fun ipv4Number(part: String): Long? {
        if (part.isEmpty()) return null
        val (digits, radix) = when {
            part.length >= 2 && (part.startsWith("0x") || part.startsWith("0X")) -> part.substring(2) to 16
            part.length >= 2 && part.startsWith("0") -> part.substring(1) to 8
            else -> part to 10
        }
        if (digits.isEmpty()) return 0
        // A number longer than any address is none (and keeps clear of a Long's limits).
        if (digits.length > 12) return null
        return digits.toLongOrNull(radix)?.takeIf { it >= 0 }
    }
}
