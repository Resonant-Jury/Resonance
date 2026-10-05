package com.resonance.app.ui

import com.resonance.api.models.FeedCard
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The resonate picker offers your published public cards that answer nothing yet (a card answers
 * one card) — never the card being answered nor the one it answers — and counts the ones it left
 * out for answering another card. With none to offer it says why — "no public cards yet" only when
 * there are none — or, when the only one is the card this one answers, nothing at all.
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

    @Test fun rowsToOfferSayNothingInTheirPlaceAndWhySomeAreMissingUnderThem() {
        val some = ResonateChoices.of(listOf(card("a"), card("b", answers = "elsewhere")), targetId = "target", targetReferenceId = null)
        assertNull(some.empty)
        assertTrue(some.listed)
        assertTrue(some.footnote)
        val all = ResonateChoices.of(listOf(card("a")), targetId = "target", targetReferenceId = null)
        assertFalse(all.footnote)
    }

    @Test fun noPublicCardIsNoPublicCardsYet() {
        val none = ResonateChoices.of(listOf(card("private", FeedCard.Visibility.`private`), card("draft", published = false)), targetId = "target", targetReferenceId = null)
        assertEquals(ResonateChoices.Empty.NoPublicCards, none.empty)
        assertTrue(none.listed)
        assertFalse(none.footnote)
    }

    @Test fun publicCardsAllAnsweringAnotherSayWhyOnceInTheRowsPlaceNeverNoPublicCards() {
        val answering = ResonateChoices.of(listOf(card("answering", answers = "someone-elses")), targetId = "target", targetReferenceId = null)
        assertEquals(ResonateChoices.Empty.AllAnswerAnother, answering.empty)
        assertTrue(answering.listed)
        // Said in the rows' place: not again under them.
        assertFalse(answering.footnote)
    }

    @Test fun theOnlyPublicCardBeingTheOneThisAnswersShowsNoListAtAll() {
        val origin = ResonateChoices.of(listOf(card("origin")), targetId = "target", targetReferenceId = "origin")
        assertEquals(ResonateChoices.Empty.Nothing, origin.empty)
        assertFalse(origin.listed)
        assertFalse(origin.footnote)
        // So with one already answering this card.
        val already = ResonateChoices.of(listOf(card("mine", answers = "target")), targetId = "target", targetReferenceId = null)
        assertEquals(ResonateChoices.Empty.Nothing, already.empty)
        assertFalse(already.listed)
    }
}
