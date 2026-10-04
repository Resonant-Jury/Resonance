package com.resonance.kit.chat

import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals

/** Messenger's stacking: who sits in a run with whom, and where the labels fall. */
class ThreadRowsTest {
    private val zone = ZoneId.of("Asia/Taipei")
    private fun at(day: Int, h: Int, m: Int, s: Int = 0) = ZonedDateTime.of(2026, 10, day, h, m, s, 0, zone).toInstant().toEpochMilli()
    private fun msg(id: String, sender: String, time: Long, delivery: Delivery = Delivery.Delivered) =
        ChatMessage(id, sender, id, Date(time), delivery = delivery)

    private fun rows(vararg m: ChatMessage) = ThreadRows.build(m.toList(), zone)

    @Test fun messagesFromOnePersonSentCloseTogetherStackIntoARun() {
        val r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 1)), msg("c", "bob", at(1, 9, 2)), msg("d", "bob", at(1, 9, 3, 30)))
        assertEquals(listOf(RunPosition.First, RunPosition.Middle, RunPosition.Middle, RunPosition.Last), r.map { it.position })
        assertEquals(listOf(false, true, true, true), r.map { it.joinsAbove })
    }

    @Test fun aMessageThatDrawsNothingShapesNoRunAndLeadsNoLabel() {
        // Their words, then a card they shared that the viewer can't see, sent alone: it draws nothing.
        val words = msg("a", "bob", at(1, 9, 0))
        val hidden = ChatMessage("b", "bob", "", Date(at(1, 9, 1)), cardRef = "gone")
        val drawn = { m: ChatMessage -> Carried.of(m, SharedCards.of(m), mapOf("gone" to null), emptySet()) != Carried.Nothing }
        val r = ThreadRows.build(listOf(words, hidden), zone, drawn)
        // The words are the run's last (their face beside them, the corner round), and the card has no row.
        assertEquals(listOf("a"), r.map { it.message.id })
        assertEquals(RunPosition.Single, r.single().position)
        // Nor does it carry the time label for the next one: that one is measured from what is drawn.
        val later = msg("c", "bob", at(1, 9, 16))
        val withLater = ThreadRows.build(listOf(words, ChatMessage("b", "bob", "", Date(at(1, 9, 10)), cardRef = "gone"), later), zone, drawn)
        assertEquals(listOf("a", "c"), withLater.map { it.message.id })
        assertEquals(listOf(false, true), withLater.map { it.timeLabel })
    }

    @Test fun aLoneMessageIsRoundOnAllCorners() {
        assertEquals(listOf(RunPosition.Single), rows(msg("a", "bob", at(1, 9, 0))).map { it.position })
    }

    @Test fun anotherSenderEndsTheRun() {
        val r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 1)), msg("c", "alice", at(1, 9, 1, 20)), msg("d", "bob", at(1, 9, 2)))
        assertEquals(listOf(RunPosition.First, RunPosition.Last, RunPosition.Single, RunPosition.Single), r.map { it.position })
    }

    @Test fun threeMinutesApartDoNotStack() {
        val r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 2, 59)), msg("c", "bob", at(1, 9, 5, 59)))
        // 2:59 apart stacks; the third is 3:00 after the second, so it starts a run of its own.
        assertEquals(listOf(RunPosition.First, RunPosition.Last, RunPosition.Single), r.map { it.position })
        assertEquals(listOf(false, false, false), r.map { it.timeLabel })
    }

    @Test fun aQuarterOfAnHourGetsATimeLabelAndABreak() {
        val r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 14, 59)), msg("c", "bob", at(1, 9, 30)))
        assertEquals(listOf(false, false, true), r.map { it.timeLabel })
        assertEquals(listOf(RunPosition.Single, RunPosition.Single, RunPosition.Single), r.map { it.position })
    }

    @Test fun aLabelBreaksARunEvenForTheSameSender() {
        // Fifteen minutes on is a label (and not a run, which is three).
        val r = rows(msg("a", "bob", at(1, 9, 0)), msg("b", "bob", at(1, 9, 15)))
        assertEquals(listOf(false, true), r.map { it.timeLabel })
        assertEquals(RunPosition.Single, r[1].position)
    }

    @Test fun theFirstMessageOfADayCarriesTheDayLabelNotATimeLabel() {
        val r = rows(msg("a", "bob", at(1, 23, 59)), msg("b", "bob", at(2, 0, 0, 20)), msg("c", "bob", at(2, 0, 1)))
        assertEquals(listOf(true, true, false), r.map { it.dayLabel })
        assertEquals(listOf(false, false, false), r.map { it.timeLabel })
        // Midnight splits the run: 20 seconds apart, but not on the same day.
        assertEquals(listOf(RunPosition.Single, RunPosition.First, RunPosition.Last), r.map { it.position })
    }

    @Test fun aMessageThatFailedEndsItsRun() {
        val r = rows(msg("a", "alice", at(1, 9, 0)), msg("b", "alice", at(1, 9, 0, 30), Delivery.Failed), msg("c", "alice", at(1, 9, 1)))
        assertEquals(listOf(RunPosition.First, RunPosition.Last, RunPosition.Single), r.map { it.position })
    }

    @Test fun aReplyOpensARunOfItsOwnAndTheMessagesAfterItStackUnderIt() {
        val quote = ReplyQuote("q", "alice", "hi")
        val r = rows(
            msg("a", "bob", at(1, 9, 0)),
            msg("b", "bob", at(1, 9, 0, 20)).copy(replyTo = quote),
            msg("c", "bob", at(1, 9, 0, 40)),
        )
        assertEquals(listOf(RunPosition.Single, RunPosition.First, RunPosition.Last), r.map { it.position })
    }

    @Test fun aNoteOpensARunOfItsOwnLikeAReply() {
        // The note leads with the card it was left on, so the message before it doesn't stack onto it.
        val r = rows(
            msg("a", "bob", at(1, 9, 0)),
            msg("n", "bob", at(1, 9, 0, 20)).copy(cardRef = "walk", isNote = true),
            msg("c", "bob", at(1, 9, 0, 40)),
        )
        assertEquals(listOf(RunPosition.Single, RunPosition.First, RunPosition.Last), r.map { it.position })
    }

    @Test fun aSendingMessageStacksUnderTheOneBeforeItEvenWithAClockABitBehind() {
        val r = rows(msg("a", "alice", at(1, 9, 0, 10)), msg("b", "alice", at(1, 9, 0, 5), Delivery.Sending))
        assertEquals(listOf(RunPosition.First, RunPosition.Last), r.map { it.position })
    }

    @Test fun nothingYieldsNothing() {
        assertEquals(emptyList(), ThreadRows.build(emptyList(), zone))
    }
}
