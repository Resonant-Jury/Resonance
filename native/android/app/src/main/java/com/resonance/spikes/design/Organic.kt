package com.resonance.spikes.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.spikes.generated.Tokens

/** A hand-drawn filled surface with grain and its ink outline — the StoryCard / Panel frame. */
fun Modifier.organicSurface(
    fill: Color,
    stroke: Color,
    radius: Double = 22.0,
    seed: Double = 1.0,
    grain: GrainMode = GrainMode.Tile,
    grainOpacity: Float = 0.3f,
    tile: String = "grain-card",
): Modifier = drawWithCache {
    val outline = WobRectShape(radius, seed).createOutline(size, layoutDirection, this)
    val grainBrush = Grain.brush(grain, tile, size, density, grainOpacity)
    val grainAlpha = if (grain == GrainMode.Tile) grainOpacity else 1f
    val ink = Stroke(width = Tokens.Ink.toPx(), join = StrokeJoin.Round)
    onDrawBehind {
        drawOutline(outline, fill)
        grainBrush?.let { drawOutline(outline, it, alpha = grainAlpha) }
        drawOutline(outline, stroke, style = ink)
    }
}

@Composable
fun TagPill(text: String, fill: Color = Tokens.TerracottaLight, stroke: Color = Tokens.Terracotta, seed: Double = 5.0) {
    val shape = WobRectShape(11.0, seed, options = WobRectOptions(curve = 1.4, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(1.0)))
    BasicText(
        text,
        style = AppFonts.body(11f, 600, lineHeight = 1.4f),
        modifier = Modifier
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                val s = Stroke(Tokens.InkLight.toPx())
                onDrawBehind {
                    drawOutline(o, fill)
                    drawOutline(o, stroke, style = s)
                }
            }
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
fun HandDrawnAvatar(initials: String, color: Color = Tokens.TerracottaLight, size: Dp = 32.dp, seed: Double = 7.0) {
    val shape = WobRectShape(
        size.value * 0.4, seed, mag = size.value * 0.022,
        options = WobRectOptions(curve = 1.2, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(2.0)),
    )
    Box(
        Modifier
            .size(size)
            .clearAndSetSemantics { }
            .drawWithCache {
                val o = shape.createOutline(this.size, layoutDirection, this)
                val s = Stroke(Tokens.InkLight.toPx())
                onDrawBehind {
                    drawOutline(o, color)
                    drawOutline(o, Tokens.GhostStroke.copy(alpha = 0.7f), style = s)
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        BasicText(initials, style = AppFonts.body(size.value * 0.36f, 700, lineHeight = 1f))
    }
}

@Composable
fun WavyDivider(color: Color = Tokens.FieldBorder, seed: Double = 17.0, amp: Double = 1.4, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(6.dp)
            .clearAndSetSemantics { }
            .drawWithCache {
                val p = wavyLinePath(size.width, size.height, density, seed, amp)
                val s = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
                onDrawBehind { drawPath(p, color, style = s) }
            },
    )
}

/** Solid page background helper. */
fun Modifier.cream(): Modifier = background(Tokens.Cream)
