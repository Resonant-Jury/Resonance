package com.resonance.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicInlineBar
import com.resonance.design.OrganicRadio
import com.resonance.design.SketchLoader
import com.resonance.design.WavyDivider
import com.resonance.design.cream
import com.resonance.design.organicSurface
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.seedFromString
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * Settings (settings/page.tsx, the parts that apply to the app): language,
 * the block list, signing out, and deleting the account after optionally
 * downloading everything one wrote. The twin of iOS's SettingsScreen.
 */
@Composable
fun SettingsScreen(session: Session, open: (Route) -> Unit, back: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var exporting by remember { mutableStateOf(false) }
    var exported by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var deleteError by remember { mutableStateOf<String?>(null) }

    // The backup goes wherever the person picks (the system's save sheet).
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            exporting = true
            runCatching {
                val bytes = session.account.export()
                withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } }
            }.onSuccess { exported = true }
            exporting = false
        }
    }

    Column(Modifier.fillMaxSize().cream()) {
        OrganicInlineBar(L10n.App.Nav.back, back)
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(20.dp).padding(bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            BasicText(L10n.Settings.title, style = AppFonts.heading(30f, lineHeight = 1.2f), modifier = Modifier.semantics { heading() })

            Panel(L10n.Settings.Sections.language, 71.0) {
                BasicText(L10n.Settings.Language.ui, style = AppFonts.body(14f, color = Tokens.TextMuted))
                Column {
                    LanguageRow(session, Strings.Language.ZhTW, "繁體中文", 71.0)
                    WavyDivider(seed = 67.0, modifier = Modifier.padding(vertical = 2.dp))
                    LanguageRow(session, Strings.Language.En, "English", 73.0)
                }
            }

            Panel(L10n.Settings.Sections.privacy, 23.0) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable(role = Role.Button) { open(Route.BlockedList) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BasicText(L10n.Settings.Privacy.manageBlocks, style = AppFonts.body(16f), modifier = Modifier.weight(1f))
                    OrganicIcon(IconName.ChevronDown, Modifier.padding(start = 8.dp), size = 18.dp, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value, rotation = -90f)
                }
            }

            Panel(L10n.Settings.Sections.account, 41.0) {
                OrganicButton(L10n.Settings.Account.signOut, variant = ButtonVariant.Ghost) { session.signOut() }
            }

            Panel(L10n.Settings.Delete.title, 53.0) {
                BasicText(L10n.Settings.Delete.exportHint, style = AppFonts.body(14f, lineHeight = 1.6f, color = Tokens.TextMuted))
                OrganicButton(
                    if (exporting) L10n.Settings.Delete.exporting else L10n.Settings.Delete.export,
                    variant = ButtonVariant.Outline,
                    icon = if (exported) IconName.Check else IconName.Document,
                    enabled = !exporting,
                ) { save.launch("resonance-backup-${LocalDate.now()}.json") }
                WavyDivider(seed = 61.0, modifier = Modifier.padding(vertical = 4.dp))
                BasicText(L10n.Settings.Delete.warn, style = AppFonts.body(14f, lineHeight = 1.6f, color = Tokens.TextMuted))
                OrganicButton(L10n.Settings.Delete.button) { confirmingDelete = true }
                deleteError?.let { BasicText(it, style = AppFonts.body(13f, color = Tokens.Terracotta)) }
            }
        }
    }

    if (confirmingDelete) OrganicConfirmDialog(
        title = L10n.Settings.Delete.confirmTitle,
        body = L10n.Settings.Delete.confirmBody(OffsetDateTime.now().plusDays(7).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(Strings.language.locale))),
        cancelLabel = L10n.Settings.Delete.cancel,
        confirmLabel = L10n.Settings.Delete.confirm,
        busy = deleting,
        onCancel = { confirmingDelete = false },
        onConfirm = {
            scope.launch {
                deleting = true
                runCatching { session.scheduleDeletion() }.onFailure { deleteError = L10n.Settings.Delete.error }
                deleting = false
                confirmingDelete = false
            }
        },
    )
}

/** One choice of a radio list (the web's ToggleGroup rows, with a radio for the switch). */
@Composable
private fun LanguageRow(session: Session, language: Strings.Language, label: String, seed: Double) {
    val selected = Strings.language == language
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .semantics { this.selected = selected }
            .clickable(role = Role.RadioButton) { session.setLanguage(language) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(label, style = AppFonts.body(16f, if (selected) 600 else 400), modifier = Modifier.weight(1f))
        OrganicRadio(selected, seed)
    }
}

/** A settings section: an organic panel with its label in small caps. */
@Composable
private fun Panel(title: String, seed: Double, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .organicSurface(Tokens.CardBg, Tokens.FieldBorder, radius = Tokens.RadiusLg.toDouble(), seed = seed, grainOpacity = 0.2f)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        BasicText(title.uppercase(), style = AppFonts.body(Tokens.LabelSize, 600, color = Tokens.TextMuted).copy(letterSpacing = androidx.compose.ui.unit.TextUnit(Tokens.LabelSize * 0.06f, androidx.compose.ui.unit.TextUnitType.Sp)))
        content()
    }
}

/** The people one blocked, with a way to unblock (web: BlockedListModal). */
@Composable
fun BlockedListScreen(session: Session, back: () -> Unit) {
    val scope = rememberCoroutineScope()
    var people by remember { mutableStateOf<List<SafetyService.BlockedPerson>?>(null) }
    LaunchedEffect(Unit) { people = runCatching { session.safety?.blocked() }.getOrNull() ?: emptyList() }

    Column(Modifier.fillMaxSize().cream()) {
        OrganicInlineBar(L10n.App.Nav.back, back)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            BasicText(L10n.Safety.BlockedList.title, style = AppFonts.heading(28f, lineHeight = 1.2f), modifier = Modifier.semantics { heading() })
            BasicText(L10n.Safety.BlockedList.subtitle, style = AppFonts.body(14f, lineHeight = 1.6f, color = Tokens.TextMuted))
            val list = people
            when {
                list == null -> Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { SketchLoader(44.dp) }
                list.isEmpty() -> OrganicEmptyState(L10n.Safety.BlockedList.empty)
                else -> list.forEach { person ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        HandDrawnAvatar(person.initials, null, Tokens.CreamDark, 40.dp, seedFromString(person.id).toDouble())
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            BasicText(person.handle ?: L10n.Safety.BlockedList.unknownUser, style = AppFonts.body(16f, 600))
                            person.since?.let { d ->
                                val date = d.toInstant().atZone(java.time.ZoneId.systemDefault()).toLocalDate()
                                    .format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Strings.language.locale))
                                BasicText(L10n.Safety.BlockedList.since(date), style = AppFonts.body(12f, color = Tokens.TextMuted))
                            }
                        }
                        OrganicButton(L10n.Safety.unblock, variant = ButtonVariant.Ghost, small = true) {
                            scope.launch {
                                runCatching { session.safety?.unblock(person.id) }.onSuccess { people = people?.filter { it.id != person.id } }
                            }
                        }
                    }
                }
            }
        }
    }
}
