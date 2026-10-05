package com.resonance.app.ui

import android.Manifest
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.api.models.NotificationSettings
import com.resonance.app.PushCenter
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.CssText
import com.resonance.design.EmptyAction
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.Mixes
import com.resonance.design.ModalCloseButton
import com.resonance.design.ModalBody
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicInlineBar
import com.resonance.design.inlineBarTop
import com.resonance.design.OrganicLink
import com.resonance.design.OrganicListEmpty
import com.resonance.design.OrganicModal
import com.resonance.design.OrganicRadio
import com.resonance.design.SquareFlag
import com.resonance.design.OrganicTextField
import com.resonance.design.OrganicToggle
import com.resonance.design.SketchLoader
import com.resonance.design.WavyDivider
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.geometry.seedFromString
import com.resonance.kit.PolicyPage
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.push.NotificationSwitch
import com.resonance.kit.push.get
import kotlinx.coroutines.CancellationException
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
    Profile(IconName.User, 0),
    Account(IconName.Key, 1),
    Privacy(IconName.Lock, 2),
    Notifications(IconName.Bell, 3),
    Language(IconName.Globe, 4),
    Terms(IconName.Document, 6),
    Delete(IconName.Trash, 7);

    val title: String
        get() = when (this) {
            Profile -> L10n.Settings.Sections.profile
            Account -> L10n.Settings.Sections.account
            Privacy -> L10n.Settings.Sections.privacy
            Notifications -> L10n.Settings.Sections.notifications
            Language -> L10n.Settings.Sections.language
            Terms -> L10n.Settings.Sections.terms
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
    // The bar lies over the page, so what scrolls shows right up to its pen line.
    Box(Modifier.fillMaxSize().cream()) {
        Column(Modifier.verticalScroll(scroll).padding(top = inlineBarTop()).padding(20.dp).padding(bottom = 40.dp)) {
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
        OrganicInlineBar(L10n.App.Nav.back, back, scrolled = scroll.scrolledPast20())
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
    // The keyboard shortens the page, so the profile's fields scroll into view above it.
    Box(Modifier.fillMaxSize().cream().imePadding()) {
        Column(Modifier.fillMaxWidth().verticalScroll(scroll).padding(top = inlineBarTop()).padding(20.dp).padding(bottom = 40.dp)) {
            when (section) {
                SettingsSection.Profile -> ProfileSettings(session)
                SettingsSection.Account -> AccountSettings(session)
                SettingsSection.Privacy -> PrivacySettings(session)
                SettingsSection.Notifications -> NotificationSettings(session)
                SettingsSection.Language -> LanguageSettings(session)
                SettingsSection.Terms -> TermsSettings(session)
                SettingsSection.Delete -> DeleteAccountSettings(session)
            }
        }
        OrganicInlineBar(L10n.App.Nav.back, back, title = section.title, scrolled = scroll.scrolledPast20())
    }
}

/**
 * Profile: the pen name (checked as it is typed; your own counts as free),
 * the one-line bio (≤ 80, empty clears it) and the region. The web saves
 * them as you type; here one Save changes sends what changed (PATCH
 * /api/v1/me), and only once a new name has checked out as free. No 30-day
 * hint: nothing enforces it. The photo stays a web task for now.
 */
@Composable
private fun ProfileSettings(session: Session) {
    val profile by session.profile.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val me = (profile as? Session.Profile.Loaded)?.me
    if (me == null) {
        if (profile is Session.Profile.Failed) {
            OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { scope.launch { session.loadMe() } }, action = EmptyAction.Outline, verticalPadding = 24.dp)
        } else {
            Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) { SketchLoader(44.dp) }
        }
        return
    }
    // Keyed on the account, so a save (which hands back the new profile) doesn't reset what is being typed.
    var handle by rememberSaveable(me.id) { mutableStateOf(me.handle) }
    var bio by rememberSaveable(me.id) { mutableStateOf(me.bio.orEmpty()) }
    var region by rememberSaveable(me.id) { mutableStateOf(me.region.orEmpty()) }
    var retry by remember { mutableIntStateOf(0) }
    val availability = rememberPenNameAvailability(session, handle, own = me.handle, retry = retry)
    var saving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }

    val name = handle.trim()
    val handleChange = name.takeIf { it != me.handle }
    val bioChange = bio.takeIf { it.trim() != me.bio.orEmpty() }
    val regionChange = region.takeIf { it.isNotBlank() && it != me.region.orEmpty() }
    val nameOk = handleChange == null || availability.value == Availability.Available
    val canSave = (handleChange != null || bioChange != null || regionChange != null) && nameOk && !saving

    Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
        PenNameField(L10n.Settings.Profile.handle, handle, { handle = it; saved = false; failed = false }, availability.value, onRetry = { retry++ })
        OrganicTextField(L10n.Settings.Profile.bio, bio, { bio = it; saved = false; failed = false }, seed = 37.0, maxLength = BIO_MAX)
        ChoiceList(L10n.Settings.Profile.region, Regions.settings(me.region), region, seed = 43.0, flag = { it }) { region = it; saved = false; failed = false }
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OrganicButton(
                if (saving) "…" else L10n.Write.saveChanges,
                icon = if (saved) IconName.Check else null,
                enabled = canSave,
            ) {
                scope.launch {
                    saving = true
                    failed = false
                    try {
                        val updated = session.updateProfile(handle = handleChange, bio = bioChange, region = regionChange)
                        // The server's own trim of what was saved.
                        handle = updated.handle
                        bio = updated.bio.orEmpty()
                        // The server refreshes the cached profile pages itself (under the old name too, after a rename).
                        saved = true
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: ApiFailure) {
                        if (e.isConflict) availability.value = Availability.Taken else failed = true
                    } catch (e: Exception) {
                        failed = true
                    } finally {
                        saving = false
                    }
                }
            }
            if (failed) BasicText(L10n.Native.saveError, style = AppFonts.body(13f, color = Mixes.Danger))
        }
    }
}

/** The web's bio limit (BIO_MAX in lib/api/v1/schemas.ts). */
private const val BIO_MAX = 80

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

/** A push switch of Settings → Notifications, as the web's NotificationsSection lists them. */
private data class PushSwitchRow(val switch: NotificationSwitch, val label: String, val hint: String, val seed: Double)

private val pushSwitchRows: List<PushSwitchRow>
    get() = listOf(
        PushSwitchRow(NotificationSwitch.Picks, L10n.Settings.Notifications.picks, L10n.Settings.Notifications.picksHint, 83.0),
        PushSwitchRow(NotificationSwitch.ConnectionCards, L10n.Settings.Notifications.connectionCards, L10n.Settings.Notifications.connectionCardsHint, 89.0),
    )

/** What turning a push switch on takes ([turnOn]). */
internal enum class TurnOn {
    /** Notifications can show: the switch is saved. */
    Save,

    /** The system's permission first (API 33+, not granted): the switch is saved once it is given. */
    Ask,

    /** Notifications are off in the system settings and the app can't ask: the switch stays off, and the notice says where to turn them on. */
    Refused,
}

internal fun turnOn(canNotify: Boolean, canAskPermission: Boolean): TurnOn = when {
    canNotify -> TurnOn.Save
    canAskPermission -> TurnOn.Ask
    else -> TurnOn.Refused
}

/**
 * Whether the notice that notifications are off in the system settings shows: while they are, after
 * a switch was refused for it — or with a switch on whose pushes can't reach this phone.
 */
internal fun showsPermissionNotice(settings: NotificationSettings?, canNotify: Boolean, refused: Boolean): Boolean =
    !canNotify && (refused || (settings != null && (settings.picks || settings.connectionCards)))

/**
 * Notifications: the pushes beyond the ones answering you, each its own switch with its hint, both
 * off until turned on (the web's NotificationsSection). A flip shows at once and is undone, with a
 * line saying so, when it doesn't save. Turning one on while notifications can't show asks for the
 * permission first (API 33+), and saves once it is given; refused — or switched off in the system
 * settings — the switch stays off and a notice leads to the app's notification settings.
 */
@Composable
private fun NotificationSettings(session: Session) {
    val context = LocalContext.current
    val switches = remember(session.uid) { session.notificationSwitches() }
    val state by switches.state.collectAsStateWithLifecycle()
    var canNotify by remember { mutableStateOf(PushCenter.canNotify) }
    var refused by rememberSaveable { mutableStateOf(false) }
    // The switch waiting on the permission dialog (by name: it outlives a recreated activity).
    var asking by rememberSaveable { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    LaunchedEffect(switches, attempt) { switches.load() }

    // Allowed at last (the dialog, or the system settings and back): this install registers now, not at the next launch.
    fun allowed() {
        refused = false
        session.pushesAllowed()
    }
    // Back on screen — from the system settings, say: notifications may show now, or no longer.
    LifecycleResumeEffect(Unit) {
        val now = PushCenter.canNotify
        if (now && !canNotify) allowed()
        canNotify = now
        onPauseOrDispose {}
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        val switch = asking?.let { name -> NotificationSwitch.entries.firstOrNull { it.name == name } }
        asking = null
        canNotify = PushCenter.canNotify
        if (canNotify) {
            allowed()
            switch?.let { switches.set(it, true) }
        } else {
            refused = true
        }
    }
    fun flip(switch: NotificationSwitch, on: Boolean) {
        if (!on) {
            switches.set(switch, false)
            return
        }
        when (turnOn(PushCenter.canNotify, PushCenter.canAskPermission)) {
            TurnOn.Save -> {
                refused = false
                switches.set(switch, true)
            }
            TurnOn.Ask -> {
                asking = switch.name
                PushCenter.permissionAsked()
                permission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            TurnOn.Refused -> {
                canNotify = false
                refused = true
            }
        }
    }

    if (state.loadFailed) {
        OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { attempt++ }, action = EmptyAction.Outline, verticalPadding = 24.dp)
        return
    }
    val settings = state.settings
    Column {
        pushSwitchRows.forEachIndexed { i, row ->
            if (i > 0) WavyDivider(seed = row.seed + 2, modifier = Modifier.padding(vertical = 2.dp))
            Row(
                Modifier.fillMaxWidth().padding(top = if (i == 0) 0.dp else 14.dp, bottom = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    BasicText(row.label, style = AppFonts.body(16f, lineHeight = 1.45f))
                    BasicText(row.hint, style = AppFonts.body(Tokens.HintSize, lineHeight = 1.55f, color = Tokens.TextMuted))
                }
                // Level with the label's first line; dimmed until the switches are read.
                Box(Modifier.padding(top = 1.dp)) {
                    OrganicToggle(settings?.get(row.switch) ?: false, { flip(row.switch, it) }, row.label, seed = row.seed, enabled = settings != null)
                }
            }
        }
        if (showsPermissionNotice(settings, canNotify, refused)) {
            Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                BasicText(L10n.Settings.Notifications.permissionDenied, style = AppFonts.body(14f, lineHeight = 1.55f, color = Tokens.TextMuted))
                OrganicButton(L10n.Settings.Notifications.openSettings, variant = ButtonVariant.Outline, small = true) {
                    runCatching { context.startActivity(PushCenter.notificationSettingsIntent(context)) }
                }
            }
        }
        if (state.saveFailed) {
            BasicText(L10n.Settings.Notifications.saveError, style = AppFonts.body(13f, color = Mixes.Danger), modifier = Modifier.padding(top = 14.dp))
        }
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
            LanguageRow(session, Strings.Language.ZhTW, "繁體中文", "tw", 71.0)
            WavyDivider(seed = 67.0, modifier = Modifier.padding(vertical = 2.dp))
            LanguageRow(session, Strings.Language.En, "English", "gb", 73.0)
        }
    }
}

@Composable
private fun LanguageRow(session: Session, language: Strings.Language, label: String, flag: String, seed: Double) {
    val selected = Strings.language == language
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .semantics { this.selected = selected }
            .plainClickable(role = Role.RadioButton) { session.setLanguage(language) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The web's language select sets each name after its SquareFlag.
        SquareFlag(flag, 18.dp)
        Spacer(Modifier.width(10.dp))
        BasicText(
            label,
            style = AppFonts.body(15f, if (selected) 600 else 400, color = if (selected) Tokens.Terracotta else Tokens.Text),
            modifier = Modifier.weight(1f),
        )
        OrganicRadio(selected, seed)
    }
}

/**
 * Terms: the three policy pages (privacy, terms, contact), each an OrganicLink
 * 18dp apart in 16sp text. They open the live pages in the language of the
 * interface, inside the app.
 */
@Composable
private fun TermsSettings(session: Session) {
    val context = LocalContext.current
    val language = Strings.language
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        PolicyPage.entries.forEach { page ->
            OrganicLink(page.label, href = page.path(language)) {
                InAppBrowser.open(context, page.url(session.config.origin, language))
            }
        }
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
                variant = ButtonVariant.Text,
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
        destructive = true,
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
                        variant = ButtonVariant.TextAccent,
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
    ModalCloseButton(L10n.Safety.BlockedList.close, onClose)
}

/** Past the web header's 20px scroll threshold, when its pen line inks in fully. */
@Composable
fun ScrollState.scrolledPast20(): Boolean {
    val threshold = with(LocalDensity.current) { 20.dp.toPx() }
    return value > threshold
}
