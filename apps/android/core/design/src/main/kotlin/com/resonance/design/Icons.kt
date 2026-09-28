package com.resonance.design

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.WobCircleOptions

/**
 * One path of a hand-drawn icon: its commands (see generated/Icons.kt),
 * whether it is filled with the icon's color instead of stroked, and its pen
 * width relative to the icon's.
 */
class IconStroke(val filled: Boolean, val width: Float, val commands: FloatArray) {
    fun path(scale: Float): Path {
        val p = Path()
        val c = commands
        var i = 0
        while (i < c.size) {
            when (c[i].toInt()) {
                0 -> { p.moveTo(c[i + 1] * scale, c[i + 2] * scale); i += 3 }
                1 -> { p.lineTo(c[i + 1] * scale, c[i + 2] * scale); i += 3 }
                2 -> { p.cubicTo(c[i + 1] * scale, c[i + 2] * scale, c[i + 3] * scale, c[i + 4] * scale, c[i + 5] * scale, c[i + 6] * scale); i += 7 }
                else -> { p.close(); i += 1 }
            }
        }
        return p
    }
}

/** A glyph in its own square box; `fillable` ones take an interior fill (the bookmark). */
class IconGlyph(val viewBox: Float, val fillable: Boolean, val strokes: List<IconStroke>)

/**
 * The web's `<Icon>`: one of its hand-drawn glyphs, generated from
 * src/components/atoms/Icon so both stay the same drawing. `strokeWidth` is
 * in the glyph's own 24-unit box, like the web's prop (default INK_STRONG).
 */
@Composable
fun OrganicIcon(
    name: IconName,
    modifier: Modifier = Modifier,
    size: Dp = 22.dp,
    color: Color = Tokens.Text,
    strokeWidth: Float = Tokens.InkStrong.value,
    fill: Color? = null,
    mirrored: Boolean = false,
) {
    val glyph = name.glyph
    Box(
        modifier
            .size(size)
            .clearAndSetSemantics { }
            .drawWithCache {
                val scale = this.size.width / glyph.viewBox
                val paths = glyph.strokes.map { it.path(scale) }
                val pen = strokeWidth * scale
                onDrawBehind {
                    scale(if (mirrored) -1f else 1f, 1f) {
                        glyph.strokes.forEachIndexed { i, s ->
                            if (s.filled) {
                                drawPath(paths[i], color)
                            } else {
                                if (glyph.fillable && fill != null) drawPath(paths[i], fill)
                                drawPath(paths[i], color, style = Stroke(pen * s.width, cap = StrokeCap.Round, join = StrokeJoin.Round))
                            }
                        }
                    }
                }
            },
    )
}

/**
 * A hand-drawn radio: a wobbly ring, and an inked dot when chosen. The web
 * has no radio (it uses its organic select), so this pairs the ring of
 * `OrganicIconButton` with the knob of the organic toggle.
 */
@Composable
fun OrganicRadio(selected: Boolean, seed: Double = 21.0, modifier: Modifier = Modifier) {
    val dot by animateFloatAsState(if (selected) 1f else 0f, spring(dampingRatio = 0.7f, stiffness = 600f), label = "radio")
    val ring = if (selected) Tokens.TerracottaDeep else Tokens.ToggleOffStroke
    Canvas(modifier.size(22.dp).clearAndSetSemantics { }) {
        val ringOutline = WobCircleShape(seed, WobCircleOptions(segments = 7, mag = 0.7, cpJitter = 0.4))
            .createOutline(size, layoutDirection, this)
        drawOutline(ringOutline, ring, style = Stroke(Tokens.Ink.toPx()))
        if (dot > 0.01f) {
            val inset = 5.5.dp.toPx()
            val d = (size.width - inset * 2) * (0.2f + 0.8f * dot)
            val o = WobCircleShape(seed + 5, WobCircleOptions(segments = 6, mag = 0.5, cpJitter = 0.3))
                .createOutline(androidx.compose.ui.geometry.Size(d, d), layoutDirection, this)
            val off = (size.width - d) / 2
            drawContext.transform.translate(off, off)
            drawOutline(o, Tokens.Terracotta, alpha = dot)
            drawContext.transform.translate(-off, -off)
        }
    }
}
