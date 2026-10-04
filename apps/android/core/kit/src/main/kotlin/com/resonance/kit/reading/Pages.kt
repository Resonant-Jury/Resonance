package com.resonance.kit.reading

import com.resonance.api.models.FeedCard
import com.resonance.api.models.FeedPage
import com.resonance.api.models.Profile
import com.resonance.kit.api.CardKey
import com.resonance.kit.api.ReadingApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
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
 * carried or linked to), 30 to a request: every key asked for is in the answer, as its card — or
 * null when the reader can't see it (gone, hidden, by someone blocked), or when it can't name a
 * card at all ([CardKey]; never asked for).
 *
 * The requests stand on their own: the keys of one that fails are left out of the answer (to be
 * asked again), and the others' cards still come back. Only when every request fails does this
 * throw.
 */
suspend fun ReadingApi.cardsByKey(keys: Collection<String>): Map<String, FeedCard?> {
    val asked = keys.distinct()
    if (asked.isEmpty()) return emptyMap()
    val chunks = asked.filter(CardKey::isValid).chunked(ReadingApi.CARDS_PER_REQUEST)
    val answers = coroutineScope {
        chunks.map { chunk ->
            async {
                try {
                    Result.success(cards(chunk))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Result.failure(e)
                }
            }
        }.awaitAll()
    }
    if (answers.isNotEmpty() && answers.all { it.isFailure }) throw answers.first().exceptionOrNull()!!
    val found = answers.flatMap { it.getOrDefault(emptyList()) }
    val byId = found.associateBy { it.id }
    val bySlug = found.filter { it.slug != null }.associateBy { it.slug }
    val failed = chunks.zip(answers).filter { (_, answer) -> answer.isFailure }.flatMapTo(HashSet()) { (chunk, _) -> chunk }
    return asked.filterNot { it in failed }.associateWith { byId[it] ?: bySlug[it] }
}
