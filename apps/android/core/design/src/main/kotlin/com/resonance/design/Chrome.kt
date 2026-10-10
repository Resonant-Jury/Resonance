package com.resonance.design

import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Immutable
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.platform.LocalLayoutDirection
import kotlin.math.max
import kotlin.math.roundToInt
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.draw.scale
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wavyPoints

// Navigation chrome in the hand-drawn language. The skeleton stays the
// platform's (Navigation 3 back stacks, predictive back); only the look is
// the brand's. Verified in spike S3.

data class OrganicTabItem<T>(val id: T, val title: String, val icon: IconName, val isAction: Boolean = false, val badge: Int = 0)

/** The tab bar's height above the navigation bar, without its wavy edge. */
val TabBarHeight = 60.dp

/**
 * The tab bar, docked like the header and edged the same way: cream paper
 * that begins on a wavy pen line, so the top and bottom chrome are one pair
 * and nothing floats or draws a frame. Tabs are the glyph over its label; the
 * selected one inks terracotta on a wash behind the glyph cut like torn paper
 * (wavy edges, lopsided corners, no rim). The pen sits among them as a solid
 * terracotta squircle the tabs' height — the one filled thing in the bar,
 * without a rim.
 */
@Composable
fun <T> OrganicTabBar(items: List<OrganicTabItem<T>>, selection: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    val haptic = LocalHapticFeedback.current
    Row(
        modifier
            .fillMaxWidth()
            .blocksTouches()
            .footerEdge()
            .padding(top = HeaderEdgeHeight)
            .navigationBarsPadding()
            .height(TabBarHeight)
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEachIndexed { index, item ->
            val selected = item.id == selection
            val select = {
                haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                onSelect(item.id)
            }
            val source = remember { MutableInteractionSource() }
            val pressed by source.collectIsPressedAsState()
            if (item.isAction) {
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clickable(source, indication = null, role = Role.Button, onClickLabel = item.title, onClick = select)
                        .semantics { contentDescription = item.title },
                    contentAlignment = Alignment.Center,
                ) { PenChip(pressed, item.icon) }
            } else {
                val wash by animateFloatAsState(if (selected) 1f else if (pressed) 0.5f else 0f, tween(160), label = "tabWash")
                TabFace(
                    item, index, selected, { wash },
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clickable(source, indication = null, role = Role.Tab, onClickLabel = item.title, onClick = select)
                        .semantics { this.selected = selected },
                )
            }
        }
    }
}

/**
 * A tab as the bar and the rail draw it: the glyph over its label, the selected one inked
 * terracotta on a scrap of torn paper (`wash` 0…1, read while drawing), its unread count hung
 * off the glyph's corner.
 */
@Composable
private fun <T> TabFace(item: OrganicTabItem<T>, index: Int, selected: Boolean, wash: () -> Float, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Box(
            Modifier.size(56.dp, 32.dp).drawWithCache {
                // A scrap of torn paper, not a pill: a radius well under half
                // the height, wavy long edges and lopsided corners, each tab
                // its own seed.
                val o = WobRectShape(12.0, index * 29.0 + 7, mag = 3.2, options = WobRectOptions(
                    curve = 1.2, cornerJitter = 3.6, cornerOffset = 3.0, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(1.0),
                )).createOutline(size, layoutDirection, this)
                onDrawBehind { val w = wash(); if (w > 0f) drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.55f * w)) }
            },
            contentAlignment = Alignment.Center,
        ) {
            Box {
                OrganicIcon(item.icon, size = 24.dp, color = if (selected) Tokens.Terracotta else Tokens.TextMuted)
                // NotificationBell's chip hangs off the glyph's top-right corner.
                if (item.badge > 0) CountBadge(item.badge, Modifier.align(Alignment.TopEnd).offset(x = 9.dp, y = (-8).dp))
            }
        }
        Spacer(Modifier.height(3.dp))
        BasicText(
            item.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = AppFonts.body(10.5f, if (selected) 600 else 400, lineHeight = 1.3f, color = if (selected) Tokens.Terracotta else Tokens.TextMuted),
        )
    }
}

/**
 * The header's tabs left to right (design note B2): the bar's items without the pen, each with
 * its place in the bar (the seed of its wash, as on the bar).
 */
fun <T> topTabsOrder(items: List<OrganicTabItem<T>>): List<IndexedValue<OrganicTabItem<T>>> =
    items.withIndex().filter { !it.value.isAction }

/**
 * The tab group's measures on a medium or expanded window (design note B2), apart from Compose so
 * they can be tested: an item with its label is 14 + the 20 glyph + 6 + the label + 14 wide,
 * glyph alone 48; the track holds them 2 apart, 4 in from its ends.
 */
object TopTabsFit {
    const val ICON_ITEM = 48f
    const val INSET = 4f
    const val GAP = 2f

    /** An item showing its label, [textWidth] wide at 14/600 (the selected weight, so choosing one moves nothing). */
    fun labelledItem(textWidth: Float): Float = 14f + 20f + 6f + textWidth + 14f

    /** The track's width round items this wide. */
    fun groupWidth(items: List<Float>): Float = items.sum() + 2 * INSET + GAP * (items.size - 1).coerceAtLeast(0)

    /** Labels show on an expanded window when the labelled group leaves 152 beside it each side past the pad. */
    fun labels(cls: LayoutClass, labelledGroup: Float, width: Float, pad: Float): Boolean =
        cls.tabLabels && labelledGroup <= width - 2 * (pad + 152f)

    /** The widest a bar's leading part (the brand, a title, the back arrow's title) may be: 16 short of the group. */
    fun leadingMax(width: Float, group: Float, pad: Float): Float = (width - group) / 2f - pad - 16f
}

/**
 * What the header keeps for the window's tabs and pen (design note B2), which [MainTabs] draws
 * once over every page: on a medium or expanded window a page's bar leaves the middle to the tab
 * group ([groupWidth] wide, centred on the window) and its end to the pen, so its own leading
 * part keeps to [leadingMax] and its actions end [trailingPad] in from the window's edge. Null on a
 * phone (the bottom bar) and under the writer.
 */
@Immutable
data class HeaderChrome(val width: Dp, val groupWidth: Dp, val pad: Dp, val labels: Boolean) {
    val leadingMax: Dp get() = TopTabsFit.leadingMax(width.value, groupWidth.value, pad.value).dp
    /** The pen (56) and 8 before it. */
    val trailingPad: Dp get() = pad + PenChipWidth + 8.dp
}

/** The header's chrome where the window has tabs in it; null on a phone and in the writer. */
val LocalHeaderChrome = staticCompositionLocalOf<HeaderChrome?> { null }

/** A bar's row under the status bar on a medium or expanded window (brand and inline alike), without its wavy edge. */
val TopBarRow = 56.dp

/** How tall the root bars' row is here: [TopBarRow] beside the header's tabs, a phone's [BrandBarHeight] else. */
@Composable
fun brandBarHeight(): Dp = if (LocalHeaderChrome.current != null) TopBarRow else BrandBarHeight

/** The pen chip's width. */
private val PenChipWidth = 56.dp

/** The labels' face in the header's tabs: body 14, 600 chosen / 500 not. */
private fun topTabStyle(selected: Boolean) =
    AppFonts.body(14f, if (selected) 600 else 500, lineHeight = 1.2f, color = if (selected) Tokens.Terracotta else Tokens.TextMuted)

/** Each tab's width in the header's group, labelled ([TopTabsFit.labelledItem], measured at 600) or glyph alone. */
@Composable
fun topTabWidths(titles: List<String>, labels: Boolean): List<Dp> {
    if (!labels) return titles.map { TopTabsFit.ICON_ITEM.dp }
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    return titles.map { title ->
        val px = measurer.measure(title, topTabStyle(true), maxLines = 1, softWrap = false).size.width
        TopTabsFit.labelledItem(with(density) { px.toDp() }.value).dp
    }
}

/**
 * The tab group in the middle of the header on a medium or expanded window (design note B2): the
 * bar's tabs (not the pen) side by side on one filled hand-drawn track — cream-dark at 0.7 with
 * the modal paper's grain, no pen line — each 32 tall, its glyph and (with [labels]) its label;
 * the chosen one on the bar's torn-paper wash, terracotta. A pointer lays the wash at 0.45 of
 * itself. Re-choosing the tab shown is the caller's to read (pop to its root), as on the bar.
 */
@Composable
fun <T> TopTabs(
    items: List<IndexedValue<OrganicTabItem<T>>>,
    selection: T,
    onSelect: (T) -> Unit,
    widths: List<Dp>,
    labels: Boolean,
    label: String,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current
    Row(
        modifier
            .height(40.dp)
            .drawWithCache {
                val w = size.width / density
                val o = WobRectShape(18.0, 233.0, mag = 1.2, options = WobRectOptions(
                    curve = 1.3, cornerJitter = 1.6, cornerOffset = 1.6,
                    segmentsH = SegValue.Count(max(3, (w / 80f).roundToInt()).toDouble()), segmentsV = SegValue.Count(1.0),
                )).createOutline(size, layoutDirection, this)
                val grain = Grain.brush(GrainMode.Tile, "grain-card", size, density, 0.3f)
                onDrawBehind {
                    drawOutline(o, Tokens.CreamDark.copy(alpha = 0.7f))
                    grain?.let { drawOutline(o, it, alpha = 0.3f) }
                }
            }
            .padding(horizontal = TopTabsFit.INSET.dp)
            .selectableGroup()
            .semantics { isTraversalGroup = true; contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TopTabsFit.GAP.dp),
    ) {
        items.forEachIndexed { i, (barIndex, item) ->
            val selected = item.id == selection
            val source = remember { MutableInteractionSource() }
            val pressed by source.collectIsPressedAsState()
            val hovered by source.collectIsHoveredAsState()
            val wash by animateFloatAsState(
                if (selected) 1f else if (pressed) 0.5f else if (hovered) TOP_HOVER_WASH else 0f, tween(160), label = "topTabWash",
            )
            val itemWidth = widths.getOrElse(i) { TopTabsFit.ICON_ITEM.dp }
            val ink = if (selected) Tokens.Terracotta else Tokens.TextMuted
            Box(
                Modifier
                    .size(itemWidth, 32.dp)
                    .hoverable(source)
                    .pointerHoverIcon(PointerIcon.Hand)
                    .clickable(source, indication = null, role = Role.Tab, onClickLabel = item.title) {
                        haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                        onSelect(item.id)
                    }
                    .semantics {
                        this.selected = selected
                        if (!labels) contentDescription = item.title
                    }
                    .drawWithCache {
                        // The bar's scrap of torn paper, fitted to the item (its seed: the item's place in the bar).
                        val o = WobRectShape(12.0, barIndex * 29.0 + 7, mag = 3.2, options = WobRectOptions(
                            curve = 1.2, cornerJitter = 3.6, cornerOffset = 3.0,
                            segmentsH = SegValue.Count(if (itemWidth.value > 90f) 3.0 else 2.0), segmentsV = SegValue.Count(1.0),
                        )).createOutline(size, layoutDirection, this)
                        onDrawBehind { val w = wash; if (w > 0f) drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.55f * w)) }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box {
                        OrganicIcon(item.icon, size = if (labels) 20.dp else 22.dp, color = ink)
                        if (item.badge > 0) CountBadge(item.badge, Modifier.align(Alignment.TopEnd).offset(x = 8.dp, y = (-7).dp))
                    }
                    if (labels) {
                        Spacer(Modifier.width(6.dp))
                        BasicText(item.title, maxLines = 1, softWrap = false, style = topTabStyle(selected), modifier = Modifier.clearAndSetSemantics { })
                    }
                }
            }
        }
    }
}

/** A pointer over a header tab: the wash at 0.45 of the chosen one's. */
private const val TOP_HOVER_WASH = 0.45f

/** The pen at the header's end (design note B2): the bar's pen chip, opening the writer. */
@Composable
fun TopPen(label: String, icon: IconName, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val haptic = LocalHapticFeedback.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier
            .size(PenChipWidth, 40.dp)
            .hoverable(source)
            .pointerHoverIcon(PointerIcon.Hand)
            .clickable(source, indication = null, role = Role.Button, onClickLabel = label) {
                haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                onClick()
            }
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { PenChip(pressed, icon) }
}

/** The pen in the tab bar: a solid terracotta squircle as tall as a tab, the nib in cream; it darkens while pressed. */
@Composable
private fun PenChip(pressed: Boolean, icon: IconName) {
    Box(
        Modifier
            .size(56.dp, 40.dp)
            .scale(if (pressed) 0.96f else 1f)
            .drawWithCache {
                val o = WobRectShape(17.0, 3.0, mag = 1.1, options = WobRectOptions(
                    curve = 1.3, cornerJitter = 3.0, cornerOffset = 2.4, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
                )).createOutline(size, layoutDirection, this)
                val grain = Grain.brush(GrainMode.Tile, "grain-button", size, density, 0.38f)
                onDrawBehind {
                    // The verb's face (--button-fill): the pen chip is the write button.
                    drawOutline(o, Mixes.ButtonFill)
                    grain?.let { drawOutline(o, it, alpha = 0.38f) }
                    if (pressed) drawOutline(o, OrganicIndication.OnFill)
                }
            },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(icon, size = 22.dp, color = Tokens.Cream) }
}

/**
 * NotificationBell's unread count: a wobbly terracotta chip (19×18, 26 wide
 * past 9) in the avatar's lopsided language, the number in cream 10/700.
 */
@Composable
fun CountBadge(count: Int, modifier: Modifier = Modifier) {
    val w = if (count > 9) 26.dp else 19.dp
    Box(
        modifier
            .size(w, 18.dp)
            .clearAndSetSemantics { }
            .drawWithCache {
                val o = WobRectShape(18 * 0.4, 9.0, mag = 1.3, options = WobRectOptions(
                    curve = 1.5, cornerJitter = 3.0, cornerOffset = 18 * 0.06, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
                )).createOutline(size, layoutDirection, this)
                onDrawBehind { drawOutline(o, Tokens.Terracotta) }
            },
        contentAlignment = Alignment.Center,
    ) { BasicText("$count", style = AppFonts.body(10f, 700, lineHeight = 1f, color = Tokens.Cream)) }
}

/** CSS `ease`, the header's opacity transition. */
private val Ease = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

/** The header's pen line: half ink at rest, full once the page has scrolled past 20 (AppHeader's `scrolled`). */
@Composable
private fun edgeInk(scrolled: Boolean): () -> Float {
    val alpha by animateFloatAsState(if (scrolled) 1f else 0.5f, tween(300, easing = Ease), label = "edge")
    return { alpha }
}

/** The root bar's height under the status bar, without its wavy edge. */
val BrandBarHeight = 58.dp

/**
 * The root screens' pinned header (AppHeader on a phone): the brand lockup —
 * ResonanceIcon (the wave glyph, 38, terracotta, INK) and "Resonance" in
 * Playfair 22/700 — on an opaque cream bar that ends on the wavy pen line;
 * content scrolls under it. Lay it over the list.
 *
 * A tab other than the feed hangs its own title where the brand would be
 * (`brand` = the title, `isHeading`), in the same size, and its actions at the end.
 */
@Composable
fun OrganicBrandBar(
    scrolled: Boolean,
    modifier: Modifier = Modifier,
    brand: String = "Resonance",
    /** `brand` is the screen's title: announced as its heading (the wordmark is no heading). */
    isHeading: Boolean = false,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val chrome = LocalHeaderChrome.current
    val style = AppFonts.heading(22f, 700, lineHeight = 1.2f).copy(letterSpacing = (-0.02).em)
    Row(
        modifier
            .fillMaxWidth()
            .blocksTouches()
            .headerEdge(edgeInk(scrolled))
            .statusBarsPadding()
            .padding(bottom = HeaderEdgeHeight)
            .height(if (chrome != null) TopBarRow else BrandBarHeight)
            .padding(start = chrome?.pad ?: 20.dp, end = chrome?.trailingPad ?: 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (chrome == null) {
            // The mark is nudged down 7% so it sits level with the wordmark's mass.
            OrganicIcon(IconName.Wave, Modifier.offset(y = (38 * 0.07).dp), size = 38.dp, color = Tokens.Terracotta, strokeWidth = Tokens.Ink.value)
            BasicText(
                brand, maxLines = 1, overflow = TextOverflow.Ellipsis, style = style,
                modifier = Modifier.weight(1f).then(if (isHeading) Modifier.semantics { heading() } else Modifier),
            )
        } else {
            // Beside the header's tabs (design note B2): the leading part keeps clear of them. A title
            // truncates; the wordmark that doesn't fit leaves the mark alone, named for TalkBack.
            val measurer = rememberTextMeasurer()
            val density = LocalDensity.current
            val wordmark = with(density) { measurer.measure(brand, style, maxLines = 1, softWrap = false).size.width.toDp() }
            val markAlone = !isHeading && 38.dp + 10.dp + wordmark > chrome.leadingMax
            Row(Modifier.widthIn(max = chrome.leadingMax), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OrganicIcon(
                    IconName.Wave, Modifier.offset(y = (38 * 0.07).dp).then(if (markAlone) Modifier.semantics { contentDescription = brand } else Modifier),
                    size = 38.dp, color = Tokens.Terracotta, strokeWidth = Tokens.Ink.value,
                )
                if (!markAlone) BasicText(
                    brand, maxLines = 1, overflow = TextOverflow.Ellipsis, style = style,
                    modifier = Modifier.weight(1f, fill = false).then(if (isHeading) Modifier.semantics { heading() } else Modifier),
                )
            }
            Spacer(Modifier.weight(1f))
        }
        trailing()
    }
}

/** A root screen's title in the page (home's h1): Playfair 32/700, line-height 1.1, −0.02em. */
@Composable
fun OrganicPageTitle(title: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        BasicText(
            title,
            style = AppFonts.heading(32f, 700, lineHeight = 1.1f).copy(letterSpacing = (-0.02).em),
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing()
    }
}

/**
 * Pushed-screen bar (AppHeader's phone takeover): the bare back arrow and,
 * when given, the screen's title in Playfair 22/700 beside it; trailing
 * actions at the end. Edged by the header's wavy line.
 */
@Composable
fun OrganicInlineBar(
    backLabel: String,
    onBack: () -> Unit,
    title: String? = null,
    scrolled: Boolean = false,
    modifier: Modifier = Modifier,
    /** Without the arrow, `leading` starts the bar (a thread's search field takes the arrow's place). */
    showBack: Boolean = true,
    /** Beside the arrow when there is no title (the card page's author, once the byline has scrolled away). */
    leading: @Composable RowScope.() -> Unit = {},
    /** How far a story has been read (0…1, read while drawing): the card page's progress on the pen line. */
    progress: (() -> Float)? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val chrome = LocalHeaderChrome.current
    // Beside the header's tabs the row is the root bars' 56, with no air above it (design note B2).
    val air = if (chrome != null) 0.dp else 4.dp
    Row(
        modifier
            .fillMaxWidth()
            .blocksTouches()
            .headerEdge(edgeInk(scrolled), progress)
            .statusBarsPadding()
            // Puts the arrow on the page's 20 margin, as the web's -8 margin + 8 padding does (the pad beside the tabs).
            .padding(start = chrome?.pad?.minus(16.dp) ?: 4.dp, end = chrome?.trailingPad ?: 8.dp)
            .padding(top = air, bottom = HeaderEdgeHeight)
            .height(LocalInlineBarHeight.current - air),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val back: @Composable () -> Unit = {
            if (showBack && !LocalBarBackHidden.current) OrganicIconButton(IconName.ArrowRight, backLabel, mirrored = true, onClick = onBack) else Spacer(Modifier.width(12.dp))
        }
        val titleText: @Composable (Modifier) -> Unit = { m ->
            BasicText(
                title.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = AppFonts.heading(22f, 700, lineHeight = 1.2f).copy(letterSpacing = (-0.02).em),
                modifier = m.semantics { heading() },
            )
        }
        if (chrome == null) {
            back()
            if (title != null) {
                Spacer(Modifier.width(4.dp))
                titleText(Modifier.weight(1f))
            } else {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, content = leading)
            }
        } else {
            // The arrow and the title keep clear of the tabs (the arrow's hit box hangs 16 into the pad);
            // under 72 of room the title goes and the arrow stays.
            val room = chrome.leadingMax + 16.dp
            Row(Modifier.widthIn(max = room), verticalAlignment = Alignment.CenterVertically) {
                back()
                if (title != null) {
                    if (room - 48.dp - 4.dp >= 72.dp) {
                        Spacer(Modifier.width(4.dp))
                        titleText(Modifier.weight(1f, fill = false))
                    }
                } else {
                    Row(Modifier.weight(1f, fill = false), verticalAlignment = Alignment.CenterVertically, content = leading)
                }
            }
            Spacer(Modifier.weight(1f))
        }
        trailing()
    }
}

/**
 * The inline bar's height under the status bar, without its wavy edge: its
 * 4 of air and the 48 arrow. A page lays the bar over its scrolling content
 * and pads that content by [inlineBarTop], so what scrolls shows right up to
 * the pen line instead of stopping short of it in a band of cream.
 */
val InlineBarHeight = 52.dp

/** Where a pushed page's content starts under its overlaid [OrganicInlineBar]. */
@Composable
fun inlineBarTop(): Dp = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + LocalInlineBarHeight.current + HeaderEdgeHeight

/**
 * How tall the pushed pages' bars are here: [InlineBarHeight], or in a pane beside a root list the
 * list's [BrandBarHeight], so the two bars' waves run level (design note §9).
 */
val LocalInlineBarHeight = staticCompositionLocalOf { InlineBarHeight }

/** The page is a pane's first (a thread beside the conversations): its bar has no way back. */
val LocalBarBackHidden = staticCompositionLocalOf { false }

/**
 * A bar lies over the page's scrolling content, so it must take the touches
 * that land on it — its blank middle and its wavy band included — or a tap
 * there would reach a link or a card hidden under the paper.
 */
fun Modifier.blocksTouches(): Modifier = pointerInput(Unit) {}

/** Room under a bar's content for its wavy edge (the web's HEADER_WAVE_H band). */
val HeaderEdgeHeight = 10.dp

/**
 * The web AppHeader's backdrop and bottom edge: the cream fill stops exactly
 * on the wavy pen line (the web masks its backdrop to the same curve), so the
 * line *is* the bar's edge — no band of fill below it, and content scrolled
 * beneath shows right up to the line. Uses the header's curve: wavyPoints
 * across the width, seed 211, 12 steps. `lineAlpha` is read while drawing, so
 * fading the line redraws without rebuilding the paths.
 */
fun Modifier.headerEdge(lineAlpha: () -> Float = { 1f }, progress: (() -> Float)? = null): Modifier = drawWithCache {
    val d = density
    val ink = Tokens.Ink.toPx()
    val y0 = size.height / d - 1.4 - Tokens.Ink.value
    val pts = wavyPoints((size.width / d).toDouble(), y0.toDouble(), 1.4, 211.0, 12).map { (it.x * d).toFloat() to (it.y * d).toFloat() }
    val line = Path().apply {
        moveTo(pts[0].first, pts[0].second)
        for (i in 1 until pts.size) {
            val (x0, y0p) = pts[i - 1]
            val (x1, y1) = pts[i]
            val mid = (x0 + x1) / 2
            cubicTo(mid, y0p, mid, y1, x1, y1)
        }
    }
    val fill = Path().apply {
        moveTo(0f, 0f)
        lineTo(size.width, 0f)
        lineTo(pts.last().first, pts.last().second)
        for (i in pts.size - 2 downTo 0) {
            val (x0, y0p) = pts[i + 1]
            val (x1, y1) = pts[i]
            val mid = (x0 + x1) / 2
            cubicTo(mid, y0p, mid, y1, x1, y1)
        }
        close()
    }
    val measure = if (progress != null) PathMeasure().apply { setPath(line, false) } else null
    val read = Path()
    onDrawBehind {
        drawPath(fill, Tokens.Cream)
        drawPath(line, Tokens.FieldBorderHover, alpha = lineAlpha(), style = Stroke(ink, cap = StrokeCap.Round))
        // How far the story has been read, in terracotta on the pen line itself; nothing at all
        // before the first step (no lone cap dot).
        val p = progress?.invoke() ?: 0f
        if (measure != null && p >= READ_MIN) {
            read.reset()
            measure.getSegment(0f, p.coerceAtMost(1f) * measure.length, read, true)
            drawPath(read, Tokens.Terracotta, style = Stroke(ink, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

/** Less read than this draws no progress (design note §3). */
private const val READ_MIN = 0.002f

/**
 * How far through a story the reader is (design note §3), 0…1: 0 while the story's top is still
 * below the bar's pen line, 1 once its bottom reaches the bottom of what can be seen, and 0 when
 * the whole story fits ([storyHeight] ≤ [visible], nothing to show). All in the same unit, the
 * story's top measured on screen.
 */
fun readingProgress(storyTop: Float, storyHeight: Float, lineY: Float, visible: Float): Float {
    val room = storyHeight - visible
    if (storyHeight <= 0f || room <= 0f) return 0f
    return ((lineY - storyTop) / room).coerceIn(0f, 1f)
}

/**
 * The tab bar's backdrop and top edge — [headerEdge] turned over: the cream
 * begins on a wavy pen line (its own seed, 223) and runs to the bottom, so
 * content scrolled beneath shows right down to the line. The line rests at
 * half ink, like the header's before the page scrolls.
 */
fun Modifier.footerEdge(lineAlpha: Float = 0.5f): Modifier = drawWithCache {
    val d = density
    val ink = Tokens.Ink.toPx()
    val y0 = 1.4 + Tokens.Ink.value
    val pts = wavyPoints((size.width / d).toDouble(), y0, 1.4, 223.0, 12).map { (it.x * d).toFloat() to (it.y * d).toFloat() }
    val line = Path().apply {
        moveTo(pts[0].first, pts[0].second)
        for (i in 1 until pts.size) {
            val (x0, y0p) = pts[i - 1]
            val (x1, y1) = pts[i]
            val mid = (x0 + x1) / 2
            cubicTo(mid, y0p, mid, y1, x1, y1)
        }
    }
    val fill = Path().apply {
        addPath(line)
        lineTo(size.width, size.height)
        lineTo(0f, size.height)
        close()
    }
    onDrawBehind {
        drawPath(fill, Tokens.Cream)
        drawPath(line, Tokens.FieldBorderHover, alpha = lineAlpha, style = Stroke(ink, cap = StrokeCap.Round))
    }
}
