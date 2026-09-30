package com.resonance.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.ModalActions
import com.resonance.design.OrganicAlert
import com.resonance.design.ModalBody
import com.resonance.design.ModalTitle
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicIcon
import com.resonance.design.MenuTrigger
import com.resonance.design.OrganicMenu
import com.resonance.design.OrganicMenuItem
import com.resonance.design.OrganicModal
import com.resonance.design.OrganicRadio
import com.resonance.design.OrganicTextField
import com.resonance.design.OrganicToggle
import com.resonance.design.organicSurface
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.launch
import java.time.OffsetDateTime

/**
 * The ⋯ on a card or a person: report, and block or unblock — in the web's
 * organic menu, confirming a block in its ConfirmModal. An anonymous card's
 * menu only reports: the app never learns who wrote it, so there is no one to block.
 */
@Composable
fun SafetyMenu(
    session: Session,
    target: SafetyService.Target,
    handle: String?,
    isBlocked: Boolean = false,
    seed: Double = 7.0,
    /** Bare in a bar (the card page, a profile), a chip over content. */
    trigger: MenuTrigger = MenuTrigger.Bare,
    onChange: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    var reporting by remember { mutableStateOf(false) }
    var confirmingBlock by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val name = handle ?: L10n.Safety.anonymousAuthor
    val person = target.userId

    OrganicMenu(label = L10n.Safety.menuLabel, seed = seed, trigger = trigger, items = buildList {
        add(OrganicMenuItem(if (target is SafetyService.Target.Card) L10n.Safety.reportCard else L10n.Safety.reportUser, IconName.Flag) { reporting = true })
        when {
            person == null -> Unit
            isBlocked -> add(OrganicMenuItem(L10n.Safety.unblock, IconName.UserCheck) {
                scope.launch { runCatching { session.safety?.unblock(person) }.onSuccess { onChange() }.onFailure { failed = true } }
            })
            else -> add(OrganicMenuItem(L10n.Safety.block, IconName.Ban, destructive = true) { confirmingBlock = true })
        }
    })

    if (reporting) ReportDialog(session, target, handle, onBlocked = onChange, offerBlock = person != null && !isBlocked) { reporting = false }
    if (confirmingBlock && person != null) OrganicConfirmDialog(
        title = L10n.Safety.blockTitle(name),
        body = L10n.Safety.blockBody,
        cancelLabel = L10n.Safety.cancel,
        confirmLabel = L10n.Safety.blockConfirm,
        onCancel = { confirmingBlock = false },
        onConfirm = {
            confirmingBlock = false
            scope.launch { runCatching { session.safety?.block(person) }.onSuccess { onChange() }.onFailure { failed = true } }
        },
    )
    if (failed) OrganicAlert(L10n.Safety.actionError, "OK") { failed = false }
}

/**
 * ReportModal.tsx: pick a reason, optionally add details, optionally block in
 * the same step; after sending, the dialog turns into a thank-you note.
 */
@Composable
fun ReportDialog(
    session: Session,
    target: SafetyService.Target,
    handle: String?,
    onBlocked: () -> Unit,
    /** Offer "also block" (not when they're already blocked, nor for an anonymous card). */
    offerBlock: Boolean = true,
    onClose: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var reason by remember { mutableStateOf(SafetyService.Reason.Spam) }
    var detail by remember { mutableStateOf("") }
    var alsoBlock by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf<Boolean?>(null) }
    val name = handle ?: L10n.Safety.anonymousAuthor
    val blocks = offerBlock && target.userId != null
    val title = when (target) {
        is SafetyService.Target.Card -> L10n.Safety.Report.titleCard
        is SafetyService.Target.User -> L10n.Safety.Report.titleUser(name)
        is SafetyService.Target.Message -> L10n.Safety.Report.titleMessage(name)
    }

    OrganicModal(if (busy) null else onClose, title, seed = 83.0) {
        val blocked = done
        if (blocked != null) {
            ModalTitle(L10n.Safety.Report.doneTitle)
            ModalBody(L10n.Safety.Report.doneBody)
            if (blocked) ModalBody(L10n.Safety.Report.doneBlocked(name))
            ModalActions { OrganicButton(L10n.Safety.Report.close, variant = ButtonVariant.Solid, small = true, onClick = onClose) }
            return@OrganicModal
        }
        ModalTitle(title)
        ModalBody(L10n.Safety.Report.intro)
        BasicText(L10n.Safety.Report.reason.uppercase(), style = AppFonts.body(Tokens.LabelSize, 600, color = Tokens.TextMuted))
        Column {
            SafetyService.Reason.entries.forEachIndexed { i, r ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp)
                        .semantics { selected = reason == r }
                        .clickable(role = Role.RadioButton) { reason = r },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OrganicRadio(reason == r, seed = 21.0 + i * 7)
                    BasicText(reasonLabel(r), style = AppFonts.body(15f))
                }
            }
        }
        OrganicTextField(L10n.Safety.Report.detail, detail, { detail = it.take(SafetyService.DETAIL_MAX) }, L10n.Safety.Report.detailPlaceholder, seed = 89.0, multiline = true)
        // The web's blockRow: the label, then the switch at the far end.
        if (blocks) Row(verticalAlignment = Alignment.CenterVertically) {
            BasicText(L10n.Safety.Report.alsoBlock(name), style = AppFonts.body(14.5f), modifier = Modifier.weight(1f).padding(end = 16.dp))
            OrganicToggle(alsoBlock, { alsoBlock = it }, L10n.Safety.Report.alsoBlock(name), seed = 91.0)
        }
        if (error) BasicText(L10n.Safety.actionError, style = AppFonts.body(13f, color = Tokens.Terracotta))
        ModalActions {
            OrganicButton(L10n.Safety.cancel, variant = ButtonVariant.Text, small = true, enabled = !busy, onClick = onClose)
            OrganicButton(if (busy) "…" else L10n.Safety.Report.submit, variant = ButtonVariant.Solid, small = true, enabled = !busy) {
                scope.launch {
                    busy = true
                    error = false
                    runCatching {
                        val safety = session.safety ?: error("signed out")
                        safety.report(target, reason, detail)
                        target.userId?.let { if (blocks && alsoBlock) safety.block(it) }
                    }.onSuccess {
                        done = blocks && alsoBlock
                        if (blocks && alsoBlock) onBlocked()
                    }.onFailure { error = true }
                    busy = false
                }
            }
        }
    }
}

private fun reasonLabel(r: SafetyService.Reason) = when (r) {
    SafetyService.Reason.Spam -> L10n.Safety.Report.Reasons.spam
    SafetyService.Reason.Harassment -> L10n.Safety.Report.Reasons.harassment
    SafetyService.Reason.Hate -> L10n.Safety.Report.Reasons.hate
    SafetyService.Reason.Sexual -> L10n.Safety.Report.Reasons.sexual
    SafetyService.Reason.SelfHarm -> L10n.Safety.Report.Reasons.self_harm
    SafetyService.Reason.Violence -> L10n.Safety.Report.Reasons.violence
    SafetyService.Reason.Other -> L10n.Safety.Report.Reasons.other
}

/** The undo banner while a deletion is scheduled (web: AccountDeletionBanner). */
@Composable
fun AccountDeletionBanner(session: Session, date: OffsetDateTime) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    Row(
        Modifier
            .padding(horizontal = 12.dp)
            .fillMaxWidth()
            .organicSurface(Tokens.TerracottaLight, Tokens.Terracotta, radius = 18.0, seed = 211.0, grainOpacity = 0.2f)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(L10n.AccountDeletion.banner(mediumDate(date.toString()) ?: ""), style = AppFonts.body(14f, 600), modifier = Modifier.weight(1f))
        Spacer(Modifier.size(8.dp))
        // The banner has its own pen line, so its undo draws none (as on the web and iOS).
        OrganicButton(if (busy) "…" else L10n.AccountDeletion.cancel, variant = ButtonVariant.TextAccent, small = true, enabled = !busy) {
            scope.launch {
                busy = true
                failed = false
                runCatching { session.cancelDeletion() }.onFailure { failed = true }
                busy = false
            }
        }
    }
    if (failed) OrganicAlert(L10n.AccountDeletion.error, "OK") { failed = false }
}
