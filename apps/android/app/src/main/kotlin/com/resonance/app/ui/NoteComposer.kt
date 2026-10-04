package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.resonance.app.PushCenter
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.FieldLabel
import com.resonance.design.ModalCloseButton
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.fieldHintStyle
import com.resonance.design.fieldSurface
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.chat.NoteAttempt
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** The most a note (or a message) may hold, in UTF-16 units — the rules' own cap. */
const val NOTE_MAX_LENGTH = 2000

/** Past this many characters the composer offers to make the note a resonance card. */
const val NOTE_UPGRADE_THRESHOLD = 200

/**
 * NoteComposer (the plain variant in its modal): a little note to the card's
 * author — the only reader it will ever have. Four lines to write in, the
 * privacy hint for the first few times, the count, and past 200 characters an
 * offer to make it a resonance card instead (`onUpgrade` carries its words
 * into the writer). Sending replaces the form with a quiet confirmation. The
 * twin of iOS's NoteComposer.
 */
@Composable
fun NoteComposer(session: Session, cardId: String, onClose: () -> Unit, onUpgrade: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var pending by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showsHint by remember { mutableStateOf(false) }
    var focused by remember { mutableStateOf(false) }
    // The note on its way, under one client id until it is left: Send pressed again on the same
    // words after a failure is a retry the server can recognise, never a second note.
    val attempt = remember { NoteAttempt() }

    // The web counts the trimmed text in UTF-16 units (Kotlin's length is the same unit).
    val count = text.trim().length
    val valid = count > 0 && count <= NOTE_MAX_LENGTH && session.me != null

    if (sent) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OrganicIcon(IconName.Note, size = 18.dp, color = Tokens.Text)
            BasicText(L10n.Card.Note.sent, style = AppFonts.body(14f, lineHeight = 1.3f), modifier = Modifier.weight(1f))
        }
        // Said and done: the one way out, under the confirmation (a modal keeps no × in its corner).
        ModalCloseButton(L10n.Card.Note.close, onClose)
        return
    }

    LaunchedEffect(Unit) { showsHint = session.hints?.claim("note-privacy") ?: false }

    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.padding(bottom = 10.dp)) { FieldLabel(L10n.Card.Note.label) }
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 96.dp)
                .fieldSurface(17.0, { focused })
                .padding(horizontal = Tokens.FieldPadX.dp, vertical = Tokens.FieldPadY.dp),
        ) {
            if (text.isEmpty()) BasicText(L10n.Card.Note.placeholder, style = fieldHintStyle())
            BasicTextField(
                text, { text = capped(it, NOTE_MAX_LENGTH) },
                textStyle = AppFonts.body(15f, lineHeight = 1.6f),
                cursorBrush = SolidColor(Tokens.Text),
                minLines = 4,
                maxLines = 8,
                modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            )
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (showsHint) BasicText(L10n.Card.Note.hint, style = AppFonts.body(12f, lineHeight = 1.5f, color = Tokens.TextMuted), modifier = Modifier.weight(1f))
            else Spacer(Modifier.weight(1f))
            BasicText(
                "$count / $NOTE_MAX_LENGTH",
                style = AppFonts.body(11f, lineHeight = 1.3f, color = if (count > NOTE_MAX_LENGTH) Tokens.Terracotta else Tokens.TextMuted)
                    .copy(fontFeatureSettings = "tnum"),
            )
        }
        if (count > NOTE_UPGRADE_THRESHOLD) {
            BasicText(
                L10n.Card.Note.upgrade,
                style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.Terracotta).copy(textDecoration = TextDecoration.Underline),
                modifier = Modifier.padding(top = 2.dp, bottom = 10.dp).plainClickable(role = Role.Button) { onUpgrade(text) },
            )
        }
        error?.let { BasicText(it, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.Terracotta), modifier = Modifier.padding(bottom = 10.dp)) }
        Row(
            Modifier.fillMaxWidth().padding(top = 18.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OrganicButton(L10n.Card.Note.cancel, variant = ButtonVariant.Text, small = true, onClick = onClose)
            // The web's wrapper: dimmed to .5 and deaf to touches until there is something to send.
            Box(Modifier.dimmedUnless(valid && !pending)) {
                OrganicButton(if (pending) "…" else L10n.Card.Note.send, variant = ButtonVariant.Solid, small = true) {
                    if (!valid || pending) return@OrganicButton
                    pending = true
                    error = null
                    val words = text.trim()
                    scope.launch {
                        try {
                            attempt.send(cardId, words) { clientId -> session.messaging.sendNote(cardId, words, clientId) }
                            sent = true
                            PushCenter.reachedOut()
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: ApiFailure) {
                            error = when {
                                // Notes waiting unanswered: the next one waits for their reply (in the app's words, never the server's).
                                e.isConflict -> L10n.Card.Note.waitForReply
                                e.status == 403 -> e.message
                                else -> L10n.Messages.sendError
                            }
                        } catch (e: Exception) {
                            error = L10n.Messages.sendError
                        } finally {
                            pending = false
                        }
                    }
                }
            }
        }
    }
}

/** Text held to `max` UTF-16 units (the field's maxLength), never cutting a surrogate pair in two. */
internal fun capped(text: String, max: Int): String {
    if (text.length <= max) return text
    val cut = if (text[max - 1].isHighSurrogate()) max - 1 else max
    return text.take(cut)
}
