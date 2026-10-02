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

    /** A note to a card's author (the server finds the author); returns its id. */
    suspend fun sendNote(cardId: String, text: String): String = call { api.sendNote(SendNoteRequest(cardId = cardId, text = text)).id }

    /** A message to someone you're connected with; returns the conversation's id. */
    suspend fun sendMessage(to: String, text: String, cardRef: String? = null, noteRef: Note? = null): String = call {
        api.sendMessage(
            SendMessageRequest(to = to, text = text, cardRef = cardRef, noteRef = noteRef?.let { NoteRef(cardId = it.cardId, noteId = it.noteId) }),
        ).conversationId
    }
}
