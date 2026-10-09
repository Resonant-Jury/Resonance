package com.resonance.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import com.resonance.api.models.FeedCard
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.CardByline
import com.resonance.design.ComposerFade
import com.resonance.design.ComposerFadeHeight
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.LinkPreviewSection
import com.resonance.design.MessageBubble
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.QuoteBubble
import com.resonance.design.REPLY_OVERLAP
import com.resonance.design.SharedCardSection
import com.resonance.design.SharedCardSkeleton
import com.resonance.design.SketchLoader
import com.resonance.design.WobRectShape
import com.resonance.design.fade
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.design.seedFromId
import com.resonance.kit.chat.ChatMessage
import com.resonance.kit.chat.Delivery
import com.resonance.kit.chat.LinkPreview
import com.resonance.kit.chat.Linkify
import com.resonance.kit.chat.Carried
import com.resonance.kit.chat.words
import com.resonance.kit.chat.ThreadRow
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.abs
import kotlin.math.max
import kotlinx.coroutines.launch

/**
 * The thread's list: the messages newest at the bottom, stacked in runs the way Messenger stacks
 * them — their face beside the last of each of their runs — with the day and time labels, the
 * quotes replies lie over, links' previews and shared cards inside their bubbles, the lines under
 * messages that are on their way or didn't go, and — at the top — older messages as they are
 * read in. A reversed list: the bottom is where it starts, and what is read in above never moves
 * what is on screen.
 */

/** Everything a row of the thread needs from the screen around it. */
internal class ThreadContext(
    val model: ThreadModel,
    /** A bubble's widest: 72% of the row (their face's column not counted), as on the web and iOS. */
    val rowMax: Dp,
    val opener: LinkOpener,
    val open: (Route) -> Unit,
    /** The matches of the search being looked at, by message id; none when not looking. */
    val highlights: Map<String, List<IntRange>>,
    /** The message id of the hit being looked at. */
    val currentHit: String?,
    val flash: Flash,
    val scroll: ThreadScroll,
    val onMenu: (MessageMenu) -> Unit,
    val onReply: (ChatMessage) -> Unit,
    /** The quote of a reply was tapped: the id of the message it quotes. */
    val onQuote: (String) -> Unit,
    /** The key of the message the long-press menu has lifted out of the thread: its place stays empty under the scrim. */
    val lifted: String? = null,
) {
    /** A link in a message was tapped ([openLink]). */
    fun tapLink(url: String) = model.openLink(url, opener, open)
}

/**
 * Where a link in the thread leads, however it was reached — tapped in a bubble, its preview, the
 * long-press menu's Open link, Cards & links: a card of this site opens in the app ([open]), as the
 * signed-in reader sees it; anything else by the link rules ([LinkOpener]).
 */
internal fun ThreadModel.openLink(url: String, opener: LinkOpener, open: (Route) -> Unit) {
    val key = cardKeyOf(url)
    if (key != null) open(Route.Card(key, cards[key])) else opener.tap(url)
}

/** The message the thread just jumped to from a reply's quote pulses once. */
internal class Flash {
    var key by mutableStateOf<String?>(null)
        private set
    var token by mutableIntStateOf(0)
        private set

    fun pulse(key: String) {
        this.key = key
        token++
    }
}

/** A message pressed and held: the row, where its bubble is on the screen, and the link under the finger. */
internal class MessageMenu(val row: ThreadRow, val bounds: Rect, val link: String?)

/** Scrolls the thread to a message. */
internal class ThreadScroll(val list: LazyListState, private val rows: () -> List<ThreadRow>, private val topInset: () -> Int) {
    /** Where each message on screen is (by id and by key), for the ones the list has composed. */
    private val cores = HashMap<String, () -> LayoutCoordinates?>()
    /** The list's own box, to know the middle of what the person can see. */
    var area: LayoutCoordinates? = null

    fun register(message: ChatMessage, where: () -> LayoutCoordinates?) {
        cores[message.id] = where
        cores[message.key] = where
    }

    fun forget(message: ChatMessage) {
        cores.remove(message.id)
        cores.remove(message.key)
    }

    /** The index of a message in the reversed list, by id or key. */
    fun indexOf(id: String): Int = rows().asReversed().indexOfFirst { it.message.id == id || it.message.key == id }

    /**
     * Brings the message to the middle of what the person can see (between the bar and the composer);
     * false when the thread doesn't hold it. A message just read in reaches the list a frame or two
     * later, so this waits for it.
     */
    suspend fun reveal(id: String): Boolean {
        val index = withTimeoutOrNull(1500) { snapshotFlow { indexOf(id) }.first { it >= 0 } } ?: return false
        withFrameNanos { }
        // To the bottom edge, where it is composed; then its bubble is moved to the middle.
        list.scrollToItem(index)
        withFrameNanos { }
        val core = cores[id]?.invoke()?.takeIf { it.isAttached }
        val box = area?.takeIf { it.isAttached }
        if (core != null && box != null) {
            val bounds = core.boundsInRoot()
            val seen = box.boundsInRoot()
            val middle = (seen.top + topInset() + seen.bottom) / 2f
            val move = middle - (bounds.top + bounds.bottom) / 2f
            if (abs(move) > 1f) list.scrollBy(move)
        }
        return true
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun MessageList(
    rows: List<ThreadRow>,
    ctx: ThreadContext,
    list: LazyListState,
    top: Dp,
    modifier: Modifier = Modifier,
    /** The floating pill (new messages, back to the latest) is for the list alone, not under search results. */
    pillVisible: Boolean = true,
    /** An empty thread says so — not where the foot already says why nothing can be written. */
    sayEmpty: Boolean = true,
) {
    val model = ctx.model
    val newestFirst = remember(rows) { rows.asReversed() }
    val quiet = when {
        // Not "no messages yet" when they couldn't be read.
        model.threadReady && model.messages.isEmpty() && model.listenFailed -> L10n.Native.loadError
        model.threadReady && model.messages.isEmpty() && sayEmpty -> L10n.Messages.noMessagesYet
        else -> null
    }
    val density = LocalDensity.current
    val near = with(density) { 120.dp.toPx() }
    val atBottom by remember(list, near) { derivedStateOf { list.firstVisibleItemIndex == 0 && list.firstVisibleItemScrollOffset <= near } }
    val farUp by remember(list) { derivedStateOf { list.firstVisibleItemIndex >= FAR_UP_ITEMS } }
    // Read in the composition that sees the new message, before the list has moved to keep its place.
    val wasAtBottom = atBottom
    val newest = rows.lastOrNull()?.message
    var unseen by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(newest?.key) {
        newest ?: return@LaunchedEffect
        when {
            // What you send always brings you to the bottom; so does anything that arrives while you are there.
            model.isMine(newest) || wasAtBottom -> list.animateScrollToItem(0)
            else -> unseen++
        }
    }
    LaunchedEffect(atBottom) { if (atBottom) unseen = 0 }
    // Scrolled up to within a few messages of the oldest held: the next page of older ones is read.
    LaunchedEffect(model, list) {
        snapshotFlow { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1 }.collect { last ->
            if (last >= 0 && last >= list.layoutInfo.totalItemsCount - OLDER_AHEAD) model.loadOlder()
        }
    }
    Box(modifier.onGloballyPositioned { ctx.scroll.area = it }) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = list,
            reverseLayout = true,
            // The latest message rests clear of the composer's soft edge; only what scrolls under it fades.
            contentPadding = PaddingValues(top = top + 4.dp, bottom = 10.dp + ComposerFadeHeight, start = 16.dp, end = 16.dp),
        ) {
            // The key a row had while it was sending is the one its document comes under, so it doesn't jump.
            itemsIndexed(newestFirst, key = { _, r -> r.message.key }) { i, row ->
                val gap = rowGap(labelled = row.dayLabel || row.timeLabel, joinsAbove = row.joinsAbove, quoted = row.message.replyTo != null || row.message.isNote)
                // A run still on its way says so once, under its newest message: the stack stays one stack.
                val sendingBelow = row.position.joinsBelow && newestFirst.getOrNull(i - 1)?.message?.delivery == Delivery.Sending
                Column(Modifier.padding(top = gap)) {
                    if (row.dayLabel) Label(dayLabel(row.message.sentAt))
                    else if (row.timeLabel) Label(timeLabel(row.message.sentAt))
                    MessageItem(row, ctx, deliveryLine = !sendingBelow)
                }
            }
            if (quiet != null) item(key = "quiet") { QuietNote(quiet) }
            else if (model.threadReady && rows.isNotEmpty()) item(key = "older") { OlderRow(model) }
        }
        // Where the thread meets the composer it dissolves into the paper instead of ending on a cut;
        // the pill (and anything laid over the thread) stays above it.
        ComposerFade(Modifier.align(Alignment.BottomCenter))
        AnimatedVisibility(
            visible = pillVisible && (unseen > 0 || farUp) && !atBottom,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp),
            enter = fadeIn(tween(160)) + scaleIn(tween(160), initialScale = 0.9f),
            exit = fadeOut(tween(120)) + scaleOut(tween(120), targetScale = 0.9f),
        ) {
            JumpPill(if (unseen > 0) L10n.Messages.newMessages else L10n.Messages.jumpToLatest) {
                unseen = 0
                scope.launch { list.animateScrollToItem(0) }
            }
        }
    }
}

/** How far up the thread is scrolled (in messages) before "latest messages" offers the way back down. */
private const val FAR_UP_ITEMS = 6

/** How close to the oldest message held the list comes before the next page is read. */
private const val OLDER_AHEAD = 6

private val RUN_GAP = 2.dp
private val BETWEEN_RUNS = 12.dp
private val BEFORE_QUOTED_RUN = 18.dp

/**
 * The air over a row: none under a day or time label (it brings its own); inside a run the bubbles
 * nearly touch; between runs it is wide — a little wider over a run that leads with what it answers
 * (a reply's quote, a note's card), where a caption once stood, so the quote never reads as the foot
 * of the run above (the web's `data-quoted`).
 */
internal fun rowGap(labelled: Boolean, joinsAbove: Boolean, quoted: Boolean): Dp = when {
    labelled -> 0.dp
    joinsAbove -> RUN_GAP
    quoted -> BEFORE_QUOTED_RUN
    else -> BETWEEN_RUNS
}

/** Their face beside their messages: the column every one of their bubbles is indented by. */
private val FACE = 28.dp
private val FACE_GAP = 8.dp

/** A day or time label between messages. */
@Composable
private fun Label(text: String) {
    BasicText(
        text,
        style = AppFonts.body(11.5f, lineHeight = 1.3f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 6.dp),
    )
}

@Composable
private fun QuietNote(text: String) {
    BasicText(text, style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted), modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
}

/** Above the oldest message: the next page being read, a read that failed, or the start of the conversation. */
@Composable
private fun OlderRow(model: ThreadModel) {
    Column(Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val note = AppFonts.body(12f, lineHeight = 1.4f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center)
        when {
            model.loadingOlder -> {
                SketchLoader(22.dp)
                BasicText(L10n.Messages.loadingOlder, style = note)
            }
            model.olderError -> {
                BasicText(L10n.Messages.loadOlderError, style = note)
                OrganicButton(L10n.Native.retry, variant = ButtonVariant.Tonal, small = true) { model.loadOlder() }
            }
            !model.hasOlder -> BasicText(L10n.Messages.beginning, style = note)
        }
    }
}

/** The small pill over the composer: the way back to the latest message. */
@Composable
private fun JumpPill(text: String, onClick: () -> Unit) {
    Box(
        Modifier
            .drawWithCache {
                val o = WobRectShape(18.0, 41.0, mag = 1.2).createOutline(size, layoutDirection, this)
                onDrawBehind {
                    drawOutline(o, Tokens.Cream)
                    drawOutline(o, Tokens.TerracottaLight, alpha = 0.9f)
                }
            }
            .plainClickable(role = Role.Button, onClickLabel = text, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OrganicIcon(IconName.ChevronDown, size = 14.dp, color = Tokens.TerracottaInk)
            BasicText(text, style = AppFonts.body(12.5f, 600, lineHeight = 1.3f, color = Tokens.TerracottaInk))
        }
    }
}

// One message

/**
 * One message on its side of the thread: on theirs, their face beside the last bubble of each run
 * (and the column it stands in beside every one of theirs); the quote it answers over it, its
 * bubble — carrying a link's preview or a shared card — and a line if it is still on its way or
 * didn't go ([deliveryLine]: not when the next in its run is on its way too). Dragged toward the
 * middle it asks to be replied to.
 */
@Composable
private fun MessageItem(row: ThreadRow, ctx: ThreadContext, deliveryLine: Boolean) {
    val message = row.message
    val model = ctx.model
    // A card the viewer can't see, carried alone: nothing to draw (not even a face beside it).
    if (model.carried(message) == Carried.Nothing) return
    val mine = model.isMine(message)
    SwipeToReply(enabled = message.canReply && model.foot.composes, mine = mine, onReply = { ctx.onReply(message) }) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
            verticalAlignment = Alignment.Bottom,
        ) {
            if (!mine) TheirFace(shown = !row.position.joinsBelow, ctx)
            Column(Modifier.widthIn(max = ctx.rowMax), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
                MessageCore(row, ctx, interactive = true)
                if (deliveryLine) DeliveryLine(message, model)
            }
        }
    }
}

/**
 * Their face, bottom-aligned beside the last bubble of their run ([shown]); else the empty column. A
 * tap goes to their page; a screen reader names whose it is (the face itself says nothing).
 */
@Composable
private fun TheirFace(shown: Boolean, ctx: ThreadContext) {
    Box(Modifier.padding(end = FACE_GAP).size(FACE)) {
        val other = ctx.model.other
        if (shown && other != null) {
            Box(
                Modifier
                    .plainClickable(role = Role.Button, onClickLabel = L10n.Messages.viewProfile) { ctx.open(Route.Author(other.handle)) }
                    .semantics { contentDescription = other.handle },
            ) {
                HandDrawnAvatar(other.initials, other.avatarUrl, OklchColor.parse(other.accentColor) ?: Tokens.TerracottaLight, FACE, seedOr(other.avatarSeed, 3.0))
            }
        }
    }
}

/** What [message]'s bubble carries besides its words ([Carried.of], with what this thread has read of shared cards). */
internal fun ThreadModel.carried(message: ChatMessage): Carried = Carried.of(message, sharedCard(message), cards, cardsLoading)

/** A bubble carrying a link's preview is this wide (or the row's widest); one carrying a card, [CARD_WIDTH]. */
private val PREVIEW_WIDTH = 280.dp
private val CARD_WIDTH = 300.dp

/**
 * Who answered whom, said only to a screen reader: one to one it goes without saying on screen
 * (Resonance has no group chats), so the line over a reply's quote is gone — its words are read out
 * before the quote instead.
 */
internal fun replySpoken(mine: Boolean, quotedMine: Boolean, handle: String): String = when {
    mine && quotedMine -> L10n.Messages.youRepliedToYourself
    mine -> L10n.Messages.youRepliedTo(handle)
    quotedMine -> L10n.Messages.repliedToYou(handle)
    else -> L10n.Messages.repliedToThemselves(handle)
}

/** That a note answers a card (always the recipient's), said only to a screen reader, before the card. */
internal fun noteSpoken(mine: Boolean, handle: String): String =
    if (mine) L10n.Messages.youLeftNote(handle) else L10n.Messages.noteOnYourCard(handle)

/** The message a reply quotes, which the reply's bubble lies over; tapping it goes to the original. */
@Composable
private fun ReplyQuoteView(message: ChatMessage, mine: Boolean, ctx: ThreadContext, interactive: Boolean) {
    val quote = message.replyTo ?: return
    val model = ctx.model
    val spoken = replySpoken(mine, quote.senderId == model.me, model.other?.handle.orEmpty())
    Column(Modifier.semantics { contentDescription = spoken }, horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
        QuoteBubble(
            quote.text.ifEmpty { L10n.Messages.replyCard },
            seed = seedFromId(quote.id, 19),
            onClick = if (interactive) { { ctx.onQuote(quote.id) } } else null,
        )
    }
}

/**
 * A note's head (it was left on a card of the recipient's): the card itself — the shared-card
 * section on the quote's paper, which the note's own bubble lies over the foot of, as a reply lies
 * over what it quotes; that it is a note on that card is read out before it, not shown. A tap
 * opens the card. While the card is read, its plain stand-in; a card that can't be read is the
 * quote's "a card".
 */
@Composable
private fun NoteQuoteView(message: ChatMessage, mine: Boolean, carried: Carried, ctx: ThreadContext, interactive: Boolean, press: (String?) -> Unit) {
    // The card is always the recipient's: theirs when I left the note, mine when they did.
    val spoken = noteSpoken(mine, ctx.model.other?.handle.orEmpty())
    val seed = seedFromId(message.key, 19)
    val width = min(CARD_WIDTH, ctx.rowMax)
    Column(Modifier.semantics { contentDescription = spoken }, horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
        when (carried) {
            is Carried.Card -> MessageBubble(
                "", mine, seed, fill = Tokens.BubbleQuote, width = width,
                onLongPress = if (interactive) { _ -> press(null) } else null,
            ) {
                CardPart(carried.card, ctx, interactive, press)
                Spacer(Modifier.height(REPLY_OVERLAP))
            }
            is Carried.CardLoading -> MessageBubble("", mine, seed, fill = Tokens.BubbleQuote, width = width, plain = true) {
                SharedCardSkeleton()
                Spacer(Modifier.height(REPLY_OVERLAP))
            }
            else -> QuoteBubble(L10n.Messages.replyCard, seed = seed)
        }
    }
}

/**
 * The message itself — the quote it answers and its bubble with all it carries — which a long-press
 * lifts: drawn again, without gestures, by the menu.
 */
@Composable
internal fun MessageCore(row: ThreadRow, ctx: ThreadContext, interactive: Boolean, modifier: Modifier = Modifier) {
    val message = row.message
    val model = ctx.model
    val mine = model.isMine(message)
    val carried = model.carried(message)
    if (carried == Carried.Nothing) return
    // A note's card goes over it, as what it answers; its own bubble carries only its words.
    val carries = if (message.isNote) Carried.Words else carried
    val haptic = LocalHapticFeedback.current
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val words = carried.words(message)
    val links = remember(words) { Linkify.find(words) }
    val ranges = remember(links) { links.map { it.range } }
    val flash = ctx.flash
    val pulse = remember(message.key) { Animatable(0f) }
    LaunchedEffect(flash.token) {
        if (interactive && flash.token > 0 && flash.key == message.key) {
            pulse.snapTo(0f)
            pulse.animateTo(1f, tween(140))
            pulse.animateTo(0f, tween(760))
        }
    }
    if (interactive) DisposableEffect(message.id, message.key) {
        ctx.scroll.register(message) { coords }
        onDispose { ctx.scroll.forget(message) }
    }
    val press: (String?) -> Unit = { link ->
        coords?.takeIf { it.isAttached }?.let {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            ctx.onMenu(MessageMenu(row, it.boundsInRoot(), link))
        }
    }
    Column(
        modifier
            .then(if (message.delivery == Delivery.Failed) Modifier.fade(0.6f) else Modifier)
            // Lifted into the menu's layer, it isn't left behind under the scrim (a ghost a step off the copy).
            .then(if (interactive && ctx.lifted == message.key) Modifier.graphicsLayer { alpha = 0f } else Modifier)
            .onGloballyPositioned { coords = it },
        horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
    ) {
        if (message.isNote) NoteQuoteView(message, mine, carried, ctx, interactive, press)
        else if (message.replyTo != null) ReplyQuoteView(message, mine, ctx, interactive)
        MessageBubble(
            words, mine, seedFromId(message.key),
            // The reply lies over the foot of what it quotes, a note over the card it was left on.
            modifier = if (message.replyTo != null || message.isNote) Modifier.overlapAbove(REPLY_OVERLAP) else Modifier,
            quoteLabel = if (message.noteRef == null) null else L10n.Messages.quotedNote,
            run = row.position,
            links = ranges,
            highlights = if (words == message.text) ctx.highlights[message.id].orEmpty() else emptyList(),
            highlightStrong = message.id == ctx.currentHit,
            // A search hit in words the bubble doesn't show (a card's link, standing for the card) washes the whole bubble.
            flash = if (words != message.text && message.id == ctx.currentHit) { { max(pulse.value, 0.5f) } } else { { pulse.value } },
            width = when (carries) {
                is Carried.Preview -> min(PREVIEW_WIDTH, ctx.rowMax)
                is Carried.Card, is Carried.CardLoading -> min(CARD_WIDTH, ctx.rowMax)
                else -> null
            },
            plain = carries is Carried.CardLoading,
            onLinkTap = if (interactive) { i -> links.getOrNull(i)?.let { ctx.tapLink(it.url) } } else null,
            onLongPress = if (interactive) { i -> press(i?.let { links.getOrNull(it)?.url }) } else null,
            attachment = when (carries) {
                is Carried.Preview -> { { PreviewPart(carries.preview, afterWords = words.isNotEmpty() || message.noteRef != null, ctx, interactive, press) } }
                is Carried.Card -> { { CardPart(carries.card, ctx, interactive, press) } }
                is Carried.CardLoading -> { { SharedCardSkeleton() } }
                else -> null
            },
        )
    }
}

/** A link's preview inside its bubble: a tap opens the link (by the link rules), a hold is the menu with the link's own rows. */
@Composable
private fun ColumnScope.PreviewPart(
    preview: LinkPreview,
    afterWords: Boolean,
    ctx: ThreadContext,
    interactive: Boolean,
    press: (String?) -> Unit,
) {
    LinkPreviewSection(
        preview.title, preview.description, Linkify.displayHost(preview.url) ?: preview.url, preview.imageUrl, afterWords,
        onClick = if (interactive) { { ctx.tapLink(preview.url) } } else null,
        onLongPress = if (interactive) { { press(preview.url) } } else null,
    )
}

/** A shared card inside its bubble: a tap opens its page in the app. */
@Composable
private fun ColumnScope.CardPart(card: FeedCard, ctx: ThreadContext, interactive: Boolean, press: (String?) -> Unit) {
    val author = card.author?.takeIf { !card.anonymous }
    SharedCardSection(
        byline = if (author != null) CardByline(author.handle, author.initials, author.avatarUrl, author.accent(), author.avatarSeedValue())
        else CardByline.anonymous(L10n.Card.anonymousAuthor),
        readTime = L10n.App.readMinutes(card.readMinutes),
        title = card.title,
        excerpt = card.excerpt,
        imageUrl = card.imageUrl,
        accentHue = card.accentHue,
        source = L10n.Messages.cardSource,
        onClick = if (interactive) { { ctx.open(Route.Card(card.routeKey, card)) } } else null,
        onLongPress = if (interactive) { { press(null) } } else null,
    )
}

/** The line under a message on its way or one that didn't go (its bubble above is dimmed). */
@Composable
private fun DeliveryLine(message: ChatMessage, model: ThreadModel) {
    when (message.delivery) {
        Delivery.Failed -> BasicText(
            L10n.Messages.sendFailed,
            style = AppFonts.body(11.5f, lineHeight = 1.3f, color = Tokens.Terracotta),
            modifier = Modifier.padding(top = 4.dp).padding(horizontal = 4.dp).plainClickable(role = Role.Button, onClickLabel = L10n.Messages.retry) { model.retry(message.key) },
        )
        Delivery.Sending -> {
            // Most sends are over before anyone looks; the line is for the ones that take a moment.
            val slow by produceState(false, message.key) {
                delay(SLOW_SEND_MILLIS)
                value = true
            }
            if (slow) BasicText(
                L10n.Messages.sending,
                style = AppFonts.body(11.5f, lineHeight = 1.3f, color = Tokens.TextMuted),
                modifier = Modifier.padding(top = 4.dp).padding(horizontal = 4.dp),
            )
        }
        else -> Unit
    }
}

private const val SLOW_SEND_MILLIS = 1000L

/** The row sits `by` closer to what is above it: the bubble that answers lies over the foot of the quote. */
private fun Modifier.overlapAbove(by: Dp): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)
    val up = by.roundToPx()
    layout(placeable.width, (placeable.height - up).coerceAtLeast(0)) { placeable.place(0, -up) }
}

// Swipe to reply

/**
 * Drag a message toward the middle of the screen (theirs to the right, yours to the left) and the
 * reply glyph grows in behind it; past [SWIPE_REPLY_DP] a tick says it will take, and letting go
 * replies. It always springs back. A horizontal drag only, so scrolling the thread is not fought.
 */
@Composable
private fun SwipeToReply(enabled: Boolean, mine: Boolean, onReply: () -> Unit, content: @Composable () -> Unit) {
    val density = LocalDensity.current
    val threshold = with(density) { SWIPE_REPLY_DP.dp.toPx() }
    val farthest = threshold * 2.4f
    var pulled by remember { mutableFloatStateOf(0f) }
    var ticked by remember { mutableStateOf(false) }
    val haptic = LocalHapticFeedback.current
    val state = rememberDraggableState { delta ->
        pulled = (pulled + if (mine) -delta else delta).coerceIn(0f, farthest)
        val past = pulled >= threshold
        if (past != ticked) {
            ticked = past
            if (past) haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
        }
    }
    // Past the threshold the message gives, but with resistance.
    val shown = if (pulled <= threshold) pulled else threshold + (pulled - threshold) * 0.3f
    Box(
        Modifier
            .fillMaxWidth()
            .draggable(
                state, Orientation.Horizontal, enabled = enabled,
                onDragStopped = {
                    val replied = pulled >= threshold
                    ticked = false
                    if (replied) onReply()
                    animate(pulled, 0f, animationSpec = spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMedium)) { v, _ -> pulled = v }
                },
            ),
    ) {
        if (pulled > 0f) {
            val progress = (pulled / threshold).coerceIn(0f, 1f)
            Box(
                Modifier
                    .align(if (mine) Alignment.CenterEnd else Alignment.CenterStart)
                    .padding(horizontal = 6.dp)
                    .graphicsLayer { alpha = progress; scaleX = 0.6f + 0.4f * progress; scaleY = scaleX }
                    .semantics { contentDescription = L10n.Messages.reply },
            ) { OrganicIcon(IconName.Reply, size = 20.dp, color = if (progress >= 1f) Tokens.Terracotta else Tokens.TextMuted) }
        }
        Box(Modifier.offset { IntOffset((if (mine) -shown else shown).toInt(), 0) }) { content() }
    }
}

/** How far a message is dragged before letting go replies. */
private const val SWIPE_REPLY_DP = 56
