package com.resonance.app.ui

import androidx.compose.animation.core.animate
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
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.FeedCard
import com.resonance.design.AppFonts
import com.resonance.design.BrandBarHeight
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
import com.resonance.design.fade
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.reading.RefreshFailure
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * StoryCard's fields (lib/adapters/story.ts cardToStory); anonymous cards get
 * the dot byline. The recommender's reason is left out on purpose: the web
 * never explains a pick (home/page.tsx), so the card's margin-note slot stays
 * empty everywhere.
 */
fun FeedCard.story(): StoryCardContent {
    val a = author
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
fun LazyListScope.storyCards(cards: List<FeedCard>, open: (Route) -> Unit, onLast: (() -> Unit)? = null) {
    itemsIndexed(cards, key = { _, c -> c.id }) { i, card ->
        StoryCard(card.story(), i, i == cards.lastIndex, Modifier.plainClickable { open(Route.Card(card.routeKey, card)) })
        if (i == cards.lastIndex) onLast?.invoke()
    }
}

/**
 * A refresh by hand that brought nothing back, said quietly over what stayed on screen (never the
 * page's load error): a muted line, centred, tucked under the heading above it, gone with the next
 * answer — iOS's RefreshNote. TalkBack hears it from [announce], wherever the list is scrolled.
 */
fun LazyListScope.refreshNote(failure: RefreshFailure?) {
    if (failure == null) return
    item(key = "refresh-note") {
        BasicText(
            failure.message,
            style = AppFonts.body(13f, lineHeight = 1.6f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
            modifier = Modifier
                .animateItem()
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, bottom = 24.dp)
                .layout { measurable, constraints ->
                    // 12 closer to what is above it than the list's own gap (iOS's −12).
                    val placeable = measurable.measure(constraints)
                    val tuck = 12.dp.roundToPx()
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
    itemsIndexed(cards, key = { _, c -> "$keyPrefix${c.id}" }) { i, card ->
        MiniStoryCard(card.story(), i, i == cards.lastIndex, Modifier.plainClickable { open(Route.Card(card.routeKey, card)) })
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
 * The feed keeps the brand in the bar and puts its title and lede in the page.
 * The other tabs (`titleInBar`) have no title block: the title takes the
 * brand's place in the bar, with the wave mark before it and `trailing` at the
 * bar's end, and the list starts a little under the bar's line.
 *
 * With [onRefresh], the list can be pulled down past its top to run it: the gap
 * that opens under the bar draws the Resonance loader (SketchPullIndicator),
 * never Material's spinner — and the list offers it as a "Refresh"
 * accessibility action too (sketchPullAction).
 */
@Composable
fun TabScreen(
    title: String,
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
    content: LazyListScope.() -> Unit,
) {
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + BrandBarHeight + HeaderEdgeHeight
    val quickReturn = rememberQuickReturn(list)
    val pull = rememberSketchPull(onRefresh ?: {})
    // The pull is the outer of the two: pushing a pulled list back up is the pull's, not the bar's to slide away on.
    val pulling = Modifier.sketchPull(pull, enabled = onRefresh != null && (refreshEnabled || pull.refreshing))
    Box(Modifier.fillMaxSize().cream().then(pulling).nestedScroll(quickReturn.connection)) {
        // Without the title block, the first row still starts clear of the bar's line.
        // For whoever can't pull, the same refresh is the list's "Refresh" action (in TalkBack's Actions on any of its rows).
        val refreshAction = Modifier.sketchPullAction(pull, L10n.Native.refresh, enabled = onRefresh != null && refreshEnabled) { !list.canScrollBackward }
        LazyColumn(Modifier.fillMaxSize().pulledDown(pull).then(refreshAction), state = list, contentPadding = PaddingValues(top = if (titleInBar) top + TitledBarGap else top, bottom = 120.dp)) {
            if (!titleInBar) item {
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
        SketchPullIndicator(pull, top)
        // The bar slides up under the status bar while reading down and comes back on the way up
        // (the brand has nothing to press, so it gives the stories the room); the status bar keeps its paper.
        val bar = Modifier.offset { IntOffset(0, quickReturn.offset.roundToInt()) }
        if (titleInBar) OrganicBrandBar(list.scrolledPast20(), bar, brand = title, isHeading = true, trailing = trailing)
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
    val range = with(LocalDensity.current) { BrandBarHeight.toPx() }
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

/**
 * The web's `opacity: .5; pointer-events: none` wrapper (a Send with nothing to
 * send yet): dimmed, and touches don't reach what is under it.
 */
fun Modifier.dimmedUnless(active: Boolean): Modifier =
    if (active) this
    // fade, not alpha: alpha's layer is the box's size and would cut a hand-drawn button's wobble straight.
    else fade(0.5f).pointerInput(Unit) {
        awaitPointerEventScope {
            while (true) awaitPointerEvent(PointerEventPass.Initial).changes.forEach { it.consume() }
        }
    }
