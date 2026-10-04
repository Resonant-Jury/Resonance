package com.resonance.app.ui

import com.resonance.api.models.FeedCard
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The resonate picker offers your published public cards that answer nothing yet (a card answers
 * one card) — never the card being answered nor the one it answers — and counts the ones it left
 * out for answering another card.
 */
class ResonateChoicesTest {
    private fun card(
        id: String,
        visibility: FeedCard.Visibility = FeedCard.Visibility.`public`,
        published: Boolean = true,
        answers: String? = null,
        anonymous: Boolean = false,
    ) = FeedCard(
        id = id, slug = id, title = "Card $id", excerpt = "…", tags = emptyList(),
        publishedAt = if (published) "2026-09-01T08:00:00.000Z" else null,
        author = null, anonymous = anonymous, visibility = visibility, imageUrl = null, imageLabel = null,
        accentHue = 55.0, readMinutes = 1, referenceCardId = answers, reason = null,
    )

    @Test fun yourPublicCardsAnsweringNothingAreOffered() {
        val choices = ResonateChoices.of(
            listOf(card("a"), card("anon", anonymous = true), card("private", FeedCard.Visibility.`private`), card("friends", FeedCard.Visibility.connections), card("draft", published = false)),
            targetId = "target", targetReferenceId = null,
        )
        assertEquals(listOf("a", "anon"), choices.cards.map { it.id })
        assertEquals(0, choices.hidden)
    }

    @Test fun cardsAnsweringAnotherAreHiddenAndCounted() {
        val choices = ResonateChoices.of(
            listOf(card("a"), card("b", answers = "elsewhere"), card("c", answers = "elsewhere-too")),
            targetId = "target", targetReferenceId = null,
        )
        assertEquals(listOf("a"), choices.cards.map { it.id })
        assertEquals(2, choices.hidden)
    }

    @Test fun neverTheCardItselfNorTheOneItAnswers() {
        val choices = ResonateChoices.of(
            listOf(card("target"), card("original"), card("mine-already", answers = "target"), card("a")),
            targetId = "target", targetReferenceId = "original",
        )
        assertEquals(listOf("a"), choices.cards.map { it.id })
        // A card already answering this one isn't "hidden for answering another".
        assertEquals(0, choices.hidden)
    }
}
