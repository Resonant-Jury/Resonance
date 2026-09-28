package com.resonance.design

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.WobCircleOptions
import com.resonance.geometry.wavyPoints

// Navigation chrome in the hand-drawn language. The skeleton stays the
// platform's (Navigation 3 back stacks, predictive back); only the look is
// the brand's. Verified in spike S3.

data class OrganicTabItem<T>(val id: T, val title: String, val icon: IconName, val isAction: Boolean = false, val badge: Int = 0)

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
                    Box(
                        Modifier.size(52.dp, 44.dp).organicSurface(Tokens.Terracotta, Tokens.TerracottaInk, radius = 18.0, seed = 57.0, grainOpacity = 0.38f, tile = "grain-button"),
                        contentAlignment = Alignment.Center,
                    ) { OrganicIcon(item.icon, size = 24.dp, color = Tokens.Cream) }
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
                        if (item.badge > 0) Box(
                            Modifier.align(Alignment.TopEnd).padding(end = 0.dp).size(8.dp).drawWithCache {
                                val o = WobCircleShape(17.0, WobCircleOptions(segments = 6, mag = 0.4, cpJitter = 0.3)).createOutline(size, layoutDirection, this)
                                onDrawBehind { drawOutline(o, Tokens.Terracotta) }
                            },
                        )
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

/** Root-screen header: large Playfair title with the wavy pen line under it. */
@Composable
fun OrganicLargeHeader(title: String, trailing: @Composable RowScope.() -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BasicText(title, style = AppFonts.heading(30f, lineHeight = 1.2f), modifier = Modifier.weight(1f).semantics { heading() })
            trailing()
        }
        WavyDivider(Tokens.FieldBorderHover, seed = 7.0, amp = 1.6, lineWidth = Tokens.Ink)
    }
}

/** Pushed-screen bar: hand-drawn back button and trailing actions, edged by the header's wavy line. */
@Composable
fun OrganicInlineBar(backLabel: String, onBack: () -> Unit, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(
        Modifier
            .fillMaxWidth()
            .headerEdge()
            .statusBarsPadding()
            .padding(horizontal = 12.dp)
            .padding(top = 4.dp, bottom = HeaderEdgeHeight),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OrganicIconButton(IconName.ArrowRight, backLabel, mirrored = true, onClick = onBack)
        Spacer(Modifier.weight(1f))
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
 * across the width, seed 211, 12 steps.
 */
fun Modifier.headerEdge(): Modifier = drawWithCache {
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
        drawPath(line, Tokens.FieldBorderHover, style = Stroke(ink, cap = StrokeCap.Round))
    }
}
