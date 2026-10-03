package com.resonance.kit.reading

import com.resonance.api.models.FeedCard
import com.resonance.api.models.FeedPage
import com.resonance.api.models.Profile
import com.resonance.kit.api.ReadingApi
import java.net.URLDecoder

/**
 * A card's page (card/[slug]): the card, the lists under it and the cards its
 * story embeds, in one request (GET /cards/{key}?include=…) — the server
 * checks the card once and reads the lists side by side. Cards linking to this
 * one come back for its author only (empty for everyone else).
 *
 * The page is returned and cached; a card that isn't there (or not for this
 * reader) throws the API's `not_found`.
 */
class CardPageLoader(private val api: ReadingApi, private val cache: CardCache) {
    suspend fun load(key: String, preview: FeedCard? = null): CardCache.Page {
        preview?.let(cache::rememberPreview)
        val detail = api.card(key, INCLUDE)
        val page = CardCache.Page(
            detail,
            resonances = detail.resonances?.cards.orEmpty(),
            related = detail.related?.cards.orEmpty(),
            links = if (detail.isOwner) detail.links?.cards.orEmpty() else emptyList(),
            embeds = detail.embeds?.cards.orEmpty(),
        )
        cache.rememberPage(key, page)
        return page
    }

    companion object {
        /** Everything the card page shows under and inside the story. */
        val INCLUDE = listOf("resonances", "related", "links", "embeds")
    }
}

/**
 * The card a story's card link (`/card/{slug or id}`, standing alone in its
 * paragraph) embeds, from what the page brought along: matched by slug or id.
 * Null — a card this reader can't see, or one the server didn't bring — draws
 * the plain link.
 */
fun List<FeedCard>.embedFor(href: String): FeedCard? {
    val key = cardKeyOf(href) ?: return null
    return firstOrNull { it.slug == key || it.id == key }
}

/** The slug or id a `/card/…` link names (its first segment, decoded), or null. */
fun cardKeyOf(href: String): String? {
    val segment = href.removePrefix("/card/").takeIf { it != href }?.takeWhile { it != '/' && it != '?' && it != '#' }
    if (segment.isNullOrEmpty()) return null
    return runCatching { URLDecoder.decode(segment.replace("+", "%2B"), "UTF-8") }.getOrNull()
}

/** A person's page (u/[handle]): the profile, their first page of cards and the cards linking to theirs. */
data class ProfilePage(val profile: Profile, val cards: FeedPage, val links: List<FeedCard>)

/** The person's page in one request (GET /users/{handle}?include=cards,links). */
suspend fun ReadingApi.profilePage(handle: String, limit: Int = 12): ProfilePage {
    val profile = profile(handle, listOf("cards", "links"), limit)
    return ProfilePage(profile, profile.cards ?: FeedPage(emptyList(), null), profile.links?.cards.orEmpty())
}

/**
 * Cards named by id or slug where only their summary shows (the cards shared in a conversation,
 * carried or linked to), in one request: every key asked for is in the answer, as its card — or
 * null when the reader can't see it (gone, hidden, by someone blocked).
 */
suspend fun ReadingApi.cardsByKey(keys: Collection<String>): Map<String, FeedCard?> {
    if (keys.isEmpty()) return emptyMap()
    val found = cards(keys)
    val byId = found.associateBy { it.id }
    val bySlug = found.filter { it.slug != null }.associateBy { it.slug }
    return keys.associateWith { byId[it] ?: bySlug[it] }
}
