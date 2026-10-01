package com.resonance.kit.story

/**
 * Where a link in a story leads, decided by its scheme — the web reader keeps only safe protocols
 * (react-markdown's default), and so do the apps. A page of the site (a relative link, or http(s)
 * on the site's own host) opens in the app; any other web page opens in the in-app browser; a
 * mailto: link opens a mail app. Anything else (tel:, sms:, another app's own scheme, javascript:)
 * is plain text: the reader never hands it to the system. The twin of iOS's StoryLink.
 */
sealed interface StoryLink {
    /** A page of this site: its path from the root (and its query), resolved as the web resolves it from a card's page. */
    data class Site(val path: String) : StoryLink
    /** A page elsewhere on the web. */
    data class Web(val url: String) : StoryLink
    /** An email address to write to. */
    data class Mail(val url: String) : StoryLink

    companion object {
        /** The page a story is read on, which relative links resolve against (`/card/{key}`). */
        private const val BASE = "/card/"
        private val scheme = Regex("^([A-Za-z][A-Za-z0-9+.-]*):")

        /** Whether a link can lead anywhere at all: the reader draws the others as plain text. */
        fun isTappable(href: String): Boolean = kind(href) != null

        /** Where `href` leads for a reader of the site at `origin` (e.g. `https://resonance-world.vercel.app`); null: nowhere. */
        fun resolve(href: String, origin: String): StoryLink? {
            val link = href.trim()
            return when (kind(link)) {
                Kind.Relative -> Site(sitePath(link))
                Kind.Web -> {
                    val absolute = if (link.startsWith("//")) "https:$link" else link
                    val host = hostOf(absolute) ?: return null
                    if (host == hostOf(origin)) Site(sitePath(afterAuthority(absolute))) else Web(absolute)
                }
                Kind.Mail -> Mail(link)
                null -> null
            }
        }

        private enum class Kind { Relative, Web, Mail }

        private fun kind(href: String): Kind? {
            val link = href.trim()
            // Nothing to open, or a jump within the page; and control characters or spaces inside a
            // link are how a scheme gets disguised (`java\tscript:`).
            if (link.isEmpty() || link.startsWith("#") || link.any { it.isISOControl() || it.isWhitespace() }) return null
            val name = scheme.find(link)?.groupValues?.get(1)?.lowercase()
            return when {
                name == "http" || name == "https" -> if (hostOf(link) != null) Kind.Web else null
                name == "mailto" -> if (link.length > "mailto:".length) Kind.Mail else null
                name != null -> null
                link.startsWith("//") -> if (hostOf("https:$link") != null) Kind.Web else null
                // A colon before the first slash, without a valid scheme, is no path either (RFC 3986 §4.2).
                link.takeWhile { it != '/' && it != '?' && it != '#' }.contains(':') -> null
                else -> Kind.Relative
            }
        }

        /** The authority of an absolute URL: up to its path, query or fragment (a backslash counts as a slash, as browsers read it). */
        private fun authority(url: String): String? {
            val start = url.indexOf("://").takeIf { it >= 0 } ?: return null
            return url.substring(start + 3).takeWhile { it != '/' && it != '\\' && it != '?' && it != '#' }
        }

        private fun afterAuthority(url: String): String {
            val start = url.indexOf("://") + 3
            return url.substring(start + (authority(url)?.length ?: 0))
        }

        /** The lowercased host, without credentials or port; null when there is none. */
        private fun hostOf(url: String): String? {
            val hostPort = authority(url)?.substringAfterLast('@') ?: return null
            val host = if (hostPort.startsWith("[")) hostPort.substringBefore(']') + "]" else hostPort.substringBefore(':')
            return host.lowercase().trimEnd('.').takeIf { it.isNotEmpty() }
        }

        /** A path (with its query, without its fragment) resolved against the card page and freed of dot segments. */
        private fun sitePath(ref: String): String {
            val bare = ref.substringBefore('#')
            val path = bare.substringBefore('?')
            val query = bare.substringAfter('?', "").let { if (it.isEmpty()) "" else "?$it" }
            val merged = when {
                path.isEmpty() -> "/"
                path.startsWith("/") || path.startsWith("\\") -> path
                else -> BASE + path
            }
            val segments = ArrayList<String>()
            for (segment in merged.replace('\\', '/').split('/')) {
                when (segment) {
                    "", "." -> {}
                    ".." -> segments.removeLastOrNull()
                    else -> segments += segment
                }
            }
            return "/" + segments.joinToString("/") + query
        }
    }
}
