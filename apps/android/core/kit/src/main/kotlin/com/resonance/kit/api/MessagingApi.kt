package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.NoteRef
import com.resonance.api.models.SendMessageRequest
import com.resonance.api.models.SendNoteRequest
import okhttp3.OkHttpClient

/**
 * Notes and messages — the writes that reach another person, so they go
 * through the server (POST /api/v1/notes, /api/v1/messages), which re-checks
 * connections and blocks and rings the right bell. Reading conversations is
 * the participants' own data and stays a live Firestore listener. The twin of
 * iOS's MessagingAPI; the server's refusals surface as [ApiFailure].
 */
class MessagingApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    /** The note a message answers. */
    data class Note(val cardId: String, val noteId: String)

    /**
     * A note to a card's author (the server finds the author); returns its id. [clientId] is the
     * writer's own id for it (see [com.resonance.kit.chat.NoteAttempt]), which the server makes the
     * note's id — sending the same one again after an answer was lost is answered with the note
     * already left, instead of leaving it twice.
     */
    suspend fun sendNote(cardId: String, text: String, clientId: String? = null): String =
        call { api.sendNote(SendNoteRequest(cardId = cardId, text = text, clientId = clientId)).id }

    /** What the server answers a message with: the conversation, and the message's document id in it. */
    data class Sent(val conversationId: String, val id: String)

    /**
     * A message to someone you're connected with. [replyTo] is the id of a message of that conversation
     * it answers; [clientId] is the sender's own id for it, which the server makes the document's id — sending
     * the same one again (a retry after an answer was lost) finds the message instead of writing a second.
     */
    suspend fun sendMessage(
        to: String,
        text: String,
        cardRef: String? = null,
        noteRef: Note? = null,
        replyTo: String? = null,
        clientId: String? = null,
    ): Sent = call {
        val sent = api.sendMessage(
            SendMessageRequest(
                to = to, text = text, cardRef = cardRef, noteRef = noteRef?.let { NoteRef(cardId = it.cardId, noteId = it.noteId) },
                replyTo = replyTo, clientId = clientId,
            ),
        )
        Sent(sent.conversationId, sent.id)
    }
}
