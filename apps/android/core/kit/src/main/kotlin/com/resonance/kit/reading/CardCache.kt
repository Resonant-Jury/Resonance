package com.resonance.kit.reading

import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard

/**
 * What the signed-in person has already seen of cards: a list's card (its
 * title, cover and author) and card pages as last read, the newest few of
 * each. Only ever a placeholder — the card page still asks the server, and
 * what it answers replaces this — so a page opened from a list, or reopened,
 * draws at once instead of from a skeleton. It belongs to one account: the
 * session empties it on sign-out and whenever the blocks change (a block
 * hides cards the cache may still hold).
 */
class CardCache(private val capacity: Int = 24) {
    /** A card page as last read: the card and the lists under it. */
    data class Page(
        val detail: CardDetail,
        val resonances: List<FeedCard> = emptyList(),
        val related: List<FeedCard> = emptyList(),
        /** Cards linking to this one (read for its author only). */
        val links: List<FeedCard> = emptyList(),
    )

    private val pages = lru<Page>(capacity)
    private val previews = lru<FeedCard>(capacity * 4)
    /** A slug (or an id) → the card's document id. */
    private val ids = lru<String>(capacity * 8)

    @Synchronized
    fun clear() {
        previews.clear()
        pages.clear()
        ids.clear()
    }

    /** Remembers a card as a list showed it. */
    @Synchronized
    fun rememberPreview(card: FeedCard) {
        previews[card.id] = card
        note(card)
    }

    /** Remembers a card page as the server just answered it, under the key it was opened by. */
    @Synchronized
    fun rememberPage(key: String, page: Page) {
        val card = page.detail.card
        pages[card.id] = page
        previews[card.id] = card
        ids[key] = card.id
        note(card)
    }

    /** The document id behind a slug or an id, when a card with it has been seen. */
    @Synchronized
    fun idFor(key: String): String? = ids[key]

    @Synchronized
    fun page(key: String): Page? = ids[key]?.let { pages[it] }

    @Synchronized
    fun preview(key: String): FeedCard? = ids[key]?.let { pages[it]?.detail?.card ?: previews[it] }

    /** The card is gone for this reader (deleted, or no longer theirs to see). */
    @Synchronized
    fun forget(key: String) {
        val id = ids[key] ?: return
        pages.remove(id)
        previews.remove(id)
        ids.entries.removeAll { it.value == id }
    }

    private fun note(card: FeedCard) {
        ids[card.id] = card.id
        card.slug?.let { ids[it] = card.id }
    }

    private fun <V> lru(max: Int) = object : LinkedHashMap<String, V>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, V>?) = size > max
    }
}
