package com.resonance.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.BuildConfig
import com.resonance.app.DebugLaunch
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.CssText
import com.resonance.design.EmptyAction
import com.resonance.design.OrganicEmptyState
import com.resonance.design.EmbedStoryCard
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.MessageBubble
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicImage
import com.resonance.design.MenuTrigger
import com.resonance.design.OrganicMenu
import com.resonance.design.OrganicMenuItem
import com.resonance.design.OrganicModal
import com.resonance.design.WavyDivider
import com.resonance.design.cream
import com.resonance.design.fieldHintStyle
import com.resonance.design.fieldSurface
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.organicSurface
import com.resonance.design.plainClickable
import com.resonance.design.seedFromId
import com.resonance.geometry.seedFromString
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Date

/**
 * A conversation (ThreadView.tsx, phone): its own header — back, the person,
 * the ⋯ — over a pen rule; the newest 50 messages with day labels; then
 * attachments and the composer. Search replaces the header row; the ⋯ holds
 * search, what's been shared, report, block and delete. The twin of iOS's
 * ThreadScreen.
 */
@Composable
fun ThreadScreen(session: Session, handle: String, uid: String?, note: MessagingApi.Note?, open: (Route) -> Unit, back: () -> Unit) {
    val scope = rememberCoroutineScope()
    val model = rememberSaveable(handle, uid, saver = threadSaver(handle, uid, session)) {
        ThreadModel(handle, uid, note, session).also { m ->
            // The debug `threadDraft` extra fills the composer (screen checks; the emulator's keyboard is slow to drive).
            if (BuildConfig.DEBUG) DebugLaunch.threadDraft?.let { m.draft = it }
        }
    }
    LaunchedEffect(model) { model.load() }
    DisposableEffect(model) { onDispose { model.close() } }
    // Back in the foreground: listeners that failed listen again; a thread that couldn't find its person asks again.
    val foregrounded by session.foregrounded.collectAsStateWithLifecycle()
    LaunchedEffect(model, foregrounded) { model.resumeIfFailed() }

    var searching by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var showingMedia by remember { mutableStateOf(false) }
    var pickingCard by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf(false) }
    var confirmingBlock by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var blockError by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().cream().statusBarsPadding().navigationBarsPadding().imePadding()) {
        when (model.phase) {
            ThreadModel.Phase.Loading -> {}
            ThreadModel.Phase.Missing -> {
                BasicText(
                    L10n.Messages.userNotFound,
                    style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp).padding(top = 20.dp),
                )
            }
            // Who they are couldn't be asked (offline): a retry, never "user not found".
            ThreadModel.Phase.Failed -> OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { scope.launch { model.load() } }, action = EmptyAction.Outline)
            ThreadModel.Phase.Ready -> {
                val other = model.other
                val menu = buildList {
                    add(OrganicMenuItem(L10n.Messages.menuSearch, IconName.Search) { searching = true })
                    add(OrganicMenuItem(L10n.Messages.menuMedia, IconName.Cards) { showingMedia = true })
                    add(OrganicMenuItem(L10n.Safety.reportMessage, IconName.Flag) { reporting = true })
                    if (model.isBlocked) {
                        add(OrganicMenuItem(L10n.Safety.unblock, IconName.Ban) {
                            scope.launch {
                                other?.let { runCatching { session.safety?.unblock(it.id) } }
                                model.refreshConnection()
                            }
                        })
                    } else {
                        add(OrganicMenuItem(L10n.Safety.block, IconName.Ban, destructive = true) {
                            blockError = null
                            confirmingBlock = true
                        })
                    }
                    add(OrganicMenuItem(L10n.Messages.menuDelete, IconName.Trash, destructive = true) { confirmingDelete = true })
                }
                ThreadHeader(model, searching, query, { query = it }, { searching = false; query = "" }, menu, open, back)
                WavyDivider(seed = 41.0, lineWidth = Tokens.Ink)
                if (model.connected == false) {
                    Column(Modifier.fillMaxWidth().padding(vertical = 20.dp, horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        BasicText(L10n.Messages.notConnected, style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted))
                        BasicText(
                            L10n.Messages.viewProfile,
                            style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.Terracotta).copy(textDecoration = TextDecoration.Underline),
                            modifier = Modifier.plainClickable(role = Role.Button) { open(Route.Author(model.other?.handle ?: handle)) },
                        )
                    }
                } else {
                    Messages(model, searching, query, open = { route ->
                        showingMedia = false
                        open(route)
                    })
                    Composer(model, handle, onPickCard = { pickingCard = true }, Modifier.padding(horizontal = 14.dp).padding(bottom = 14.dp))
                }

                if (showingMedia) OrganicModal({ showingMedia = false }, L10n.Messages.mediaTitle, seed = 53.0, maxWidth = 480.dp, closeLabel = L10n.Messages.mediaTitle) {
                    SharedMediaContent(model) { route ->
                        showingMedia = false
                        open(route)
                    }
                }
                val pair = model.pairId
                if (reporting && other != null && pair != null) ReportDialog(
                    session, SafetyService.Target.Message(pair, other.id, pair), other.handle,
                    onBlocked = { scope.launch { model.refreshConnection() } },
                    offerBlock = !model.isBlocked,
                ) { reporting = false }
                if (confirmingBlock) OrganicConfirmDialog(
                    title = L10n.Safety.blockTitle(other?.handle ?: ""),
                    body = L10n.Safety.blockBody,
                    cancelLabel = L10n.Safety.cancel,
                    confirmLabel = L10n.Safety.blockConfirm,
                    onCancel = { confirmingBlock = false },
                    onConfirm = {
                        val person = other ?: return@OrganicConfirmDialog
                        if (busy) return@OrganicConfirmDialog
                        busy = true
                        scope.launch {
                            try {
                                session.safety?.block(person.id)
                                confirmingBlock = false
                                model.refreshConnection()
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                blockError = L10n.Safety.actionError
                            } finally {
                                busy = false
                            }
                        }
                    },
                    busy = busy,
                    seed = 71.0,
                    error = blockError,
                )
                if (confirmingDelete) OrganicConfirmDialog(
                    title = L10n.Messages.deleteConfirmTitle,
                    body = L10n.Messages.deleteConfirmBody,
                    cancelLabel = L10n.Messages.deleteCancel,
                    destructive = true,
                    confirmLabel = L10n.Messages.deleteConfirm,
                    onCancel = { confirmingDelete = false },
                    onConfirm = {
                        if (busy) return@OrganicConfirmDialog
                        scope.launch {
                            busy = true
                            val deleted = model.deleteConversation()
                            busy = false
                            confirmingDelete = false
                            if (deleted) back()
                        }
                    },
                    busy = busy,
                    seed = 59.0,
                )
                if (pickingCard) OrganicModal(
                    { pickingCard = false }, L10n.Messages.pickCard,
                    seed = 53.0, maxWidth = 480.dp, closeLabel = L10n.Write.Editor.CardModal.cancel,
                ) {
                    CardPickerContent(session, L10n.Messages.pickCard, L10n.Messages.pickCardSubtitle, onPick = { card ->
                        model.pendingCard = ThreadModel.Attachment(card.id, card.title)
                        pickingCard = false
                    }) { pickingCard = false }
                }
            }
        }
    }
}

// Header

/** A negative `margin-left`: the row lays the child out narrower by `amount` and draws it that far to the left. */
private fun Modifier.negativeStart(amount: Dp): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)
    val d = amount.roundToPx()
    layout(placeable.width - d, placeable.height) { placeable.place(-d, 0) }
}

/** The thread header's small square buttons (34, corners 11/13/12/14). */
@Composable
private fun HeaderChip(icon: IconName, size: Dp, label: String, modifier: Modifier = Modifier, mirrored: Boolean = false, onClick: () -> Unit) {
    Box(
        modifier
            .size(34.dp)
            .plainClickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        OrganicIcon(icon, Modifier.offset(y = if (mirrored) 1.dp else 0.dp), size = size, color = Tokens.Text, mirrored = mirrored)
    }
}

@Composable
private fun ThreadHeader(
    model: ThreadModel,
    searching: Boolean,
    query: String,
    onQuery: (String) -> Unit,
    onCloseSearch: () -> Unit,
    menu: List<OrganicMenuItem>,
    open: (Route) -> Unit,
    back: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp).padding(vertical = 10.dp).heightIn(min = 38.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (searching) {
            val focus = remember { FocusRequester() }
            LaunchedEffect(Unit) { focus.requestFocus() }
            OrganicIcon(IconName.Search, size = 17.dp, color = Tokens.TextMuted)
            Box(Modifier.weight(1f).height(38.dp), contentAlignment = Alignment.CenterStart) {
                if (query.isEmpty()) BasicText(L10n.Messages.searchPlaceholder, style = fieldHintStyle(14f, 1.3f))
                BasicTextField(
                    query, onQuery,
                    singleLine = true,
                    textStyle = AppFonts.body(14f, lineHeight = 1.3f),
                    cursorBrush = SolidColor(Tokens.Text),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus).semantics { contentDescription = L10n.Messages.menuSearch },
                )
            }
            if (query.trim().isNotEmpty()) {
                BasicText(
                    L10n.Messages.searchCount(model.filtered(query).size),
                    style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted),
                )
            }
            HeaderChip(IconName.Close, 16.dp, L10n.Messages.searchClose, onClick = onCloseSearch)
        } else {
            HeaderChip(IconName.ArrowRight, 16.dp, L10n.Messages.back, Modifier.negativeStart(6.dp), mirrored = true, onClick = back)
            Box(Modifier.weight(1f)) {
                model.other?.let { other ->
                    Row(
                        Modifier
                            .plainClickable(role = Role.Button, onClickLabel = L10n.Messages.viewProfile) { open(Route.Author(other.handle)) },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        HandDrawnAvatar(other.initials, other.avatarUrl, OklchColor.parse(other.accentColor) ?: Tokens.TerracottaLight, 38.dp, seedOr(other.avatarSeed, 3.0))
                        BasicText(
                            other.handle, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            style = AppFonts.heading(18f, 700, lineHeight = 1.2f),
                            modifier = Modifier.weight(1f, fill = false).semantics { heading() },
                        )
                    }
                }
            }
            val pair = model.pairId
            if (model.conversationExists && pair != null) {
                // A bare glyph; its 48 hit box may spill into the row's margin.
                Box(Modifier.size(34.dp).wrapContentSize(unbounded = true)) {
                    OrganicMenu(menu, L10n.Messages.moreMenu, seed = seedFromString(pair).toDouble(), triggerSize = 34.dp, trigger = MenuTrigger.Bare)
                }
            }
        }
    }
}

// Messages

/** The day label: 9月29日 / September 29. */
internal fun dayLabel(date: Date): String {
    val pattern = if (Strings.language == Strings.Language.ZhTW) "M月d日" else "MMMM d"
    return date.toInstant().atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern(pattern, Strings.language.locale))
}

/** The full time a long-press shows (the web's hover title): 9月29日 下午03:04 / September 29 at 03:04 PM. */
internal fun fullTime(date: Date): String {
    val pattern = if (Strings.language == Strings.Language.ZhTW) "M月d日 ahh:mm" else "MMMM d 'at' hh:mm a"
    return date.toInstant().atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern(pattern, Strings.language.locale))
}

private fun sameDay(a: Date, b: Date): Boolean {
    val zone = ZoneId.systemDefault()
    return a.toInstant().atZone(zone).toLocalDate() == b.toInstant().atZone(zone).toLocalDate()
}

@Composable
private fun QuietNote(text: String) {
    BasicText(text, style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted), modifier = Modifier.fillMaxWidth())
}

@Composable
private fun ColumnScope.Messages(model: ThreadModel, searching: Boolean, query: String, open: (Route) -> Unit) {
    val searchingFor = searching && query.trim().isNotEmpty()
    val shown = model.filtered(if (searching) query else "").filter { !(searchingFor && it.text.isEmpty()) }
    val quiet = when {
        // Not "no messages yet" when they couldn't be read.
        model.threadReady && model.messages.isEmpty() -> if (model.listenFailed) L10n.Native.loadError else L10n.Messages.noMessagesYet
        searchingFor && shown.isEmpty() -> L10n.Messages.searchCount(0)
        else -> null
    }
    val list = rememberLazyListState()
    // Newest at the bottom, and back at the bottom whenever a newer message arrives (the web's
    // `scrollTop = scrollHeight`, no animation) — keyed by the newest message, not the count, which
    // stops changing once the thread holds its 50. A reversed list keeps that end pinned however the rows measure.
    LaunchedEffect(model.messages.lastOrNull()?.id) { list.scrollToItem(0) }
    val newestFirst = shown.asReversed()
    BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
        // The stack is at most 72% of the screen's width (iOS's own number).
        val rowMax = maxWidth * 0.72f
        LazyColumn(
            Modifier.fillMaxSize(),
            state = list,
            reverseLayout = true,
            contentPadding = PaddingValues(vertical = 14.dp, horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            itemsIndexed(newestFirst, key = { _, m -> m.id }) { i, message ->
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    // The day label leads the first message of a day (the one before it in time is the next row).
                    val before = newestFirst.getOrNull(i + 1)
                    if (before == null || !sameDay(before.sentAt, message.sentAt)) {
                        BasicText(
                            dayLabel(message.sentAt),
                            style = AppFonts.body(11f, lineHeight = 1.3f, color = Tokens.TextMuted).copy(textAlign = androidx.compose.ui.text.style.TextAlign.Center),
                            modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 2.dp),
                        )
                    }
                    MessageRow(message, model, rowMax, open)
                }
            }
            if (quiet != null) item(key = "quiet") { QuietNote(quiet) }
        }
    }
}

/** One message: a shared card over the bubble, on your side or theirs, at most 72% wide. */
@Composable
private fun MessageRow(message: ThreadModel.Message, model: ThreadModel, rowMax: Dp, open: (Route) -> Unit) {
    val mine = message.senderId == model.me
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Column(
            Modifier.widthIn(max = rowMax),
            horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            val card = message.cardRef?.let { model.cards[it] }
            if (card != null) {
                EmbedStoryCard(
                    title = card.title,
                    author = if (card.anonymous) null else card.author?.handle,
                    imageUrl = card.imageUrl,
                    hue = card.accentHue,
                    seed = seedFromId(card.id, start = 11),
                    modifier = Modifier.widthIn(max = 320.dp).plainClickable(role = Role.Button) { open(Route.Card(card.routeKey, card)) },
                )
            }
            if (message.text.isNotEmpty() || message.noteRef != null) Bubble(message, mine)
        }
    }
}

/** The bubble, with a long-press for its full time and Copy (the web's hover title). */
@Composable
private fun Bubble(message: ThreadModel.Message, mine: Boolean) {
    var menu by remember { mutableStateOf(false) }
    Box {
        MessageBubble(
            message.text, mine, seedFromId(message.id),
            Modifier.pointerInput(Unit) { detectTapGestures(onLongPress = { menu = true }) },
            quoteLabel = if (message.noteRef == null) null else L10n.Messages.quotedNote,
        )
        if (menu) {
            val context = LocalContext.current
            val gap = with(androidx.compose.ui.platform.LocalDensity.current) { 6.dp.roundToPx() }
            Popup(
                popupPositionProvider = remember(mine, gap) { BelowBubble(mine, gap) },
                onDismissRequest = { menu = false },
                properties = PopupProperties(focusable = true),
            ) {
                Column(
                    Modifier
                        .widthIn(min = 160.dp)
                        .width(IntrinsicSize.Max)
                        .organicSurface(Tokens.Cream, Tokens.Terracotta, radius = 16.0, seed = 61.0, grainOpacity = 0.25f)
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                ) {
                    BasicText(fullTime(message.sentAt), style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted), modifier = Modifier.padding(vertical = 10.dp))
                    if (message.text.isNotEmpty()) BasicText(
                        L10n.Native.copy,
                        style = AppFonts.body(14f, 600, lineHeight = 1.3f, color = Tokens.Terracotta),
                        modifier = Modifier
                            .fillMaxWidth()
                            .plainClickable(role = Role.Button) {
                                context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("message", message.text))
                                menu = false
                            }
                            .padding(vertical = 10.dp),
                    )
                }
            }
        }
    }
}

/** Under the bubble, on its own edge; above it when there is no room below. */
private class BelowBubble(private val mine: Boolean, private val gap: Int) : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
        val x = (if (mine) anchorBounds.right - popupContentSize.width else anchorBounds.left).coerceIn(0, maxOf(0, windowSize.width - popupContentSize.width))
        val below = anchorBounds.bottom + gap
        val y = if (below + popupContentSize.height <= windowSize.height) below else maxOf(0, anchorBounds.top - gap - popupContentSize.height)
        return IntOffset(x, y)
    }
}

// Composer

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Composer(model: ThreadModel, handle: String, onPickCard: () -> Unit, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
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
        Row(
            Modifier.padding(top = 12.dp).height(IntrinsicSize.Min),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                Modifier
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
                    modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }.semantics { contentDescription = L10n.Messages.threadWith(handle) },
                )
            }
            // `height: 100%`: Send stretches to the field's height; dimmed and deaf until there is something to send.
            Box(Modifier.fillMaxHeight().dimmedUnless(model.canSend)) {
                OrganicButton(if (model.sending) "…" else L10n.Messages.send, Modifier.fillMaxHeight(), variant = ButtonVariant.Solid, small = true) {
                    if (model.canSend) scope.launch { model.send() }
                }
            }
        }
        model.error?.let { BasicText(it, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.Terracotta), modifier = Modifier.padding(top = 6.dp)) }
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

// Cards & links

/** "Cards & links": everything shared in the loaded messages. */
@Composable
private fun SharedMediaContent(model: ThreadModel, open: (Route) -> Unit) {
    val (cardIds, links) = model.shared
    val cards = cardIds.mapNotNull { model.cards[it] }
    val uri = LocalUriHandler.current
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.padding(bottom = 8.dp)) { ModalTitle(L10n.Messages.mediaTitle) }
        CssText(
            L10n.Messages.mediaSubtitle, AppFonts.Family.Body, 14f, lineHeight = 1.6f, color = Tokens.TextMuted,
            modifier = Modifier.padding(bottom = 18.dp),
        )
        if (cards.isEmpty() && links.isEmpty()) {
            BasicText(L10n.Messages.mediaEmpty, style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted))
        }
        Column(
            Modifier.heightIn(max = minOf(420f, LocalConfiguration.current.screenHeightDp * 0.55f).dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            if (cards.isNotEmpty()) Column {
                MediaHead(L10n.Messages.mediaCards)
                cards.forEachIndexed { i, card ->
                    if (i > 0) WavyDivider(seed = (53 + i * 7).toDouble())
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .plainClickable(role = Role.Button) { open(Route.Card(card.routeKey, card)) }
                            .padding(vertical = 10.dp, horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        val cover = OklchColor.parse("oklch(90% 0.06 ${card.accentHue ?: 55.0})") ?: Tokens.TerracottaLight
                        OrganicImage(card.imageUrl, 7.0, Modifier.size(40.dp)) { Box(Modifier.fillMaxSize().background(cover)) }
                        BasicText(
                            card.title, maxLines = 2, overflow = TextOverflow.Ellipsis,
                            style = AppFonts.body(14f, 600, lineHeight = 1.3f), modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
            if (links.isNotEmpty()) Column {
                MediaHead(L10n.Messages.mediaLinks)
                links.forEachIndexed { i, url ->
                    if (i > 0) WavyDivider(seed = (97 + i * 11).toDouble())
                    BasicText(
                        url,
                        style = AppFonts.body(13.5f, lineHeight = 1.3f, color = Tokens.Terracotta).copy(textDecoration = TextDecoration.Underline),
                        modifier = Modifier
                            .fillMaxWidth()
                            .plainClickable(role = Role.Button) { runCatching { uri.openUri(url) } }
                            .padding(vertical = 10.dp, horizontal = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun MediaHead(text: String) {
    BasicText(
        text.uppercase(),
        style = AppFonts.body(12f, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em),
        modifier = Modifier.padding(bottom = 4.dp),
    )
}
