package com.resonance.kit.reading

import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.api.models.FeedPage
import com.resonance.api.models.Profile
import com.resonance.kit.api.ReadingApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

/**
 * A card's page (card/[slug]): the card and the lists under it, asked for
 * together rather than one after another. The lists take the card's document
 * id — a slug finds no resonances — so they leave beside the card when the id
 * is already known (the list the card was opened from, or an earlier visit)
 * and as soon as the card answers otherwise. Cards linking to this one are
 * its author's alone, so they are asked for only when the card is (or, from
 * the list's byline, will be) the reader's own.
 *
 * `onCard` gets the card as soon as it arrives; the page with all its lists
 * is returned (and cached) once they have answered. A card that isn't there
 * (or not for this reader) throws the API's `not_found`.
 */
class CardPageLoader(private val api: ReadingApi, private val cache: CardCache) {
    suspend fun load(key: String, preview: FeedCard? = null, viewer: String? = null, onCard: (CardDetail) -> Unit = {}): CardCache.Page = coroutineScope {
        preview?.let(cache::rememberPreview)
        val knownId = preview?.id ?: cache.idFor(key)
        val early = knownId?.let { id -> lists(id, mine = viewer != null && preview?.author?.id == viewer) }
        val detail = api.card(key)
        val id = detail.card.id
        val requests = if (early != null && early.id == id) early else {
            early?.cancel()
            lists(id, mine = detail.isOwner)
        }
        if (detail.isOwner && requests.links == null) requests.links = async { orEmpty { api.links(id) } }
        onCard(detail)
        val page = CardCache.Page(
            detail,
            resonances = requests.resonances.await(),
            related = requests.related.await(),
            links = if (detail.isOwner) requests.links?.await().orEmpty() else emptyList(),
        )
        cache.rememberPage(key, page)
        page
    }

    private class Lists(val id: String, val resonances: Deferred<List<FeedCard>>, val related: Deferred<List<FeedCard>>, var links: Deferred<List<FeedCard>>?) {
        fun cancel() {
            resonances.cancel()
            related.cancel()
            links?.cancel()
        }
    }

    private fun CoroutineScope.lists(id: String, mine: Boolean) = Lists(
        id,
        async { orEmpty { api.resonances(id) } },
        async { orEmpty { api.related(id) } },
        if (mine) async { orEmpty { api.links(id) } } else null,
    )
}

/** A person's page (u/[handle]): the profile, their first page of cards and the cards linking to theirs, asked for together. */
data class ProfilePage(val profile: Profile, val cards: FeedPage, val links: List<FeedCard>)

suspend fun ReadingApi.profilePage(handle: String): ProfilePage = coroutineScope {
    val cards = async { profileCards(handle) }
    val links = async { orEmpty { profileLinks(handle) } }
    ProfilePage(profile(handle), cards.await(), links.await())
}

/** A list under a page is a nicety: when it can't be read the page shows without it. */
private suspend fun orEmpty(read: suspend () -> List<FeedCard>): List<FeedCard> = try {
    read()
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    emptyList()
}
