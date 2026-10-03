package com.resonance.kit.chat

import com.resonance.api.models.FeedCard
import java.net.URLDecoder

/**
 * A Resonance card a message shares — the card it carries ([ChatMessage.cardRef], [attached]), or
 * the card page its link leads to — which the thread draws as the card itself (Messenger's shared
 * post) instead of a link and its preview. [key] is what the card is asked for by
 * (`GET /cards?keys=`: an id or a slug); [link] is the link in the text it came from, if any.
 */
data class SharedCard(val key: String, val attached: Boolean, val link: Linkify.Link? = null)

/**
 * Which messages share a card of the site, and which card. Pure; the twin of the web's and iOS's
 * card-link rules (they read the same list of hosts).
 *
 * A link is a card's when it is http(s) on one of the site's hosts ([HOSTS]: the site's own,
 * its `www.`, and the address it had before) — or, in a build that talks to a local stack, the
 * stack's own host and port — and its path is `/card/{key}`, optionally after a language
 * (`/en`, `/zh-TW`), with nothing after the key but a slash, a query or a fragment. Whole host names
 * only: a look-alike such as `resonance.channel.example.com` is someone else's page.
 */
object SharedCards {
    /** The site's hosts, now and before, whose card pages a message can share. */
    val HOSTS: Set<String> = setOf("resonance.channel", "www.resonance.channel", "resonance-world.vercel.app")

    /** The languages a card page's path may start with (any case, as the site's middleware reads them). */
    private val LOCALES = setOf("en", "zh-tw")

    /**
     * The card [message] shares: its `cardRef`, else the card its preview's page or its first link
     * leads to. [ownHost] is the local stack's `host:port` in a build that talks to one (null for
     * production, whose hosts are [HOSTS]).
     */
    fun of(message: ChatMessage, ownHost: String? = null): SharedCard? {
        message.cardRef?.let { return SharedCard(it, attached = true) }
        val first = Linkify.first(message.text)
        first?.let { link -> keyOf(link.url, ownHost)?.let { return SharedCard(it, attached = false, link) } }
        // The preview's page is the first link as the server read it; a link the apps read otherwise still counts.
        return message.preview?.url?.let { keyOf(it, ownHost) }?.let { SharedCard(it, attached = false) }
    }

    /** The card key a link leads to (decoded), or null when it isn't a card page of the site. */
    fun keyOf(url: String, ownHost: String? = null): String? {
        val normalized = Linkify.normalize(url) ?: return null
        val afterScheme = normalized.substringAfter("://")
        val authority = afterScheme.substringBefore('/')
        if (authority !in HOSTS && (ownHost == null || authority != ownHost.lowercase())) return null
        val path = afterScheme.substring(authority.length).substringBefore('#').substringBefore('?')
        val segments = path.split('/').filter { it.isNotEmpty() }.let { if (it.firstOrNull()?.lowercase() in LOCALES) it.drop(1) else it }
        if (segments.size != 2 || segments[0] != "card") return null
        val key = runCatching { URLDecoder.decode(segments[1].replace("+", "%2B"), "UTF-8") }.getOrNull()
        return key?.takeIf { it.isNotBlank() && it.none { c -> c == '/' || c.isWhitespace() || c.isISOControl() } }
    }

    /**
     * Whether a message sharing [card] has words to show besides the card: always for a card it
     * carries (when it has any), and for a link only when the text is more than that link.
     */
    fun hasWords(text: String, card: SharedCard): Boolean {
        if (card.attached) return text.isNotBlank()
        val link = card.link ?: return text.isNotBlank()
        val start = link.range.first.coerceIn(0, text.length)
        val end = (link.range.last + 1).coerceIn(start, text.length)
        return text.removeRange(start, end).isNotBlank()
    }
}

/**
 * What a message's bubble carries besides its words — decided from the card it shares and what
 * is known of that card: the card itself once read and the viewer's to see, its stand-in while
 * it is read; otherwise its link's preview, or its words alone. A card the viewer can't see falls
 * back: a link to it is a link again (with its preview, if the server made one); a carried one
 * shows nothing of itself.
 */
sealed interface Carried {
    /** Its words alone (or a reply to a note). */
    data object Words : Carried
    /** A link's unfurled page. */
    data class Preview(val preview: LinkPreview) : Carried
    /** A card of the site, carried or linked to. */
    data class Card(val card: FeedCard, val shared: SharedCard) : Carried
    /** A card still being read: the bubble's plain stand-in. */
    data class CardLoading(val shared: SharedCard) : Carried
    /** Nothing at all: a carried card the viewer can't see, sent without words. */
    data object Nothing : Carried

    companion object {
        /**
         * [shared] is the card [message] shares ([SharedCards.of]); [cards] what was read of shared
         * cards by key (null: not the viewer's to see); [loading] the keys being read.
         */
        fun of(message: ChatMessage, shared: SharedCard?, cards: Map<String, FeedCard?>, loading: Set<String>): Carried {
            if (shared != null) {
                if (shared.key in cards) cards[shared.key]?.let { return Card(it, shared) }
                else if (shared.key in loading) return CardLoading(shared)
            }
            val preview = message.preview
            return when {
                preview != null -> Preview(preview)
                message.text.isNotEmpty() || message.noteRef != null -> Words
                else -> Nothing
            }
        }
    }
}

/**
 * The words [message]'s bubble shows with what it [carried]: all of them — except that a card
 * linked to stands for its link, so a message that is the link alone shows none.
 */
fun Carried.words(message: ChatMessage): String {
    val shared = when (this) {
        is Carried.Card -> shared
        is Carried.CardLoading -> shared
        else -> return message.text
    }
    return if (SharedCards.hasWords(message.text, shared)) message.text else ""
}
