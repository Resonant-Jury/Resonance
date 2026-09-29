package com.resonance.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.CssText
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.Mixes
import com.resonance.design.ModalActions
import com.resonance.design.ModalBody
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicInlineBar
import com.resonance.design.OrganicListEmpty
import com.resonance.design.OrganicModal
import com.resonance.design.OrganicRadio
import com.resonance.design.OrganicTextField
import com.resonance.design.SketchLoader
import com.resonance.design.WavyDivider
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.geometry.seedFromString
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** The settings sections that apply to the app, in the web's order (the twin of iOS's SettingsSection). */
enum class SettingsSection(
    /** SECTION_ICONS. */
    val icon: IconName,
    /** Its place in the web's full list, which seeds the rule above its row. */
    val webIndex: Int,
) {
    Account(IconName.Key, 1),
    Privacy(IconName.Lock, 2),
    Language(IconName.Globe, 4),
    Delete(IconName.Trash, 8);

    val title: String
        get() = when (this) {
            Account -> L10n.Settings.Sections.account
            Privacy -> L10n.Settings.Sections.privacy
            Language -> L10n.Settings.Sections.language
            Delete -> L10n.Settings.Sections.delete
        }
}

/**
 * Settings on a phone (SettingsClient's menu): the title, then one row per
 * section — glyph, name, chevron — between wavy rules, each opening its own
 * screen. No panels: the web drops the frames at this width.
 */
@Composable
fun SettingsScreen(open: (Route) -> Unit, back: () -> Unit) {
    val scroll = rememberScrollState()
    Column(Modifier.fillMaxSize().cream()) {
        OrganicInlineBar(L10n.App.Nav.back, back, scrolled = scroll.scrolledPast20())
        Column(Modifier.verticalScroll(scroll).padding(20.dp).padding(bottom = 40.dp)) {
            BasicText(
                L10n.Settings.title,
                style = AppFonts.heading(28f, lineHeight = 1.2f),
                modifier = Modifier.padding(bottom = 18.dp).semantics { heading() },
            )
            SettingsSection.entries.forEachIndexed { i, section ->
                if (i > 0) WavyDivider(seed = 40.0 + section.webIndex * 6, modifier = Modifier.padding(vertical = 2.dp))
                MenuRow(section) { open(Route.SettingsSection(section)) }
            }
        }
    }
}

@Composable
private fun MenuRow(section: SettingsSection, onClick: () -> Unit) {
    // Deleting the account is the one red row.
    val tint = if (section == SettingsSection.Delete) Mixes.Danger else Tokens.Terracotta
    Row(
        Modifier
            .fillMaxWidth()
            .plainClickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        OrganicIcon(section.icon, size = 22.dp, color = tint)
        BasicText(
            section.title,
            style = AppFonts.body(16f, color = if (section == SettingsSection.Delete) tint else Tokens.Text),
            modifier = Modifier.weight(1f),
        )
        OrganicIcon(IconName.ChevronDown, size = 18.dp, color = Tokens.TextMuted, rotation = -90f)
    }
}

/** One settings section on its own screen; the bar carries its name. */
@Composable
fun SettingsSectionScreen(session: Session, section: SettingsSection, back: () -> Unit) {
    val scroll = rememberScrollState()
    Column(Modifier.fillMaxSize().cream()) {
        OrganicInlineBar(L10n.App.Nav.back, back, title = section.title, scrolled = scroll.scrolledPast20())
        Column(Modifier.fillMaxWidth().verticalScroll(scroll).padding(20.dp).padding(bottom = 40.dp)) {
            when (section) {
                SettingsSection.Account -> AccountSettings(session)
                SettingsSection.Privacy -> PrivacySettings(session)
                SettingsSection.Language -> LanguageSettings(session)
                SettingsSection.Delete -> DeleteAccountSettings(session)
            }
        }
    }
}

/** Account: the sign-in email and phone (read-only), and signing out — after the web's "Sign out?" confirmation. */
@Composable
private fun AccountSettings(session: Session) {
    var confirming by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
        OrganicTextField(L10n.Settings.Account.email, session.email ?: "", {}, placeholder = "you@example.com", seed = 51.0, enabled = false)
        OrganicTextField(L10n.Settings.Account.phone, session.phoneNumber ?: "", {}, placeholder = "—", seed = 57.0, enabled = false)
        OrganicButton(L10n.Settings.Account.signOut, Modifier.padding(top = 4.dp), variant = ButtonVariant.Outline) { confirming = true }
    }
    if (confirming) OrganicConfirmDialog(
        title = L10n.App.SignOutConfirm.title,
        body = L10n.App.SignOutConfirm.body,
        cancelLabel = L10n.App.SignOutConfirm.cancel,
        confirmLabel = L10n.App.SignOutConfirm.confirm,
        onCancel = { confirming = false },
        onConfirm = { confirming = false; session.signOut() },
    )
}

/** Privacy: the block list, in its own dialog (the web's BlockedListModal). */
@Composable
private fun PrivacySettings(session: Session) {
    var showingBlocks by remember { mutableStateOf(false) }
    OrganicButton(L10n.Settings.Privacy.manageBlocks, variant = ButtonVariant.Outline) { showingBlocks = true }
    if (showingBlocks) OrganicModal({ showingBlocks = false }, L10n.Safety.BlockedList.title, seed = 97.0, closeLabel = L10n.Safety.BlockedList.close) {
        BlockedListContent(session) { showingBlocks = false }
    }
}

/** Language: the interface language, as a radio list (the web's select). */
@Composable
private fun LanguageSettings(session: Session) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BasicText(
            L10n.Settings.Language.ui.uppercase(),
            style = AppFonts.body(Tokens.LabelSize, 600, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em),
        )
        Column {
            LanguageRow(session, Strings.Language.ZhTW, "繁體中文", 71.0)
            WavyDivider(seed = 67.0, modifier = Modifier.padding(vertical = 2.dp))
            LanguageRow(session, Strings.Language.En, "English", 73.0)
        }
    }
}

@Composable
private fun LanguageRow(session: Session, language: Strings.Language, label: String, seed: Double) {
    val selected = Strings.language == language
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .semantics { this.selected = selected }
            .plainClickable(role = Role.RadioButton) { session.setLanguage(language) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(
            label,
            style = AppFonts.body(15f, if (selected) 600 else 400, color = if (selected) Tokens.Terracotta else Tokens.Text),
            modifier = Modifier.weight(1f),
        )
        OrganicRadio(selected, seed)
    }
}

/**
 * DeleteAccountSection: what happens, the backup first, then the quieter
 * outline Delete (the web keeps it from reading as a call to action) and its
 * confirmation. The backup goes wherever the person picks (the system's save sheet).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DeleteAccountSettings(session: Session) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var exporting by remember { mutableStateOf(false) }
    var exported by remember { mutableStateOf(false) }
    var confirming by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }

    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            exporting = true
            failed = false
            runCatching {
                val bytes = session.account.export()
                withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } }
            }.onSuccess { exported = true }.onFailure { failed = true }
            exporting = false
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        BasicText(L10n.Settings.Delete.title, style = AppFonts.heading(20f, lineHeight = 1.3f))
        CssText(L10n.Settings.Delete.warn, AppFonts.Family.Body, 14f, lineHeight = 1.65f, color = Tokens.TextMuted)
        CssText(L10n.Settings.Delete.exportHint, AppFonts.Family.Body, 14f, lineHeight = 1.65f, color = Tokens.TextMuted)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OrganicButton(
                if (exporting) L10n.Settings.Delete.exporting else L10n.Settings.Delete.export,
                variant = ButtonVariant.Ghost,
                icon = if (exported) IconName.Check else IconName.Document,
                enabled = !exporting,
            ) { save.launch("resonance-backup-${LocalDate.now()}.json") }
            OrganicButton(L10n.Settings.Delete.button, variant = ButtonVariant.Outline, icon = IconName.Trash) { confirming = true }
        }
        if (failed) BasicText(L10n.Settings.Delete.error, style = AppFonts.body(13f, color = Mixes.Danger))
    }

    if (confirming) OrganicConfirmDialog(
        title = L10n.Settings.Delete.confirmTitle,
        body = L10n.Settings.Delete.confirmBody(
            OffsetDateTime.now().plusDays(7).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(Strings.language.locale)),
        ),
        cancelLabel = L10n.Settings.Delete.cancel,
        confirmLabel = L10n.Settings.Delete.confirm,
        busy = busy,
        seed = 73.0,
        onCancel = { confirming = false },
        onConfirm = {
            scope.launch {
                busy = true
                failed = false
                // Success signs the person out, which leaves this screen.
                runCatching { session.scheduleDeletion() }.onFailure { failed = true; confirming = false }
                busy = false
            }
        },
    )
}

/** BlockedListModal's inside: everyone blocked, newest first, each with a small Unblock, between wavy rules. */
@Composable
private fun ColumnScope.BlockedListContent(session: Session, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var people by remember { mutableStateOf<List<SafetyService.BlockedPerson>?>(null) }
    var pending by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { people = runCatching { session.safety?.blocked() }.getOrNull() ?: emptyList() }

    ModalTitle(L10n.Safety.BlockedList.title)
    ModalBody(L10n.Safety.BlockedList.subtitle)
    val list = people
    when {
        list == null -> Box(Modifier.fillMaxWidth().padding(vertical = 18.dp), contentAlignment = Alignment.Center) { SketchLoader(44.dp) }
        list.isEmpty() -> OrganicListEmpty(L10n.Safety.BlockedList.empty, 14.5f, Modifier.padding(vertical = 18.dp))
        else -> Column {
            list.forEachIndexed { i, person ->
                if (i > 0) WavyDivider(seed = 100.0 + i * 7, modifier = Modifier.padding(vertical = 2.dp))
                Row(
                    Modifier.padding(horizontal = 2.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    HandDrawnAvatar(
                        person.initials,
                        person.avatarUrl,
                        person.accentColor?.let(OklchColor::parse) ?: Tokens.CreamDark,
                        36.dp,
                        person.avatarSeed ?: seedFromString(person.id).toDouble(),
                    )
                    Column(Modifier.weight(1f)) {
                        BasicText(person.handle ?: L10n.Safety.BlockedList.unknownUser, style = AppFonts.body(15f, 600), maxLines = 1)
                        person.since?.let { d ->
                            val date = d.toInstant().atZone(ZoneId.systemDefault()).toLocalDate()
                                .format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Strings.language.locale))
                            BasicText(L10n.Safety.BlockedList.since(date), style = AppFonts.body(12.5f, color = Tokens.TextMuted))
                        }
                    }
                    OrganicButton(
                        if (pending == person.id) "…" else L10n.Safety.unblock,
                        variant = ButtonVariant.Ghost,
                        small = true,
                        enabled = pending == null,
                    ) {
                        scope.launch {
                            pending = person.id
                            runCatching { session.safety?.unblock(person.id) }.onSuccess { people = people?.filter { it.id != person.id } }
                            pending = null
                        }
                    }
                }
            }
        }
    }
    ModalActions { OrganicButton(L10n.Safety.BlockedList.close, small = true, onClick = onClose) }
}

/** Past the web header's 20px scroll threshold, when its pen line inks in fully. */
@Composable
fun ScrollState.scrolledPast20(): Boolean {
    val threshold = with(LocalDensity.current) { 20.dp.toPx() }
    return value > threshold
}
