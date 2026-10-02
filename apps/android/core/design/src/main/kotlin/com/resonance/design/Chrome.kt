package com.resonance.design

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.remember
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
                Column(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clickable(source, indication = null, role = Role.Tab, onClickLabel = item.title, onClick = select)
                        .semantics { this.selected = selected },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Box(
                        Modifier.size(56.dp, 32.dp).drawWithCache {
                            // A scrap of torn paper, not a pill: a radius well under half
                            // the height, wavy long edges and lopsided corners, each tab
                            // its own seed.
                            val o = WobRectShape(12.0, index * 29.0 + 7, mag = 3.2, options = WobRectOptions(
                                curve = 1.2, cornerJitter = 3.6, cornerOffset = 3.0, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(1.0),
                            )).createOutline(size, layoutDirection, this)
                            onDrawBehind { if (wash > 0f) drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.55f * wash)) }
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
        }
    }
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
                    drawOutline(o, Tokens.Terracotta)
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
    Row(
        modifier
            .fillMaxWidth()
            .blocksTouches()
            .headerEdge(edgeInk(scrolled))
            .statusBarsPadding()
            .padding(bottom = HeaderEdgeHeight)
            .height(BrandBarHeight)
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // The mark is nudged down 7% so it sits level with the wordmark's mass.
        OrganicIcon(IconName.Wave, Modifier.offset(y = (38 * 0.07).dp), size = 38.dp, color = Tokens.Terracotta, strokeWidth = Tokens.Ink.value)
        BasicText(
            brand, maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = AppFonts.heading(22f, 700, lineHeight = 1.2f).copy(letterSpacing = (-0.02).em),
            modifier = Modifier.weight(1f).then(if (isHeading) Modifier.semantics { heading() } else Modifier),
        )
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
    /** Beside the arrow when there is no title (the card page's author, once the byline has scrolled away). */
    leading: @Composable RowScope.() -> Unit = {},
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier
            .fillMaxWidth()
            .blocksTouches()
            .headerEdge(edgeInk(scrolled))
            .statusBarsPadding()
            // Puts the arrow on the page's 20 margin, as the web's -8 margin + 8 padding does.
            .padding(start = 4.dp, end = 8.dp)
            .padding(top = 4.dp, bottom = HeaderEdgeHeight)
            .height(InlineBarHeight - 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OrganicIconButton(IconName.ArrowRight, backLabel, mirrored = true, onClick = onBack)
        if (title != null) {
            Spacer(Modifier.width(4.dp))
            BasicText(
                title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = AppFonts.heading(22f, 700, lineHeight = 1.2f).copy(letterSpacing = (-0.02).em),
                modifier = Modifier.weight(1f).semantics { heading() },
            )
        } else {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, content = leading)
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
fun inlineBarTop(): Dp = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + InlineBarHeight + HeaderEdgeHeight

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
fun Modifier.headerEdge(lineAlpha: () -> Float = { 1f }): Modifier = drawWithCache {
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
    onDrawBehind {
        drawPath(fill, Tokens.Cream)
        drawPath(line, Tokens.FieldBorderHover, alpha = lineAlpha(), style = Stroke(ink, cap = StrokeCap.Round))
    }
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

/** FloatingWriteButton's face: a rounded square (R 0.4 of its size), one turn a side, lopsided corners; no grain. */
@Composable
fun WriteButtonFace(size: Dp, icon: IconName = IconName.Pen) {
    Box(
        Modifier.size(size).drawWithCache {
            val s = size.value.toDouble()
            val o = WobRectShape(s * 0.4, 3.0, mag = s * 0.022, options = WobRectOptions(
                curve = 1.3, cornerJitter = 3.2, cornerOffset = s * 0.06, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
            )).createOutline(this.size, layoutDirection, this)
            val ink = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round)
            onDrawBehind {
                drawOutline(o, Tokens.Terracotta)
                drawOutline(o, Tokens.TerracottaInk, style = ink)
            }
        },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(icon, size = 24.dp, color = Tokens.Cream) }
}

/** The web's FloatingWriteButton on pages without the tab bar (a card): the pen, bottom right, 20 in. */
@Composable
fun FloatingWriteButton(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .navigationBarsPadding()
            .padding(20.dp)
            .plainClickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
    ) { WriteButtonFace(56.dp) }
}
