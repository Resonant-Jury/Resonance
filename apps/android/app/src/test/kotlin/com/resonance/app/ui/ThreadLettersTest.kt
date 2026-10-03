package com.resonance.app.ui

import com.resonance.api.models.FeedCard
import com.resonance.kit.chat.ChatMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Date

/**
 * A note is a letter: the thread shows its messages in every state, and its foot says who may
 * write — the composer when connected, the composer with a line when their note waits for your
 * answer, a calm line when yours waits for theirs, "not connected" otherwise. A link to a note
 * lands on the note itself, or on the chip that answers an older one — never one for an
 * anonymous card's note.
 */
class ThreadLettersTest {
    private fun foot(connected: Boolean?, requestFrom: String? = null, blocked: Boolean = false) =
        ThreadFoot.of(connected, blocked, requestFrom, me = "alice", other = "carol")

    @Test fun connectedPeopleWriteAsAlwaysWhateverWaits() {
        assertEquals(ThreadFoot.Composer, foot(true))
        // The note that connected them was answered long ago; a stray request changes nothing.
        assertEquals(ThreadFoot.Composer, foot(true, requestFrom = "carol"))
        // Not known yet: the composer shows meanwhile.
        assertEquals(ThreadFoot.Composer, foot(null, requestFrom = "alice"))
    }

    @Test fun theirNoteWaitsForYourAnswerYoursForTheirs() {
        assertEquals(ThreadFoot.Answer, foot(false, requestFrom = "carol"))
        assertEquals(ThreadFoot.Awaiting, foot(false, requestFrom = "alice"))
        assertEquals(ThreadFoot.Closed, foot(false))
        // Someone else's request (never ours to answer) is no letter between these two.
        assertEquals(ThreadFoot.Closed, foot(false, requestFrom = "dora"))
    }

    @Test fun aBlockClosesTheThreadWhateverWaits() {
        assertEquals(ThreadFoot.Closed, foot(false, requestFrom = "carol", blocked = true))
        assertEquals(ThreadFoot.Closed, foot(null, blocked = true))
    }

    @Test fun onlyAComposerTakesReplies() {
        assertTrue(ThreadFoot.Composer.composes)
        assertTrue(ThreadFoot.Answer.composes)
        assertFalse(ThreadFoot.Awaiting.composes)
        assertFalse(ThreadFoot.Closed.composes)
    }

    private val note = ChatMessage("n1", "carol", "I walked there too", Date(1_000), cardRef = "walk", isNote = true)
    private fun card(anonymous: Boolean) = FeedCard(
        id = "walk", slug = "a-walk", title = "A walk", excerpt = "…", tags = emptyList(), publishedAt = "2026-09-01T08:00:00.000Z",
        author = null, anonymous = anonymous, visibility = FeedCard.Visibility.`public`, imageUrl = null, imageLabel = null,
        accentHue = 140.0, readMinutes = 1, referenceCardId = null, reason = null,
    )

    @Test fun aNoteInTheThreadIsWhereItsLinkLands() {
        assertEquals(NoteLanding.Message(note), NoteLanding.of(note, null))
        assertEquals(NoteLanding.Message(note), NoteLanding.of(note, card(anonymous = true)))
    }

    @Test fun anOlderNoteIsAnsweredWithTheChipUnlessItsCardIsAnonymous() {
        assertEquals(NoteLanding.Chip, NoteLanding.of(null, card(anonymous = false)))
        // Answering with the chip would tell the note's writer who wrote the card.
        assertEquals(NoteLanding.Nothing, NoteLanding.of(null, card(anonymous = true)))
        // A card that can't be read can't be told apart from an anonymous one.
        assertEquals(NoteLanding.Nothing, NoteLanding.of(null, null))
    }
}
