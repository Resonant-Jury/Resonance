package com.resonance.app.ui

import com.resonance.api.models.FeedCard
import com.resonance.kit.chat.ChatMessage

/**
 * Who may write in a thread, and what its foot shows instead of the composer when you may not. A
 * note is a letter: it doesn't connect two people, the card's author answering it does — so a
 * conversation can hold a note from someone you're not connected with, waiting
 * (`conversations/{pair}.request`, written by the server: who left it). The messages show in
 * every state; only the foot changes.
 */
internal enum class ThreadFoot {
    /** Connected (or not known yet): the composer. */
    Composer,
    /** They left you a note: the composer, with a quiet line saying a reply connects you. */
    Answer,
    /** You left them a note: a calm line that they'll see it, instead of the composer. */
    Awaiting,
    /** Not connected, no note waiting (or a block between you): today's "not connected" and the way to their page. */
    Closed;

    /** Whether there is a composer to write in (and so a message to reply to). */
    val composes: Boolean get() = this == Composer || this == Answer

    companion object {
        /**
         * [connected] is null until known (the composer shows meanwhile); [requestFrom] who left
         * the note waiting, if one is ([me] or [other]).
         */
        fun of(connected: Boolean?, blocked: Boolean, requestFrom: String?, me: String?, other: String?): ThreadFoot = when {
            blocked -> Closed
            connected != false -> Composer
            requestFrom != null && requestFrom == other -> Answer
            requestFrom != null && requestFrom == me -> Awaiting
            else -> Closed
        }
    }
}

/**
 * Where a link to a note (a bell row, an older push: `?note=`) lands: the note itself when the
 * thread holds it — jumped to, flashed and set up to be replied to — or, for an older note the
 * thread never got, the chip that answers it. A note on an anonymous card gets no chip: an answer
 * carrying it would tell its writer who wrote the card. Nor does one whose card can't be read —
 * it can't be told whether that card was anonymous.
 */
internal sealed interface NoteLanding {
    data class Message(val message: ChatMessage) : NoteLanding
    data object Chip : NoteLanding
    data object Nothing : NoteLanding

    companion object {
        /** [found] is the note's own message if the thread has it; [card] the noted card as the viewer reads it (null: unreadable). */
        fun of(found: ChatMessage?, card: FeedCard?): NoteLanding = when {
            found != null -> Message(found)
            card != null && !card.anonymous -> Chip
            else -> Nothing
        }
    }
}
