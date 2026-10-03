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
 * Its key is the URL as the server writes it, so a preview is found by the address it was made
 * for: what [Linkify.normalize] makes of it — with the server's two extra refusals (a port other
 * than the scheme's own) and readings (an address in disguise, `127.1`, is the dotted four a
 * browser reads it as). A key with no preview is a paragraph like any other.
 */
object StoryLinks {
    private val HTTP = Regex("^https?://", RegexOption.IGNORE_CASE)

    /** The key of a link written explicitly (`[text](href)`, `<href>`), or null when it isn't a standalone link's. */
    fun keyOf(href: String): String? {
        if (!HTTP.containsMatchIn(href)) return null
        val url = Linkify.normalize(href) ?: withDottedQuad(href)?.let(Linkify::normalize) ?: return null
        // The server follows a link only on its scheme's own port (`:8443` is no link of a story's).
        return url.takeUnless { Linkify.displayHost(it).orEmpty().contains(':') }
    }

    /** The key of a run of plain text that is one link and nothing else (trimmed), or null. */
    fun bareKey(text: String): String? {
        val trimmed = text.trim()
        val found = Linkify.find(trimmed).singleOrNull() ?: return null
        if (found.range.first != 0 || found.range.last + 1 != trimmed.length) return null
        return keyOf(found.url)
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
            // Keyed by the address as the server wrote it (the key a paragraph derives); opened as the link rules read it.
            if (Linkify.normalize(p.url) == null || byKey.containsKey(p.url)) continue
            val title = p.title.trim().takeIf { it.isNotEmpty() } ?: continue
            byKey[p.url] = LinkPreview(
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
