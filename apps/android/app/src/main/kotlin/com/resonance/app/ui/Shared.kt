package com.resonance.app.ui

import androidx.compose.animation.core.animate
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import com.resonance.design.BorderedStoryCard
import com.resonance.design.CardListLayout
import com.resonance.design.CardPalette
import com.resonance.design.GridBlockRows
import com.resonance.design.GridUnderBar
import com.resonance.design.LocalWindowLayout
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.IntOffset
import kotlin.math.roundToInt
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.style.TextAlign
import android.view.View
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.FeedCard
import com.resonance.design.AppFonts
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.ui.graphics.Color
import com.resonance.design.LocalHeaderChrome
import com.resonance.design.brandBarHeight
import com.resonance.design.CssText
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.MiniStoryCard
import com.resonance.design.OklchColor
import com.resonance.design.OrganicBrandBar
import com.resonance.design.OrganicPageTitle
import com.resonance.design.SketchPullIndicator
import com.resonance.design.pulledDown
import com.resonance.design.rememberSketchPull
import com.resonance.design.sketchPull
import com.resonance.design.sketchPullAction
import com.resonance.design.StoryCard
import com.resonance.design.StoryCardContent
import com.resonance.design.cream
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.reading.RefreshFailure
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * StoryCard's fields (lib/adapters/story.ts cardToStory); anonymous cards get
 * the dot byline — on their author's own shelves too, where the server names
 * them: the byline everyone sees is what marks one there (design note §13).
 * The recommender's reason is left out on purpose: the web never explains a
 * pick (home/page.tsx), so the card's margin-note slot stays empty everywhere.
 */
fun FeedCard.story(): StoryCardContent {
    val a = author.takeUnless { anonymous }
    return StoryCardContent(
        id = id,
        title = title,
        excerpt = excerpt,
        authorName = a?.handle ?: L10n.Card.anonymousAuthor,
        authorInitials = a?.initials ?: "·",
        authorImageUrl = a?.avatarUrl,
        avatarSeed = a?.avatarSeedValue() ?: ((id.firstOrNull()?.code ?: 7) * 31).toDouble(),
        readTime = L10n.App.readMinutes(readMinutes),
        tags = tags,
        imageUrl = imageUrl,
        imageLabel = imageLabel ?: title.take(24),
        accentHue = accentHue,
        reason = null,
        authorAccent = a?.let { OklchColor.parse(it.accentColor) },
    )
}

/**
 * The colour family of each card of a list as it is shown (design note B3, CardPalette.palettes):
 * none shares one with the three before it, so neither neighbouring bands nor a grid's row or
 * column ever repeat one.
 */
fun cardFamilies(cards: List<FeedCard>): List<Int> = CardPalette.palettes(cards.map { it.accentHue })

/** Where the card lives on the site (its slug, or its id before it had one). */
val FeedCard.routeKey: String get() = slug ?: id

fun Author.avatarSeedValue(): Double = avatarSeed?.toDoubleOrNull() ?: ((initials.firstOrNull()?.code ?: 7) * 13).toDouble()

/** The web's `Number(avatarSeed) || fallback`: Messages draw a missing or zero seed as their own fixed one (5 in the list, 3 in a thread). */
fun seedOr(avatarSeed: String?, fallback: Double): Double = avatarSeed?.toDoubleOrNull()?.takeIf { it != 0.0 && it.isFinite() } ?: fallback
fun Author.accent() = OklchColor.parse(accentColor) ?: Tokens.TerracottaLight

/** "Sep 28" / "9月28日" in the interface language. */
fun shortDate(iso: String?): String? = iso?.let {
    runCatching { OffsetDateTime.parse(it).format(DateTimeFormatter.ofPattern(if (Strings.language == Strings.Language.ZhTW) "M月d日" else "MMM d", Strings.language.locale)) }.getOrNull()
}

fun mediumDate(iso: String?): String? = iso?.let {
    runCatching { OffsetDateTime.parse(it).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Strings.language.locale)) }.getOrNull()
}

/**
 * Cards as the web lists them on a phone: full-bleed bands, each opening its page (a plain link —
 * no press chrome), which draws the card as the list had it while it reads the rest.
 */
fun LazyListScope.storyCards(
    cards: List<FeedCard>,
    open: (Route) -> Unit,
    onLast: (() -> Unit)? = null,
    firstUnderBar: Boolean = false,
    layout: CardListLayout = CardListLayout.Phone,
) {
    if (layout.isGrid) return borderedCards(cards, open, onLast, firstUnderBar, layout)
    // No card wears the family of any of the three before it (design note B3), over the list as shown.
    val palettes = cardFamilies(cards)
    itemsIndexed(cards, key = { _, c -> c.id }) { i, card ->
        StoryCard(
            card.story(), i, i == cards.lastIndex,
            Modifier.plainClickable { open(Route.Card(card.routeKey, card)) }.pointerHoverIcon(PointerIcon.Hand),
            isFirst = firstUnderBar && i == 0, inset = layout.inset, palette = palettes[i],
        )
        if (i == cards.lastIndex) onLast?.invoke()
    }
}

/**
 * An expanded window's cards (design note §10): the web desktop's bordered cards in columns,
 * row-major — card i in column i mod n, each column stacking its own cards (CardLinkGrid) —
 * [GridBlockRows] rows to a block of the lazy list, so a long feed still composes as it scrolls.
 */
internal fun LazyListScope.borderedCards(
    cards: List<FeedCard>,
    open: (Route) -> Unit,
    onLast: (() -> Unit)?,
    firstUnderBar: Boolean,
    layout: CardListLayout,
    /** Where a card leads (its page; a draft, its writer). */
    tap: (FeedCard) -> Route = { Route.Card(it.routeKey, it) },
    /** Laid over a card's top-end corner (the owner's ⋯ on their shelves). */
    overlay: (@Composable BoxScope.(FeedCard, Int) -> Unit)? = null,
) {
    val n = layout.columns
    val blocks = cards.indices.chunked(n * GridBlockRows)
    // The same families as the list read top to bottom: row-major, so none shares one with the cards beside or above it.
    val palettes = cardFamilies(cards)
    itemsIndexed(blocks, key = { b, block -> "grid:$b:${cards[block.first()].id}" }) { b, block ->
        val gap = Tokens.FeedGap.dp
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = layout.gridInset)
                .padding(top = if (b == 0) (if (firstUnderBar) GridUnderBar else 0.dp) else gap),
            horizontalArrangement = Arrangement.spacedBy(gap),
        ) {
            for (c in 0 until n) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(gap)) {
                    for (i in block) if (i % n == c) {
                        val card = cards[i]
                        Box {
                            BorderedStoryCard(card.story(), i, Modifier.plainClickable { open(tap(card)) }, palette = palettes[i])
                            overlay?.invoke(this, card, i)
                        }
                    }
                }
            }
        }
        if (b == blocks.lastIndex) onLast?.invoke()
    }
}

/**
 * A refresh by hand that brought nothing back, said quietly over what stayed on screen (never the
 * page's load error): a muted line, centred, tucked under the heading above it, gone with the next
 * answer — iOS's RefreshNote. TalkBack hears it from [announce], wherever the list is scrolled.
 */
fun LazyListScope.refreshNote(failure: RefreshFailure?, underBar: Boolean = false) {
    if (failure == null) return
    item(key = "refresh-note") {
        BasicText(
            failure.message,
            style = AppFonts.body(13f, lineHeight = 1.6f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
            modifier = Modifier
                .animateItem()
                .fillMaxWidth()
                // The feed's list starts under the bar's wavy band: the note keeps clear of the bar instead.
                .padding(start = 20.dp, end = 20.dp, top = if (underBar) HeaderEdgeHeight + 16.dp else 0.dp, bottom = 24.dp)
                .layout { measurable, constraints ->
                    // 12 closer to what is above it than the list's own gap (iOS's −12).
                    val placeable = measurable.measure(constraints)
                    val tuck = if (underBar) 0 else 12.dp.roundToPx()
                    layout(placeable.width, (placeable.height - tuck).coerceAtLeast(0)) { placeable.place(0, -tuck) }
                },
        )
    }
}

/** Says [text] to TalkBack now (a refresh asked for away from the list's top has nothing in view to say it). */
@Suppress("DEPRECATION")
internal fun View.announce(text: String) = announceForAccessibility(text)

/** MiniCardGrid on a phone: the resonance and linked-cards lists, as pared-back bands. */
fun LazyListScope.miniCards(cards: List<FeedCard>, open: (Route) -> Unit, keyPrefix: String) {
    val palettes = cardFamilies(cards)
    itemsIndexed(cards, key = { _, c -> "$keyPrefix${c.id}" }) { i, card ->
        // Wider than a phone, the band's content keeps to the centred reading column.
        MiniStoryCard(
            card.story(), i, i == cards.lastIndex,
            Modifier.plainClickable { open(Route.Card(card.routeKey, card)) }.pointerHoverIcon(PointerIcon.Hand),
            inset = LocalWindowLayout.current.bandInset, palette = palettes[i],
        )
    }
}

/** Past the web header's 20px scroll threshold, when its pen line inks in fully. */
@Composable
fun LazyListState.scrolledPast20(): Boolean {
    val threshold = with(LocalDensity.current) { 20.dp.toPx() }
    val scrolled by remember(this, threshold) { derivedStateOf { firstVisibleItemIndex > 0 || firstVisibleItemScrollOffset > threshold } }
    return scrolled
}

/**
 * A tab's root, as a phone shows the web's app pages: the pinned bar (content
 * scrolls under it and ends on its wavy line), then the list, with room for
 * the docked tab bar.
 *
 * The feed keeps the brand in the bar and no title at all (`title` null): its
 * list starts under the bar's wavy band, so the first card's paper runs up
 * beneath the wave and the bar's pen line is that card's top edge (design note
 * §2). The other tabs (`titleInBar`) have no title block either: the title
 * takes the brand's place in the bar, with the wave mark before it and
 * `trailing` at the bar's end, and the list starts a little under the bar's
 * line. A title in the page (`title` set, not `titleInBar`) is the old
 * home heading and its lede.
 *
 * With [onRefresh], the list can be pulled down past its top to run it: the gap
 * that opens under the bar draws the Resonance loader (SketchPullIndicator),
 * never Material's spinner — and the list offers it as a "Refresh"
 * accessibility action too (sketchPullAction).
 */
@Composable
fun TabScreen(
    title: String?,
    subtitle: String? = null,
    /** The title in the bar instead of the brand (Messages, Notifications, My Card Box); no lede then. */
    titleInBar: Boolean = false,
    trailing: @Composable RowScope.() -> Unit = {},
    list: LazyListState = rememberLazyListState(),
    /** Floats over the list, under nothing but the brand bar (the feed's picks hint). */
    overlay: @Composable BoxScope.() -> Unit = {},
    /** What a pull past the list's top runs (a refresh asked for by hand), awaited while the loader is docked; null: no pull. */
    onRefresh: (suspend () -> Unit)? = null,
    /** Whether a pull may start now (not while a first read still shows its skeleton). */
    refreshEnabled: Boolean = true,
    /**
     * The paper of the band the list starts with right under the bar (the feed's first card): the gap
     * a pull opens wears it, so the band looks taller rather than parted from the bar (design note B1).
     */
    pullPaper: Color? = null,
    content: LazyListScope.() -> Unit,
) {
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + brandBarHeight() + HeaderEdgeHeight
    // Beside the header's tabs the bar carries the navigation: it stays put (design note B2).
    val pinned = LocalHeaderChrome.current != null
    val quickReturn = rememberQuickReturn(list)
    val pull = rememberSketchPull(onRefresh ?: {})
    // The pull is the outer of the two: pushing a pulled list back up is the pull's, not the bar's to slide away on.
    val pulling = Modifier.sketchPull(pull, enabled = onRefresh != null && (refreshEnabled || pull.refreshing))
    // The conversations beside a thread: the list keeps to its pane, the bar is the window's header.
    val pane = LocalListPane.current
    Box(Modifier.fillMaxSize().cream().then(pulling).then(if (pinned) Modifier else Modifier.nestedScroll(quickReturn.connection))) {
        // Without the title block, the first row still starts clear of the bar's line.
        // For whoever can't pull, the same refresh is the list's "Refresh" action (in TalkBack's Actions on any of its rows).
        val refreshAction = Modifier.sketchPullAction(pull, L10n.Native.refresh, enabled = onRefresh != null && refreshEnabled) { !list.canScrollBackward }
        val listTop = when {
            titleInBar -> top + TitledBarGap
            title == null -> top - HeaderEdgeHeight
            else -> top
        }
        // Room for the docked tab bar; with the tabs in the header, only the navigation bar's.
        val bottom = if (LocalWindowLayout.current.topTabs) WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 40.dp else 120.dp
        LazyColumn(
            Modifier.then(if (pane != null) Modifier.width(pane).fillMaxHeight() else Modifier.fillMaxSize()).pulledDown(pull).then(refreshAction),
            state = list, contentPadding = PaddingValues(top = listTop, bottom = bottom),
        ) {
            if (!titleInBar && title != null) item {
                // The web's page padding: 40 under the header, the title block 40 above the content (home's header).
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 40.dp, bottom = if (subtitle != null) 40.dp else 28.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OrganicPageTitle(title, trailing = trailing)
                    if (subtitle != null) CssText(subtitle, AppFonts.Family.Body, 15f, lineHeight = 1.6f, color = Tokens.TextMuted)
                }
            }
            content()
        }
        Box(if (pane != null) Modifier.width(pane).fillMaxHeight() else Modifier.fillMaxSize()) { SketchPullIndicator(pull, top, paper = pullPaper) }
        // The bar slides up under the status bar while reading down and comes back on the way up
        // (the brand has nothing to press, so it gives the stories the room); the status bar keeps its paper.
        val bar = if (pinned) Modifier else Modifier.offset { IntOffset(0, quickReturn.offset.roundToInt()) }
        if (titleInBar && title != null) OrganicBrandBar(list.scrolledPast20(), bar, brand = title, isHeading = true, trailing = trailing)
        else OrganicBrandBar(list.scrolledPast20(), bar)
        overlay()
        Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(Tokens.Cream))
    }
}

/** Under the bar's line to the first row, on a tab whose title is in the bar. */
private val TitledBarGap = 16.dp

/**
 * The brand bar's quick return: how far it has slid up (−bar height…0), fed by
 * the list's scrolling. A list too short to scroll keeps its bar: a drag there
 * moves nothing, so neither does the bar.
 */
class QuickReturn(private val range: Float, private val list: LazyListState) {
    var offset by mutableFloatStateOf(0f)
    val connection = object : NestedScrollConnection {
        override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
            if (!list.canScrollForward && !list.canScrollBackward) return Offset.Zero
            offset = (offset + available.y).coerceIn(-range, 0f)
            return Offset.Zero
        }
    }
}

@Composable
private fun rememberQuickReturn(list: LazyListState): QuickReturn {
    val range = with(LocalDensity.current) { brandBarHeight().toPx() }
    val q = remember(range, list) { QuickReturn(range, list) }
    // Let go half-way and it settles, shown or hidden — and it is always shown back at the top.
    LaunchedEffect(q, list.isScrollInProgress) {
        if (list.isScrollInProgress) return@LaunchedEffect
        val atTop = list.firstVisibleItemIndex == 0 && list.firstVisibleItemScrollOffset < range
        val target = if (atTop || q.offset > -range / 2) 0f else -range
        animate(q.offset, target, animationSpec = tween(180)) { v, _ -> q.offset = v }
    }
    return q
}

