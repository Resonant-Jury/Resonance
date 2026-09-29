package com.resonance.design

import androidx.compose.animation.core.CubicBezierEasing
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

/** The pen in the tab bar: FloatingWriteButton's square, a little smaller to sit in the bar. */
private val PenSize = 52.dp

/** Floating hand-drawn tab bar with the pen in the middle; the selected tab sits on a wobbly wash. */
@Composable
fun <T> OrganicTabBar(items: List<OrganicTabItem<T>>, selection: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    val haptic = LocalHapticFeedback.current
    Row(
        modifier
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .fillMaxWidth()
            .organicSurface(Tokens.CardBg, Tokens.ModalBorder, radius = 26.0, seed = 131.0, grainOpacity = 0.25f)
            .padding(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEachIndexed { index, item ->
            val selected = item.id == selection
            val select = {
                haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                onSelect(item.id)
            }
            if (item.isAction) {
                Box(
                    Modifier.weight(1f).heightIn(min = 48.dp).clickable(role = Role.Button, onClickLabel = item.title, onClick = select),
                    contentAlignment = Alignment.Center,
                ) {
                    WriteButtonFace(PenSize, item.icon)
                }
            } else {
                Column(
                    Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .drawWithCache {
                            val o = WobRectShape(16.0, index * 29.0 + 7, mag = 1.3).createOutline(size, layoutDirection, this)
                            onDrawBehind { if (selected) drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.45f)) }
                        }
                        .clickable(role = Role.Tab, onClickLabel = item.title, onClick = select)
                        .semantics { this.selected = selected },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Box {
                        OrganicIcon(item.icon, size = 24.dp, color = if (selected) Tokens.Terracotta else Tokens.TextMuted)
                        // NotificationBell's chip hangs off the glyph's top-right corner.
                        if (item.badge > 0) CountBadge(item.badge, Modifier.align(Alignment.TopEnd).offset(x = 9.dp, y = (-8).dp))
                    }
                    BasicText(
                        item.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        style = AppFonts.body(10.5f, if (selected) 600 else 400, lineHeight = 1.3f, color = if (selected) Tokens.Terracotta else Tokens.TextMuted),
                    )
                }
            }
        }
    }
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
 */
@Composable
fun OrganicBrandBar(scrolled: Boolean, modifier: Modifier = Modifier, brand: String = "Resonance") {
    Row(
        modifier
            .fillMaxWidth()
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
        BasicText(brand, style = AppFonts.heading(22f, 700, lineHeight = 1.2f).copy(letterSpacing = (-0.02).em))
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
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        Modifier
            .fillMaxWidth()
            .headerEdge(edgeInk(scrolled))
            .statusBarsPadding()
            // Puts the arrow on the page's 20 margin, as the web's -8 margin + 8 padding does.
            .padding(start = 4.dp, end = 12.dp)
            .padding(top = 4.dp, bottom = HeaderEdgeHeight),
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
            Spacer(Modifier.weight(1f))
        }
        trailing()
    }
}

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
