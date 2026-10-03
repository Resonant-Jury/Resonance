package com.resonance.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicSendButton
import com.resonance.design.ReplyRule
import com.resonance.design.fieldHintStyle
import com.resonance.design.fieldSurface
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.chat.ReplyQuote
import com.resonance.kit.l10n.L10n

/**
 * The message being written: what is attached (the note being answered, a card), the reply it
 * carries and the field with Send beside it. Sending never holds the composer — a message goes to the
 * outbox and the field is empty for the next one, with its keyboard still up.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Composer(model: ThreadModel, handle: String, focus: FocusRequester, onPickCard: () -> Unit, modifier: Modifier = Modifier) {
    var focused by remember { mutableStateOf(false) }
    Column(modifier.fillMaxWidth()) {
        if (model.noteRef != null || model.pendingCard != null) {
            FlowRow(
                Modifier.padding(top = 10.dp).padding(horizontal = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (model.noteRef != null) AttachmentChip(IconName.Note, L10n.Messages.quotedNote) { model.noteRef = null }
                model.pendingCard?.let { card -> AttachmentChip(IconName.Cards, card.title) { model.pendingCard = null } }
            }
        }
        model.replyingTo?.let { ReplyBar(model, it) }
        // Send is a little shorter than the field: it stays at the foot of the field as that grows.
        Row(
            Modifier.padding(top = 12.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier
                    .padding(bottom = 6.dp)
                    .size(40.dp)
                    .plainClickable(role = Role.Button, onClickLabel = L10n.Messages.attachCard) { onPickCard() }
                    .semantics { contentDescription = L10n.Messages.attachCard },
                contentAlignment = Alignment.Center,
            ) { OrganicIcon(IconName.Cards, size = 18.dp, color = Tokens.TextMuted) }
            Box(
                Modifier
                    .weight(1f)
                    .fieldSurface(17.0, { focused })
                    .padding(horizontal = Tokens.FieldPadX.dp, vertical = Tokens.FieldPadY.dp),
            ) {
                if (model.draft.isEmpty()) BasicText(L10n.Messages.placeholder, style = fieldHintStyle())
                BasicTextField(
                    model.draft, { model.draft = capped(it, NOTE_MAX_LENGTH) },
                    textStyle = AppFonts.body(15f, lineHeight = 1.6f),
                    cursorBrush = SolidColor(Tokens.Text),
                    minLines = 1,
                    maxLines = 5,
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focus)
                        .onFocusChanged { focused = it.isFocused }
                        .semantics { contentDescription = L10n.Messages.threadWith(handle) },
                )
            }
            OrganicSendButton(L10n.Messages.send, enabled = model.canSend, modifier = Modifier.padding(bottom = 4.dp)) { model.send() }
        }
        model.error?.let { BasicText(it, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.Terracotta), modifier = Modifier.padding(top = 6.dp)) }
    }
}

/** Over the field while replying: a wavy terracotta rule, whom to and a line of what, and a ✕. */
@Composable
private fun ReplyBar(model: ThreadModel, quote: ReplyQuote) {
    val toSelf = quote.senderId == model.me
    val who = if (toSelf) L10n.Messages.replyingToSelf else L10n.Messages.replyingTo(model.other?.handle.orEmpty())
    val what = quote.text.replace('\n', ' ').ifEmpty { L10n.Messages.replyCard }
    Row(
        Modifier.fillMaxWidth().padding(top = 12.dp, start = 4.dp).heightIn(min = 36.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        ReplyRule(Modifier.height(34.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            BasicText(who, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12f, 600, lineHeight = 1.35f, color = Tokens.Text))
            BasicText(what, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12.5f, lineHeight = 1.35f, color = Tokens.TextMuted))
        }
        Box(
            Modifier
                .size(40.dp)
                .plainClickable(role = Role.Button, onClickLabel = L10n.Messages.replyCancel) { model.cancelReply() }
                .semantics { contentDescription = L10n.Messages.replyCancel },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.Close, size = 15.dp, color = Tokens.TextMuted) }
    }
}

/** A pending attachment above the composer: its glyph, its name, and a ✕. */
@Composable
private fun AttachmentChip(icon: IconName, title: String, onRemove: () -> Unit) {
    Row(
        Modifier
            .background(Tokens.TerracottaLight.copy(alpha = 0.4f), RoundedCornerShape(topStart = 12.dp, topEnd = 14.dp, bottomEnd = 12.dp, bottomStart = 14.dp))
            .padding(start = 10.dp, end = 8.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        OrganicIcon(icon, size = 14.dp, color = Tokens.Text)
        BasicText(title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12f, lineHeight = 1.3f), modifier = Modifier.widthIn(max = 180.dp))
        Box(
            Modifier
                .plainClickable(role = Role.Button, onClickLabel = L10n.Messages.removeCard, onClick = onRemove)
                .padding(2.dp)
                .semantics { contentDescription = L10n.Messages.removeCard },
        ) { OrganicIcon(IconName.Close, size = 13.dp, color = Tokens.TextMuted) }
    }
}
