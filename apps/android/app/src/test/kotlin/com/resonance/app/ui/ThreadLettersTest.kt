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
    private fun foot(connected: Boolean?, requestFrom: String? = null, blocked: Boolean = false, letterKnown: Boolean = true) =
        ThreadFoot.of(connected, blocked, requestFrom, me = "alice", other = "carol", letterKnown = letterKnown)

    @Test fun aColdStartSaysNotConnectedOnlyOnceTheConversationHasSaidNoLetterWaits() {
        // The live connections answer first: not connected. Whether alice's letter waits isn't heard yet —
        // no foot, rather than "not connected" flashing before the awaiting line.
        assertEquals(ThreadFoot.Pending, foot(false, letterKnown = false))
        assertFalse(ThreadFoot.Pending.composes)
        // The conversation answers: her letter waits…
        assertEquals(ThreadFoot.Awaiting, foot(false, requestFrom = "alice", letterKnown = true))
        // …or carol's does, or none does.
        assertEquals(ThreadFoot.Answer, foot(false, requestFrom = "carol", letterKnown = true))
        assertEquals(ThreadFoot.Closed, foot(false, letterKnown = true))
        // Connected, blocked or not known yet need no word from the conversation.
        assertEquals(ThreadFoot.Composer, foot(true, letterKnown = false))
        assertEquals(ThreadFoot.Closed, foot(false, blocked = true, letterKnown = false))
        assertEquals(ThreadFoot.Composer, foot(null, letterKnown = false))
    }

    @Test fun connectedPeopleWriteAsAlwaysWhateverWaits() {
        assertEquals(ThreadFoot.Composer, foot(true))
        // The note that connected them was answered long ago; a stray request changes nothing.
        assertEquals(ThreadFoot.Composer, foot(true, requestFrom = "carol"))
        // Not known yet: the composer shows meanwhile.
        assertEquals(ThreadFoot.Composer, foot(null))
    }

    @Test fun aWaitingNoteSaysWhatTheFootIsBeforeTheProfileDoes() {
        // A note waits only between people not connected: no composer showing first, then going.
        assertEquals(ThreadFoot.Awaiting, foot(null, requestFrom = "alice"))
        assertEquals(ThreadFoot.Answer, foot(null, requestFrom = "carol"))
    }

    @Test fun theirNoteWaitsForYourAnswerYoursForTheirs() {
        assertEquals(ThreadFoot.Answer, foot(false, requestFrom = "carol"))
        assertEquals(ThreadFoot.Awaiting, foot(false, requestFrom = "alice"))
        assertEquals(ThreadFoot.Closed, foot(false))
        // Someone else's request (never ours to answer) is no letter between these two.
        assertEquals(ThreadFoot.Closed, foot(false, requestFrom = "dora"))
    }

    @Test fun aLetterStillWaitingWhileConnectedIsIgnoredAndCountsAgainOnceTheConnectionEnds() {
        // They connected another way (a resonance) and the note waits on: the composer, no line.
        assertEquals(ThreadFoot.Composer, foot(true, requestFrom = "alice"))
        assertEquals(ThreadFoot.Composer, foot(true, requestFrom = "carol"))
        // The resonance taken back: the letter is a letter again.
        assertEquals(ThreadFoot.Awaiting, foot(false, requestFrom = "alice"))
        assertEquals(ThreadFoot.Answer, foot(false, requestFrom = "carol"))
    }

    @Test fun theLiveConnectionsSayWhetherYouAreConnectedOverTheProfile() {
        // Firestore's live list, once it has said, wins over a profile the HTTP cache may have kept.
        assertEquals(false, connectionOf(live = setOf("dora"), other = "carol", profile = true, blocked = false))
        assertEquals(true, connectionOf(live = setOf("carol"), other = "carol", profile = false, blocked = false))
        assertEquals(true, connectionOf(live = setOf("carol"), other = "carol", profile = null, blocked = false))
        // Not heard from yet (or whom the thread is with not known yet): the profile's word, or nothing.
        assertEquals(true, connectionOf(live = null, other = "carol", profile = true, blocked = false))
        assertEquals(null, connectionOf(live = null, other = "carol", profile = null, blocked = false))
        assertEquals(null, connectionOf(live = setOf("carol"), other = null, profile = null, blocked = false))
        // Never across a block.
        assertEquals(false, connectionOf(live = setOf("carol"), other = "carol", profile = true, blocked = true))
    }

    @Test fun aTakeBackEndingTheConnectionChangesTheFootAtOnce() {
        // Connected through alice's resonance, with carol's note still waiting for alice's answer…
        val before = connectionOf(live = setOf("carol"), other = "carol", profile = true, blocked = false)
        assertEquals(ThreadFoot.Composer, foot(before, requestFrom = "carol"))
        // …the resonance taken back: the live list drops carol, and the thread asks for an answer again.
        val after = connectionOf(live = emptySet(), other = "carol", profile = before, blocked = false)
        assertEquals(ThreadFoot.Answer, foot(after, requestFrom = "carol"))
        // With no letter between them, "not connected".
        assertEquals(ThreadFoot.Closed, foot(after))
    }

    @Test fun aReReadLandingAfterTheLiveConnectionNeverClosesTheThread() {
        // Carol's letter waits for alice's answer.
        var connected: Boolean? = false
        assertEquals(ThreadFoot.Answer, foot(connected, requestFrom = "carol"))
        // Alice answers: the letter is let go and the connection begins; the live list hears it first…
        connected = connectionOf(live = setOf("carol"), other = "carol", profile = connected, blocked = false)
        assertEquals(ThreadFoot.Composer, foot(connected))
        // …then the re-read lands with what the profile said before the answer: the composer stays.
        connected = connectionAfterRead(live = setOf("carol"), other = "carol", profile = false, blocked = false)
        assertEquals(ThreadFoot.Composer, foot(connected))
    }

    @Test fun aReReadAfterTheAnswerSaysConnectedBeforeTheLiveListHears() {
        assertEquals(true, connectionAfterRead(live = emptySet(), other = "carol", profile = true, blocked = false))
        assertEquals(true, connectionAfterRead(live = null, other = "carol", profile = true, blocked = false))
        // Not connected on both counts (a take-back, an unblock): not connected. Never across a block.
        assertEquals(false, connectionAfterRead(live = emptySet(), other = "carol", profile = false, blocked = false))
        assertEquals(false, connectionAfterRead(live = null, other = "carol", profile = false, blocked = false))
        assertEquals(false, connectionAfterRead(live = setOf("carol"), other = "carol", profile = true, blocked = true))
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
