package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
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
import com.resonance.design.MenuTrigger
import com.resonance.design.OrganicMenu
import com.resonance.design.OrganicMenuItem
import com.resonance.design.OrganicModal
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.fade
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * The owner's ⋯ on a card (CardActionsMenu.tsx): 編輯 / 轉為公開·私人 / 刪除,
 * in the shared OrganicMenu. Deleting asks first, in the web's own small
 * dialog. The changes go through the server (PATCH / DELETE
 * /api/v1/cards/{id}), which also refreshes the site's cached pages that
 * showed the card. The twin of iOS's CardActionsMenu.
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
) {
    val scope = rememberCoroutineScope()
    var confirming by remember { mutableStateOf(false) }
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
        OrganicMenuItem(L10n.Me.Actions.delete, IconName.Trash, destructive = true) { confirming = true },
    )

    Box(Modifier.fade(if (busy && !confirming) 0.6f else 1f)) {
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
}
