package com.resonance.design

import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.Prng
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.autoSegments
import com.resonance.geometry.wavyVertical
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * HandDrawnBorder's auto wobble (its size sets the swing and the turns) with a
 * set bow — the writer's frames pass `curve={0.8}` (the title, the image
 * surface and the picture in it). The twin of iOS's AutoWobRectShape.
 */
class AutoWobRectShape(private val radius: Double = 16.0, private val seed: Double, private val curve: Double) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val w = (size.width / density.density).toDouble()
        val h = (size.height / density.density).toDouble()
        if (w <= 0 || h <= 0) return Outline.Rectangle(androidx.compose.ui.geometry.Rect.Zero)
        return WobRectShape(radius, seed, options = WobRectOptions(
            curve = curve, segmentsH = SegValue.Count(autoSegments(w).toDouble()), segmentsV = SegValue.Count(autoSegments(h).toDouble()),
        )).createOutline(size, layoutDirection, density)
    }
}

/** A shape drawn in a box `inset` smaller on every side (a clip for an overscanned picture). */
private class InsetShape(private val base: Shape, private val inset: Dp) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val px = with(density) { inset.toPx() }
        val inner = base.createOutline(Size(size.width - px * 2, size.height - px * 2), layoutDirection, density)
        return Outline.Generic(Path().apply {
            addOutline(inner)
            translate(Offset(px, px))
        })
    }
}

/**
 * The web's vertical Divider: a wavy pen rule that stands a few dp clear of
 * its ends (18% of it, at most 6dp) and gains a turn every 34dp of height, so
 * a tall rule keeps the same density as a short one.
 */
@Composable
fun OrganicVerticalRule(
    modifier: Modifier = Modifier,
    seed: Double = 17.0,
    amp: Double = 1.4,
    color: Color = Tokens.FieldBorderHover.copy(alpha = 0.35f),
    lineWidth: Dp = 1.2.dp,
) {
    Canvas(modifier.width((amp * 2).dp + lineWidth * 2).fillMaxHeight().clearAndSetSemantics { }) {
        val h = (size.height / density).toDouble()
        if (h <= 0) return@Canvas
        val inset = min(0.18, 6 / h)
        val length = h * (1 - inset * 2)
        val steps = max(2, (length / 34).roundToInt())
        val path = wavyVertical(length, seed, amp, steps).toPath(density, size.width / 2, (h * inset).toFloat() * density)
        drawPath(path, color, style = Stroke(lineWidth.toPx(), cap = StrokeCap.Round))
    }
}

/**
 * HandDrawnImage: a picture that fills a wobbly frame (R 16, the size's own
 * wobble, a set bow) with the field's pen line on top, 16:10. `blur` and
 * `wash` show an unsettled picture (a streaming preview) in the same frame;
 * `onRemove` adds the dark ✕ chip in its corner. Give it a `url` or a `bitmap`.
 */
@Composable
fun HandDrawnImage(
    modifier: Modifier = Modifier,
    url: String? = null,
    bitmap: ImageBitmap? = null,
    seed: Double = 31.0,
    radius: Double = 16.0,
    curve: Double = 0.8,
    blur: Dp = 0.dp,
    wash: Color? = null,
    removeLabel: String = "",
    onRemove: (() -> Unit)? = null,
    overlay: @Composable BoxScope.() -> Unit = {},
) {
    val frame = AutoWobRectShape(radius, seed, curve)
    Box(
        modifier
            .fillMaxWidth()
            .aspectRatio(16f / 10f)
            .drawWithCache {
                val o = frame.createOutline(size, layoutDirection, this)
                val ink = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawWithContent {
                    drawContent()
                    wash?.let { drawOutline(o, it) }
                    drawOutline(o, Tokens.FieldBorder, style = ink)
                }
            },
    ) {
        // Overscan past the box so the wobble's bulges land on pixels (BLEED 6, more under a blur).
        val bleed = 6.dp + blur * 2
        BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            val picture = Modifier
                .requiredSize(maxWidth + bleed * 2, maxHeight + bleed * 2)
                .clip(InsetShape(frame, bleed))
                // RenderEffect blur (Android 12+); earlier the wash alone marks it unsettled.
                .then(if (blur > 0.dp && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Modifier.blur(blur) else Modifier)
            when {
                bitmap != null -> Image(bitmap, null, picture, contentScale = ContentScale.Crop)
                else -> Box(picture.background(Tokens.CreamDark)) {
                    if (url != null) AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                }
            }
        }
        overlay()
        if (onRemove != null) Box(
            Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp)
                .size(34.dp)
                .drawWithCache {
                    val o = WobRectShape(34 * 0.4, seed + 5, mag = 34 * 0.022, options = WobRectOptions(
                        curve = 1.3, cornerJitter = 3.2, cornerOffset = 34 * 0.06, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
                    )).createOutline(size, layoutDirection, this)
                    val ink = Stroke(Tokens.Ink.toPx())
                    onDrawBehind {
                        drawOutline(o, Mixes.ImageRemoveFill)
                        drawOutline(o, Mixes.ImageRemoveStroke, style = ink)
                    }
                }
                .plainClickable(role = Role.Button, onClick = onRemove)
                .semantics { contentDescription = removeLabel },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.Close, size = 16.dp, color = Tokens.Cream) }
    }
}

/**
 * The writer's ✕ (WriteWorkspace's paneClose): a 36dp chip with a thin
 * field-border line on slightly uneven corners — a proper bordered button,
 * pinned above the scrolling page.
 */
@Composable
fun OrganicCloseChip(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    // border-radius: 11px 13px 12px 14px
    val shape = RoundedCornerShape(topStart = 11.dp, topEnd = 13.dp, bottomEnd = 12.dp, bottomStart = 14.dp)
    Box(
        modifier
            .size(36.dp)
            .background(Tokens.Cream, shape)
            .border(1.dp, Tokens.FieldBorder, shape)
            .plainClickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(IconName.Close, size = 17.dp, color = Tokens.TextMuted) }
}

/**
 * SegmentedActionBar's boundaryPoints: a gently wobbly vertical boundary at
 * `x` (dp), as points, so a segment's fill edge and the stroked divider share
 * the same geometry. It runs from -pad to h+pad so fills overshoot the bar and
 * the outer clip trims them flush; two interior anchors give a 1–2 turn wave.
 */
fun boundaryPoints(x: Double, h: Double, seed: Double, amp: Double, pad: Double): List<Offset> {
    val steps = 3
    val rnd = Prng(seed)
    fun f(n: Double) = (Math.round(n * 100) / 100.0).toFloat()
    val points = mutableListOf(Offset(f(x), (-pad).toFloat()))
    for (k in 0..steps) {
        val y = k.toDouble() / steps * h
        val off = if (k == 0 || k == steps) 0.0 else (rnd.next() - 0.5) * 2 * amp
        points += Offset(f(x + off), f(y))
    }
    points += Offset(f(x), f(h + pad))
    return points
}

/** The points joined by straight lines, scaled from dp to px. */
fun polylinePath(points: List<Offset>, density: Float): Path = Path().apply {
    points.forEachIndexed { i, p -> if (i == 0) moveTo(p.x * density, p.y * density) else lineTo(p.x * density, p.y * density) }
}
