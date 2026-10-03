package com.resonance.kit.chat

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs

/** Where a message sits in a run of messages from one person: it picks the corners the bubble tucks. */
enum class RunPosition {
    /** Alone: all four corners round. */
    Single,
    /** The first of a run: the corner facing the next message is tucked. */
    First,
    /** In the middle: both corners facing a neighbour are tucked. */
    Middle,
    /** The last of a run: the corner facing the one before is tucked. */
    Last;

    /** A neighbour above it in the run: the corner on the sender's side, top, is tucked. */
    val joinsAbove: Boolean get() = this == Middle || this == Last
    /** A neighbour below it in the run: the corner on the sender's side, bottom, is tucked. */
    val joinsBelow: Boolean get() = this == First || this == Middle
}

/**
 * One message of the thread with what the list needs around it: its place in a run (Messenger's
 * stacking), and the labels that lead it.
 *
 * [dayLabel] leads the first message of a day. [timeLabel] leads a message that comes
 * [ThreadRows.TIME_LABEL_GAP_MILLIS] or more after the one before it on the same day. A label is a
 * break: nothing stacks across one.
 */
data class ThreadRow(
    val message: ChatMessage,
    val position: RunPosition,
    val dayLabel: Boolean,
    val timeLabel: Boolean,
) {
    /** It stacks under the message before it (a tight gap instead of the one between runs). */
    val joinsAbove: Boolean get() = position.joinsAbove
}

/**
 * Lays the thread out in runs, the way Messenger stacks messages sent close together: consecutive
 * messages from the same sender, less than [RUN_GAP_MILLIS] apart on the same day, with no label
 * between them, are one run; a reply opens a run (it leads with the quote it answers), so does a note
 * (it leads with the card it was left on), and a message that failed to send ends the run it is in
 * (its "not sent" line sits under it). Used on the main thread; pure.
 */
object ThreadRows {
    /** Messages further apart than this don't stack. */
    const val RUN_GAP_MILLIS = 3 * 60_000L
    /** A message this long after the one before it (on the same day) gets a time label. */
    const val TIME_LABEL_GAP_MILLIS = 15 * 60_000L

    /** [messages] oldest first, as [ThreadMessages.build] returns them. */
    fun build(messages: List<ChatMessage>, zone: ZoneId = ZoneId.systemDefault()): List<ThreadRow> {
        if (messages.isEmpty()) return emptyList()
        val days = messages.map { day(it, zone) }
        val day = BooleanArray(messages.size) { it == 0 || days[it] != days[it - 1] }
        val time = BooleanArray(messages.size) { i ->
            i > 0 && !day[i] && messages[i].sentAt.time - messages[i - 1].sentAt.time >= TIME_LABEL_GAP_MILLIS
        }
        val joins = BooleanArray(messages.size) { i ->
            val m = messages[i]
            val before = messages.getOrNull(i - 1)
            before != null && !day[i] && !time[i] &&
                // A reply opens with the quote it answers, a note with the card it was left on: each starts a run of its own.
                m.replyTo == null && !m.isNote &&
                before.senderId == m.senderId && before.delivery != Delivery.Failed &&
                // A message still on its way carries this phone's clock: a few seconds off the server's doesn't unstack it.
                abs(m.sentAt.time - before.sentAt.time) < RUN_GAP_MILLIS
        }
        return messages.mapIndexed { i, m ->
            val above = joins[i]
            val below = i + 1 < messages.size && joins[i + 1]
            val position = when {
                above && below -> RunPosition.Middle
                above -> RunPosition.Last
                below -> RunPosition.First
                else -> RunPosition.Single
            }
            ThreadRow(m, position, day[i], time[i])
        }
    }

    private fun day(m: ChatMessage, zone: ZoneId): LocalDate = Instant.ofEpochMilli(m.sentAt.time).atZone(zone).toLocalDate()
}
