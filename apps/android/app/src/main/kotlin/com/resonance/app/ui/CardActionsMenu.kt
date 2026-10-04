package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.CssText
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.MenuTrigger
import com.resonance.design.OrganicMenu
import com.resonance.design.OrganicMenuItem
import com.resonance.design.OrganicModal
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.fade
import com.resonance.kit.l10n.L10n
import com.resonance.kit.reading.cardsByKey
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * The owner's ⋯ on a card (CardActionsMenu.tsx): 編輯 / 轉為公開·私人 / 取消共振
 * (for a card answering another, [referenceCardId]) / 刪除, in the shared
 * OrganicMenu. Deleting and no longer resonating ask first, in the web's own
 * small dialogs. The changes go through the server (PATCH / DELETE
 * /api/v1/cards/{id}, DELETE …/{original}/resonances/{id}), which also
 * refreshes the site's cached pages that showed the card. The twin of iOS's
 * CardActionsMenu.
 */
@Composable
fun CardActionsMenu(
    session: Session,
    cardId: String,
    visibility: String,
    open: (Route) -> Unit,
    seed: Double = 7.0,
    hue: Double? = null,
    /** Whether the card opens once the writer is gone (false on the card's own page, which is underneath). */
    showsCard: Boolean = true,
    onChanged: () -> Unit = {},
    onDeleted: () -> Unit = {},
    /** A chip over a card's cover (the card box), bare in the card page's bar. */
    trigger: MenuTrigger = MenuTrigger.Chip,
    /** The card it resonates with, if it answers one: 取消共振 lets it go. */
    referenceCardId: String? = null,
    /** That card's title, when the page has it (else asked for once the question is). */
    referenceTitle: String? = null,
) {
    val scope = rememberCoroutineScope()
    var confirming by remember { mutableStateOf(false) }
    var unresonating by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val isPrivate = visibility == "private"

    val items = listOf(
        OrganicMenuItem(L10n.Me.Actions.edit, IconName.Pen) { open(Route.Write(cardId = cardId, showsCard = showsCard)) },
        OrganicMenuItem(
            if (isPrivate) L10n.Me.Actions.makePublic else L10n.Me.Actions.makePrivate,
            if (isPrivate) IconName.Globe else IconName.Lock,
        ) {
            if (busy) return@OrganicMenuItem
            busy = true
            scope.launch {
                try {
                    session.writing.updateCard(cardId, visibility = if (isPrivate) "public" else "private")
                    session.noteCardChange(Session.CardChange(cardId))
                    onChanged()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // Nothing changed; the menu is as it was.
                } finally {
                    busy = false
                }
            }
        },
    ) + listOfNotNull(
        referenceCardId?.let { OrganicMenuItem(L10n.Me.Actions.unresonate, IconName.Wave) { unresonating = true } },
        OrganicMenuItem(L10n.Me.Actions.delete, IconName.Trash, destructive = true) { confirming = true },
    )

    Box(Modifier.fade(if (busy && !confirming && !unresonating) 0.6f else 1f)) {
        OrganicMenu(items, L10n.Me.Actions.menuLabel, seed, hue = hue, trigger = trigger)
    }
    if (confirming) {
        OrganicModal(
            if (busy) null else ({ confirming = false }),
            L10n.Me.Actions.deleteConfirmTitle,
            seed = seed + 5,
            closeLabel = L10n.Me.Actions.deleteCancel,
            maxWidth = 400.dp,
        ) {
            // The delete confirmation: 20 heading, the muted note, then Keep it / Delete card on the right.
            Column {
                CssText(
                    L10n.Me.Actions.deleteConfirmTitle, AppFonts.Family.Heading, 20f, 700, lineHeight = 1.3f,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(Modifier.height(10.dp))
                CssText(L10n.Me.Actions.deleteConfirmBody, AppFonts.Family.Body, 14f, lineHeight = 1.6f, color = Tokens.TextMuted)
                Spacer(Modifier.height(24.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                    // The modal is the frame: "keep it" is plain text, and deleting — which can't be undone — is red.
                    OrganicButton(L10n.Me.Actions.deleteCancel, variant = ButtonVariant.Text, small = true, enabled = !busy) { confirming = false }
                    OrganicButton(if (busy) "…" else L10n.Me.Actions.deleteConfirm, variant = ButtonVariant.Danger, small = true, enabled = !busy) {
                        if (busy) return@OrganicButton
                        busy = true
                        scope.launch {
                            try {
                                session.writing.deleteCard(cardId)
                                confirming = false
                                session.noteCardChange(Session.CardChange(cardId))
                                onDeleted()
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                // Still there; the dialog stays for another try.
                            } finally {
                                busy = false
                            }
                        }
                    }
                }
            }
        }
    }
    if (unresonating && referenceCardId != null) UnresonateDialog(
        session, cardId, referenceCardId, referenceTitle, seed = seed + 9,
        onDone = {
            unresonating = false
            onChanged()
        },
        onCancel = { unresonating = false },
    )
}

/**
 * "Stop resonating with 〈title〉?" — the card stays, answering nothing; the server lets go of its
 * link to the original. The title is the page's when it has it, else read once the question is
 * asked (until then the question keeps its place unwritten; one that can't be read is the plain
 * words). Nothing here is irreversible, so the verb is the plain solid fill.
 */
@Composable
private fun UnresonateDialog(
    session: Session,
    cardId: String,
    original: String,
    knownTitle: String?,
    seed: Double,
    onDone: () -> Unit,
    onCancel: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf(knownTitle) }
    var looking by remember { mutableStateOf(knownTitle == null) }
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(original) {
        if (title == null) {
            title = try {
                session.reading.cardsByKey(listOf(original))[original]?.title
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
        }
        looking = false
    }
    OrganicConfirmDialog(
        title = title?.let(L10n.Me.Actions::unresonateConfirmTitle) ?: L10n.Me.Actions.unresonate,
        body = L10n.Me.Actions.unresonateConfirmBody,
        cancelLabel = L10n.Me.Actions.deleteCancel,
        confirmLabel = L10n.Me.Actions.unresonateConfirm,
        onCancel = onCancel,
        onConfirm = {
            if (busy) return@OrganicConfirmDialog
            busy = true
            failed = false
            scope.launch {
                try {
                    session.writing.unresonate(original, cardId)
                    // The card's page, the original's resonances, the box's shelves and the thought map.
                    session.noteCardChange(Session.CardChange(cardId, original))
                    onDone()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    failed = true
                } finally {
                    busy = false
                }
            }
        },
        busy = busy,
        seed = seed,
        error = if (failed) L10n.Safety.actionError else null,
        titlePending = looking,
    )
}
