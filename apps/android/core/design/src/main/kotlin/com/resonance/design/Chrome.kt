package com.resonance.design

import androidx.compose.foundation.interaction.HoverInteraction
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.animation.core.snap
import androidx.compose.ui.unit.Constraints
import com.resonance.geometry.wobRect
import kotlin.math.min
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Immutable
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import kotlin.math.max
import kotlin.math.roundToInt
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
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
 * The header's tabs left to right (design note B2, part C): the bar's items without the pen —
 * Feed · Messages · Notifications · Card Box — each with its place in the bar.
 */
fun <T> topTabsOrder(items: List<OrganicTabItem<T>>): List<IndexedValue<OrganicTabItem<T>>> =
    items.withIndex().filter { !it.value.isAction }

/**
 * The tab group's measures on a medium or expanded window (round 5, part C), apart from Compose so
 * they can be tested. The group is one segmented control, its segments side by side with a seam
 * between them: a segment with its label is 14 + the 20 glyph + 6 + the label + 14 wide, a glyph
 * alone 52; the group is [HEIGHT] tall in the header's [TopBarRow].
 */
object TopTabsFit {
    const val ICON_ITEM = 52f
    const val HEIGHT = 44f

    /** A segment showing its label, [textWidth] wide at 14/600 (the selected weight, so choosing one moves nothing). */
    fun labelledItem(textWidth: Float): Float = 14f + 20f + 6f + textWidth + 14f

    /** The group's width round segments this wide: they abut, the seams drawn on their edges. */
    fun groupWidth(items: List<Float>): Float = items.sum()

    /** Labels show on an expanded window when the labelled group leaves 152 beside it each side past the pad. */
    fun labels(cls: LayoutClass, labelledGroup: Float, width: Float, pad: Float): Boolean =
        cls.tabLabels && labelledGroup <= width - 2 * (pad + 152f)

    /** The widest a root bar's leading part (the brand, a tab's title) may be: 16 short of the group. */
    fun leadingMax(width: Float, group: Float, pad: Float): Float = (width - group) / 2f - pad - 16f
}

/**
 * Where a header tab's unread chip hangs (design note B2): off the glyph's top-end corner, its
 * top-end corner (+8, −7) past the glyph's — as on the glyph alone. Beside a label that corner
 * would sit 2 into the words (the gap is 6), so the glyph and its chip step toward the start, out
 * of the segment's 14 of padding, until the chip ends [CLEARANCE] before the label: the label, the
 * segment and the group keep their places and widths whether a count shows or not.
 */
object TopTabBadge {
    /** The chip's top-end corner past the glyph's. */
    const val OFFSET_X = 8f
    const val OFFSET_Y = -7f
    /** Between the glyph and its label. */
    const val LABEL_GAP = 6f
    /** Between the chip's frame and the label: 2 clear, and 1 for the chip's wobbly edge. */
    const val CLEARANCE = 3f

    /** How far the glyph (with its chip) steps toward the start: 5 beside a label with a count, else 0. */
    fun glyphShift(labelled: Boolean, badge: Int): Float =
        if (labelled && badge > 0) max(0f, OFFSET_X + CLEARANCE - LABEL_GAP) else 0f
}

/**
 * The header on a medium or expanded window (design note B2, round 5 part C). On a tab's root
 * ([tabs]) [MainTabs] draws the tab group over the middle of the page's bar and the pen at its end,
 * so the bar's leading part keeps to [leadingMax] and its actions end [trailingPad] in from the
 * window's edge. A pushed page has neither ([tabs] false): its bar is the back arrow, the page's
 * context in the middle and its actions at the end. Null on a phone, in the writer and in a pane.
 */
@Immutable
data class HeaderChrome(val width: Dp, val groupWidth: Dp, val pad: Dp, val labels: Boolean, val tabs: Boolean = true) {
    val leadingMax: Dp get() = TopTabsFit.leadingMax(width.value, groupWidth.value, pad.value).dp
    /** The pen (56) and 8 before it on a tab's root; the pad alone on a pushed page (no pen there). */
    val trailingPad: Dp get() = if (tabs) pad + PenChipWidth + 8.dp else pad
}

/** The header's chrome where the window has tabs in it; null on a phone, in the writer and in a pane. */
val LocalHeaderChrome = staticCompositionLocalOf<HeaderChrome?> { null }

/** A bar's row under the status bar on a medium or expanded window (brand and inline alike), without its wavy edge. */
val TopBarRow = 72.dp

/** The bar of a pane beside a list (a thread beside the conversations): a smaller row under the header. */
val PaneBarRow = 56.dp

/** How tall the root bars' row is here: [TopBarRow] beside the header's tabs, a phone's [BrandBarHeight] else. */
@Composable
fun brandBarHeight(): Dp = if (LocalHeaderChrome.current != null) TopBarRow else BrandBarHeight

/** The pen chip's width. */
private val PenChipWidth = 56.dp

/** The labels' face in the header's tabs: body 14, 600 chosen / 500 not. */
private fun topTabStyle(selected: Boolean) =
    AppFonts.body(14f, if (selected) 600 else 500, lineHeight = 1.2f, color = if (selected) Mixes.ButtonOnTonal else Tokens.TextMuted)

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
 * The tab group in the middle of a tab root's header on a medium or expanded window (round 5,
 * part C): drawn as the borderless segmented buttons are (SegmentedActionBar) — one hand-drawn
 * shape with no pen line, the segments parted by wavy seams cut in the paper's cream, the buttons'
 * grain over all of it. Nothing is drawn inside a segment for the choice: the chosen segment's own
 * fill changes, cream-dark to the tonal face (`--button-tonal`), its glyph and label from muted to
 * `--button-on-tonal`, the label semibold. A pointer lays the tonal face at 0.45; a press spreads
 * its ink from the finger, as on the segmented buttons. Re-choosing the tab shown is the caller's
 * to read (pop to its root, or scroll it to the top), as on the bar.
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
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val ink = remember { InkSpread() }
    var pressed by remember { mutableStateOf<Int?>(null) }
    val lefts = widths.runningFold(0f) { x, w -> x + w.value }.dropLast(1)
    val leftsNow by rememberUpdatedState(lefts)
    val hovers = remember(items.size) { List(items.size) { mutableStateOf(false) } }
    // How chosen each segment is (0…1, read while drawing): its fill eases between the two faces.
    val chosen = items.map { (_, item) ->
        animateFloatAsState(if (item.id == selection) 1f else 0f, tween(160), label = "topTabFill")
    }
    Row(
        modifier
            .height(TopTabsFit.HEIGHT.dp)
            .drawWithCache {
                val d = this.density
                val w = size.width / d
                val h = size.height / d
                val outer = wobRect(w.toDouble(), h.toDouble(), 16.0, TOP_TABS_SEED, min(w, h) * 0.05, WobRectOptions(
                    segmentsH = SegValue.Range(7, 9), segmentsV = SegValue.Range(2, 3), curve = 1.2, cornerJitter = 1.2, cornerOffset = h * 0.04,
                )).toPath(d)
                val pad = max(12.0, h * 0.3)
                val boundaries = lefts.drop(1).mapIndexed { i, x -> boundaryPoints(x.toDouble(), h.toDouble(), TOP_TABS_SEED + i * 37 + 11, 1.6, pad) }
                val regions = items.indices.map { i ->
                    Path().apply { op(SegmentedLayout.regionPath(i, items.size, boundaries, w, h, pad.toFloat(), d), outer, PathOperation.Intersect) }
                }
                val seams = boundaries.map { polylinePath(it, d) }
                val grain = Grain.brush(GrainMode.Tile, "grain-button", size, d, 0.38f)
                val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round)
                onDrawBehind {
                    drawPath(outer, Tokens.CreamDark)
                    regions.forEachIndexed { i, region ->
                        val fill = max(chosen[i].value, if (hovers[i].value) TOP_HOVER_FILL else 0f)
                        if (fill > 0f) drawPath(region, Mixes.ButtonTonal, alpha = fill)
                    }
                    pressed?.let { i -> with(ink) { draw(regions[i], OrganicIndication.Wash) } }
                    clipPath(outer) { seams.forEach { drawPath(it, Tokens.Cream, style = pen) } }
                    grain?.let { drawPath(outer, it, alpha = 0.38f) }
                }
            }
            .selectableGroup()
            .semantics { isTraversalGroup = true; contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEachIndexed { i, (_, item) ->
            val selected = item.id == selection
            val source = remember { MutableInteractionSource() }
            LaunchedEffect(source) {
                source.interactions.collect {
                    when (it) {
                        is PressInteraction.Press -> {
                            pressed = i
                            ink.press(scope, Offset(it.pressPosition.x + with(density) { leftsNow[i].dp.toPx() }, it.pressPosition.y))
                        }
                        is PressInteraction.Release, is PressInteraction.Cancel -> ink.release(scope)
                        is HoverInteraction.Enter -> hovers[i].value = true
                        is HoverInteraction.Exit -> hovers[i].value = false
                    }
                }
            }
            val face = if (selected) Mixes.ButtonOnTonal else Tokens.TextMuted
            Box(
                Modifier
                    .width(widths.getOrElse(i) { TopTabsFit.ICON_ITEM.dp })
                    .fillMaxHeight()
                    .hoverable(source)
                    .pointerHoverIcon(PointerIcon.Hand)
                    .clickable(source, indication = null, role = Role.Tab, onClickLabel = item.title) {
                        haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                        onSelect(item.id)
                    }
                    .semantics {
                        this.selected = selected
                        if (!labels) contentDescription = item.title
                    },
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Beside words, the glyph and its chip step into the leading padding so the chip
                    // ends clear of the label; nothing else moves (an offset takes no room).
                    Box(Modifier.offset(x = -TopTabBadge.glyphShift(labels, item.badge).dp)) {
                        OrganicIcon(item.icon, size = if (labels) 20.dp else 22.dp, color = face)
                        if (item.badge > 0) {
                            CountBadge(item.badge, Modifier.align(Alignment.TopEnd).offset(x = TopTabBadge.OFFSET_X.dp, y = TopTabBadge.OFFSET_Y.dp))
                        }
                    }
                    if (labels) {
                        Spacer(Modifier.width(TopTabBadge.LABEL_GAP.dp))
                        BasicText(item.title, maxLines = 1, softWrap = false, style = topTabStyle(selected), modifier = Modifier.clearAndSetSemantics { })
                    }
                }
            }
        }
    }
}

/** The group's shape (part B's track seed); its seams take theirs from it. */
private const val TOP_TABS_SEED = 233.0

/** A pointer over a header tab: the tonal face at 0.45. */
private const val TOP_HOVER_FILL = 0.45f

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
 *
 * On a medium or expanded window (round 5, part C) a pushed page's bar is the whole header — no
 * tabs, no pen over it: the arrow leads, the page's context ([title], else [centre]) stands in the
 * middle of the window (one line, truncated, kept clear of both ends), its actions end on the pad.
 * A [title] not [titleShown] yet (the card's title still on the page) is faded out and silent.
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
    /** Whether [title] shows: it fades in (160 ms; at once under reduced motion) when this turns true. */
    titleShown: Boolean = true,
    /** The page's context when it isn't a title (a thread's person): the middle of a tablet's header, beside the arrow on a phone. */
    centre: (@Composable RowScope.() -> Unit)? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val chrome = LocalHeaderChrome.current
    // Beside the header's tabs the row is the root bars', with no air above it (design note B2).
    val air = if (chrome != null) 0.dp else 4.dp
    val still = LocalContext.current.prefersReducedMotion()
    val titleAlpha by animateFloatAsState(if (titleShown) 1f else 0f, if (still) snap() else tween(TITLE_FADE_MILLIS), label = "barTitle")
    val back: @Composable () -> Unit = {
        if (showBack && !LocalBarBackHidden.current) OrganicIconButton(IconName.ArrowRight, backLabel, mirrored = true, onClick = onBack) else Spacer(Modifier.width(12.dp))
    }
    val titleText: @Composable (Modifier) -> Unit = { m ->
        BasicText(
            title.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = AppFonts.heading(22f, 700, lineHeight = 1.2f).copy(letterSpacing = (-0.02).em),
            modifier = m
                .graphicsLayer { alpha = titleAlpha }
                .then(if (titleShown) Modifier.semantics { heading() } else Modifier.clearAndSetSemantics { }),
        )
    }
    val bar = modifier
        .fillMaxWidth()
        .blocksTouches()
        .headerEdge(edgeInk(scrolled), progress)
        .statusBarsPadding()
    if (chrome == null) {
        Row(
            bar
                // Puts the arrow on the page's 20 margin, as the web's -8 margin + 8 padding does.
                .padding(start = 4.dp, end = 8.dp)
                .padding(top = air, bottom = HeaderEdgeHeight)
                .height(LocalInlineBarHeight.current - air),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            back()
            if (title != null) {
                Spacer(Modifier.width(4.dp))
                titleText(Modifier.weight(1f))
            } else {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    leading()
                    centre?.invoke(this)
                }
            }
            trailing()
        }
        return
    }
    // The arrow's hit box hangs 16 into the pad, the last action's 12 (their glyphs sit on it).
    val startPad = chrome.pad - 16.dp
    val endPad = chrome.pad - 12.dp
    Layout(
        contents = listOf(
            { Row(verticalAlignment = Alignment.CenterVertically) { back(); leading() } },
            {
                if (title != null) titleText(Modifier)
                else if (centre != null) Row(verticalAlignment = Alignment.CenterVertically, content = centre)
            },
            { Row(verticalAlignment = Alignment.CenterVertically, content = trailing) },
        ),
        modifier = bar.padding(bottom = HeaderEdgeHeight).height(LocalInlineBarHeight.current),
    ) { (lead, middle, end), constraints ->
        val w = constraints.maxWidth
        val h = constraints.maxHeight
        val sp = startPad.roundToPx()
        val ep = endPad.roundToPx()
        val loose = Constraints(maxHeight = h)
        val endP = end.firstOrNull()?.measure(loose.copy(maxWidth = (w - sp - ep).coerceAtLeast(0)))
        val endW = endP?.width ?: 0
        val leadP = lead.firstOrNull()?.measure(loose.copy(maxWidth = (w - sp - ep - endW).coerceAtLeast(0)))
        val leadW = leadP?.width ?: 0
        val room = InlineBarCentre.room(w / density, (sp + leadW) / density, (ep + endW) / density)
        val midP = if (room != null) middle.firstOrNull()?.measure(loose.copy(maxWidth = (room * density).toInt())) else null
        layout(w, h) {
            leadP?.place(sp, (h - leadP.height) / 2)
            endP?.place(w - ep - endW, (h - endP.height) / 2)
            midP?.place((w - midP.width) / 2, (h - midP.height) / 2)
        }
    }
}

/**
 * How wide a pushed page's context may be in the middle of a tablet's header (round 5, part C),
 * apart from Compose so it can be tested: centred on the window, it keeps [GAP] clear of the wider
 * of the two ends ([leading] and [trailing]: how far each reaches in from its edge), so it stays on
 * the window's centre; under [MIN] of room it isn't shown (the arrow and the actions stay).
 */
object InlineBarCentre {
    const val GAP = 16f
    const val MIN = 72f

    fun room(width: Float, leading: Float, trailing: Float): Float? {
        val r = width - 2 * (max(leading, trailing) + GAP)
        return if (r >= MIN) r else null
    }
}

/** The pushed bar's title coming in once the page's own has scrolled under the header. */
private const val TITLE_FADE_MILLIS = 160

/**
 * Whether something at the top of a list's first item has gone up under the bar laid over the
 * list (the card's title, a person's name): the list starts on the bar's line, so it has once the
 * first item has scrolled by as much as that thing's bottom lies below the item's top
 * ([bottomInItem], unknown until measured) — or the first item is gone altogether.
 */
fun scrolledUnderBar(firstIndex: Int, firstOffset: Int, bottomInItem: Float?): Boolean =
    firstIndex > 0 || (bottomInItem != null && firstOffset >= bottomInItem)

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
