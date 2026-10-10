package com.resonance.app.ui

import androidx.compose.ui.layout.onSizeChanged
import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout
import com.resonance.design.readableColumn

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.BuildConfig
import com.resonance.app.DebugLaunch
import com.resonance.app.PushCenter
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CssText
import com.resonance.design.EmptyAction
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.MenuTrigger
import com.resonance.design.ModalCloseButton
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIconButton
import com.resonance.design.OrganicImage
import com.resonance.design.OrganicInlineBar
import com.resonance.design.OrganicMenu
import com.resonance.design.OrganicMenuItem
import com.resonance.design.OrganicModal
import com.resonance.design.WavyDivider
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.inlineBarTop
import com.resonance.design.plainClickable
import com.resonance.geometry.seedFromString
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.chat.Carried
import com.resonance.kit.chat.ChatMessage
import com.resonance.kit.chat.SearchHit
import com.resonance.kit.chat.ThreadRows
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Date

/**
 * A conversation (ThreadView.tsx, phone): the person in the bar over the messages — newest at the
 * bottom, stacked in runs, with the quotes of replies and the previews of links, older ones read in as
 * the thread is scrolled — then attachments and the composer. A long-press lifts a message with its
 * actions, a drag toward the middle replies. The ⋯ holds search, what's been shared, report, block
 * and delete; search lists the matches over the thread and steps through them. The twin of iOS's
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
    // The conversation counts as being looked at only while this screen is resumed: its pushes then stay quiet,
    // and the one in the shade goes. (Not once the app is in the background, or the screen covered.)
    val pair = model.pairId
    if (pair != null) {
        LifecycleResumeEffect(pair) {
            PushCenter.viewing(pair)
            // What arrived while it was covered or in the background is read now.
            model.markReadIfNeeded()
            onPauseOrDispose { PushCenter.stoppedViewing(pair) }
        }
    }

    var searching by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    // The list of matches covers the thread; after a match is chosen the thread shows and the bar steps through them.
    var showResults by rememberSaveable { mutableStateOf(false) }
    var currentHit by rememberSaveable { mutableStateOf<String?>(null) }
    var showingMedia by remember { mutableStateOf(false) }
    var pickingCard by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf(false) }
    var confirmingBlock by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var blockError by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf<MessageMenu?>(null) }
    val links = rememberLinkOpener()
    val context = LocalContext.current
    val density = LocalDensity.current
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val composerFocus = remember { FocusRequester() }
    val searchFocus = remember { FocusRequester() }
    val flash = remember { Flash() }

    // Over what is drawn: a card the viewer can't see, sent alone, has no row, and shapes no run around it.
    val rows by remember(model) { derivedStateOf { ThreadRows.build(model.messages, drawn = { model.carried(it) != Carried.Nothing }) } }
    val rowsNow by rememberUpdatedState(rows)
    val list = rememberLazyListState()
    val resultsList = rememberLazyListState()
    // The bar lies over the thread, so what scrolls shows right up to its pen line.
    val top = inlineBarTop()
    val topPx = with(density) { top.roundToPx() }
    val scroll = remember(list) { ThreadScroll(list, { rowsNow }, { topPx }) }

    // The words typed are searched for a moment after the last key; a blank field is no search.
    LaunchedEffect(query, searching) {
        if (!searching) return@LaunchedEffect
        if (query.isBlank()) {
            model.search("")
            currentHit = null
        } else {
            delay(SEARCH_DEBOUNCE_MILLIS)
            model.search(query)
        }
    }
    val closeSearch: () -> Unit = {
        searching = false
        showResults = false
        currentHit = null
        query = ""
        model.endSearch()
        focusManager.clearFocus()
    }
    // The matches are marked in the thread while it is being looked at (not under the list of them).
    val marking = searching && query.isNotBlank() && !showResults
    val highlights = remember(model.searchHits, marking) { if (marking) model.searchHits.associate { it.messageId to it.ranges } else emptyMap() }
    val jump: (String, Boolean) -> Unit = { id, pulse ->
        scope.launch {
            // A quote's original may be far up: older pages are read until it is held.
            if (model.ensureLoaded(id) && scroll.reveal(id) && pulse) scroll.indexOf(id).let { rowsNow.asReversed().getOrNull(it)?.message?.key?.let(flash::pulse) }
        }
    }
    val pick: (SearchHit) -> Unit = { hit ->
        currentHit = hit.messageId
        showResults = false
        focusManager.clearFocus()
        keyboard?.hide()
        jump(hit.messageId, false)
    }
    val reply: (ChatMessage) -> Unit = { message ->
        model.reply(message)
        runCatching { composerFocus.requestFocus() }
        keyboard?.show()
    }
    // Opened at a note (a bell row, an older push): the note itself — brought to the middle, flashed and
    // set up to be answered — or, for an older one the thread never got, the chip that answers it.
    LaunchedEffect(model) {
        val landing = model.landOnNote() as? NoteLanding.Message ?: return@LaunchedEffect
        model.reply(landing.message)
        jump(landing.message.id, true)
    }
    BackHandler(enabled = searching) {
        if (showResults && currentHit != null) showResults = false else closeSearch()
    }
    // The row is the list's width inside its 16 margins (their face's column is not counted), capped
    // at the widest bubble: measured where the thread is, a pane beside the conversations included.
    val pageWidth = LocalWindowLayout.current.contentWidth
    var listWidth by remember { mutableStateOf(pageWidth) }
    val rowMax = LayoutClass.bubbleMax(listWidth.value).dp
    val lifted = menu?.row?.message?.key
    val ctx = remember(model, rowMax, links, highlights, currentHit, open, scroll, lifted) {
        ThreadContext(
            model, rowMax, links, open, highlights, currentHit, flash, scroll,
            onMenu = { menu = it },
            onReply = reply,
            onQuote = { id -> jump(id, true) },
            lifted = lifted,
        )
    }

    Box(Modifier.fillMaxSize().cream().onSizeChanged { listWidth = with(density) { it.width.toDp() } }) {
        Column(Modifier.fillMaxSize().navigationBarsPadding().imePadding()) {
            when (model.phase) {
                ThreadModel.Phase.Loading -> {}
                ThreadModel.Phase.Missing -> {
                    BasicText(
                        L10n.Messages.userNotFound,
                        style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted),
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp).padding(top = top + 20.dp),
                    )
                }
                // Who they are couldn't be asked (offline): a retry, never "user not found".
                ThreadModel.Phase.Failed -> Box(Modifier.padding(top = top)) {
                    OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { scope.launch { model.load() } }, action = EmptyAction.Outline)
                }
                // The messages show whoever may write; only the foot changes (ThreadFoot).
                ThreadModel.Phase.Ready -> {
                    val foot = model.foot
                    Box(Modifier.weight(1f).fillMaxWidth()) {
                        MessageList(rows, ctx, list, top, Modifier.fillMaxSize(), pillVisible = !(searching && showResults), sayEmpty = foot.composes)
                        if (searching && showResults) SearchResults(model, query, top, resultsList, pick)
                    }
                    // In a wide pane the composer keeps to a column of its own, centred under the thread.
                    val padded = Modifier.readableColumn(ComposerMax).padding(horizontal = 14.dp).padding(bottom = 14.dp)
                    when (foot) {
                        ThreadFoot.Composer -> Composer(model, handle, composerFocus, onPickCard = { pickingCard = true }, padded)
                        ThreadFoot.Answer -> Composer(
                            model, handle, composerFocus, onPickCard = { pickingCard = true }, padded,
                            lead = L10n.Messages.replyToConnect(model.other?.handle ?: handle),
                        )
                        ThreadFoot.Awaiting -> FootNote(L10n.Messages.awaitingReply)
                        ThreadFoot.Closed -> FootNote(L10n.Messages.notConnected) {
                            BasicText(
                                L10n.Messages.viewProfile,
                                style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.Terracotta).copy(textDecoration = TextDecoration.Underline),
                                modifier = Modifier
                                    .heightIn(min = 44.dp)
                                    .wrapContentHeight()
                                    .plainClickable(role = Role.Button) { open(Route.Author(model.other?.handle ?: handle)) },
                            )
                        }
                        // Whether a note waits not heard yet: no foot, rather than one that changes as it arrives.
                        ThreadFoot.Pending -> {}
                    }
                }
            }
        }

        ThreadBar(
            model, handle, searching, query, showResults, currentHit, searchFocus,
            scrolled = if (searching && showResults) resultsList.canScrollBackward else list.canScrollForward,
            onQuery = { query = it },
            onShowResults = { showResults = true },
            onPick = pick,
            onCloseSearch = closeSearch,
            menu = barMenu(
                model, session, searching = { searching = true; showResults = true },
                showMedia = { showingMedia = true }, report = { reporting = true },
                block = { blockError = null; confirmingBlock = true }, delete = { confirmingDelete = true },
            ),
            open = open, back = back,
        )

        menu?.let { m ->
            MessageMenuOverlay(
                m, ctx,
                items = remember(m) { messageMenuItems(m, model, links, context, open, reply = { reply(m.row.message) }) },
                footer = fullTime(m.row.message.sentAt),
                onDismiss = { menu = null },
            )
        }
    }
    // Opening search puts the cursor in its field.
    LaunchedEffect(searching) { if (searching) runCatching { searchFocus.requestFocus() } }

    val other = model.other
    if (showingMedia) OrganicModal({ showingMedia = false }, L10n.Messages.mediaTitle, seed = 53.0, maxWidth = 480.dp) {
        SharedMediaContent(model, links, onClose = { showingMedia = false }) { route ->
            showingMedia = false
            open(route)
        }
    }
    LinkDialogs(links)
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

/**
 * The thread's foot where there is no composer: a calm line, centred — a note of yours waiting for
 * its answer, or why you can't write here — and what can be done about it, if anything.
 */
@Composable
private fun FootNote(text: String, action: (@Composable () -> Unit)? = null) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 28.dp).padding(top = 14.dp, bottom = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        BasicText(text, style = AppFonts.body(13.5f, lineHeight = 1.55f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
        action?.invoke()
    }
}

/** How long after the last key a search is run. */
private const val SEARCH_DEBOUNCE_MILLIS = 250L

/** The ⋯ menu's rows: search, what's been shared, report, block (or unblock), delete. */
@Composable
private fun barMenu(
    model: ThreadModel,
    session: Session,
    searching: () -> Unit,
    showMedia: () -> Unit,
    report: () -> Unit,
    block: () -> Unit,
    delete: () -> Unit,
): List<OrganicMenuItem> {
    val scope = rememberCoroutineScope()
    val other = model.other
    return buildList {
        add(OrganicMenuItem(L10n.Messages.menuSearch, IconName.Search) { searching() })
        add(OrganicMenuItem(L10n.Messages.menuMedia, IconName.Cards) { showMedia() })
        add(OrganicMenuItem(L10n.Safety.reportMessage, IconName.Flag) { report() })
        if (model.isBlocked) {
            add(OrganicMenuItem(L10n.Safety.unblock, IconName.Ban) {
                scope.launch {
                    other?.let { runCatching { session.safety?.unblock(it.id) } }
                    model.refreshConnection()
                }
            })
        } else {
            add(OrganicMenuItem(L10n.Safety.block, IconName.Ban, destructive = true) { block() })
        }
        add(OrganicMenuItem(L10n.Messages.menuDelete, IconName.Trash, destructive = true) { delete() })
    }
}

// Bar

/**
 * The thread's bar, over the messages: back, the person (their face and pen name, a tap goes to
 * their page) and the ⋯ — edged by the header's wavy pen line like every pushed page's, half ink
 * at rest and full once messages scroll under it. Search takes the person's place with its field
 * (and, once a match was chosen, "3/12" and the way through them).
 */
@Composable
private fun ThreadBar(
    model: ThreadModel,
    handle: String,
    searching: Boolean,
    query: String,
    showResults: Boolean,
    currentHit: String?,
    searchFocus: FocusRequester,
    scrolled: Boolean,
    onQuery: (String) -> Unit,
    onShowResults: () -> Unit,
    onPick: (SearchHit) -> Unit,
    onCloseSearch: () -> Unit,
    menu: List<OrganicMenuItem>,
    open: (Route) -> Unit,
    back: () -> Unit,
) {
    if (model.phase != ThreadModel.Phase.Ready) {
        OrganicInlineBar(L10n.Messages.back, back)
        return
    }
    val pair = model.pairId
    OrganicInlineBar(
        L10n.Messages.back, back,
        scrolled = scrolled,
        showBack = !searching,
        leading = {
            if (searching) {
                SearchField(query, onQuery, searchFocus, onFocus = onShowResults, onSearch = onShowResults)
                val hits = model.searchHits
                val at = currentHit?.let { id -> hits.indexOfFirst { it.messageId == id } } ?: -1
                if (at >= 0 && !showResults) {
                    SearchSteps(
                        position = at + 1, count = hits.size,
                        canGoOlder = at + 1 < hits.size, canGoNewer = at > 0,
                        onOlder = { onPick(hits[at + 1]) }, onNewer = { onPick(hits[at - 1]) },
                    )
                }
            } else {
                model.other?.let { other ->
                    Row(
                        Modifier
                            .weight(1f, fill = false)
                            .plainClickable(role = Role.Button, onClickLabel = L10n.Messages.viewProfile) { open(Route.Author(other.handle)) },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        HandDrawnAvatar(other.initials, other.avatarUrl, OklchColor.parse(other.accentColor) ?: Tokens.TerracottaLight, 36.dp, seedOr(other.avatarSeed, 3.0))
                        BasicText(
                            other.handle, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            style = AppFonts.heading(18f, 700, lineHeight = 1.2f),
                            modifier = Modifier.weight(1f, fill = false).semantics { heading() },
                        )
                    }
                }
            }
        },
        trailing = {
            if (searching) {
                OrganicIconButton(IconName.Close, L10n.Messages.searchClose, size = 16.dp, onClick = onCloseSearch)
            } else if (model.conversationExists && pair != null) {
                // A bare glyph; its 48 hit box is the bar's own end margin.
                OrganicMenu(menu, L10n.Messages.moreMenu, seed = seedFromString(pair).toDouble(), triggerSize = 34.dp, trigger = MenuTrigger.Bare)
            }
        },
    )
}

// Labels

/** The day label: 9月29日 / September 29. */
internal fun dayLabel(date: Date): String {
    val pattern = if (Strings.language == Strings.Language.ZhTW) "M月d日" else "MMMM d"
    return date.toInstant().atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern(pattern, Strings.language.locale))
}

/** The time label inside a day: 下午 3:04 / 3:04 PM. */
internal fun timeLabel(date: Date): String {
    val pattern = if (Strings.language == Strings.Language.ZhTW) "a h:mm" else "h:mm a"
    return date.toInstant().atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern(pattern, Strings.language.locale))
}

/** The full time a long-press shows (the web's hover title): 9月29日 下午03:04 / September 29 at 03:04 PM. */
internal fun fullTime(date: Date): String {
    val pattern = if (Strings.language == Strings.Language.ZhTW) "M月d日 ahh:mm" else "MMMM d 'at' hh:mm a"
    return date.toInstant().atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern(pattern, Strings.language.locale))
}

// Cards & links

/** "Cards & links": everything shared in the loaded messages. */
@Composable
private fun SharedMediaContent(model: ThreadModel, opener: LinkOpener, onClose: () -> Unit, open: (Route) -> Unit) {
    val (cardIds, links) = model.shared
    val cards = cardIds.mapNotNull { model.cards[it] }
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
                            .plainClickable(role = Role.Button) { model.openLink(url, opener, open) }
                            .padding(vertical = 10.dp, horizontal = 4.dp),
                    )
                }
            }
        }
        // Nothing to choose here, only to look through: the way out is under the list.
        ModalCloseButton(L10n.Safety.Report.close, onClose, Modifier.padding(top = 14.dp))
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

/** The widest the composer runs in a wide thread pane. */
private val ComposerMax = 720.dp
