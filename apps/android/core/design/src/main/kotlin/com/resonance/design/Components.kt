package com.resonance.design

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobCircleOptions
import com.resonance.geometry.WobLoopOptions
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobLoop

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

/** Grain over a rectangle (the web's GrainOverlay): black ink at 2× opacity, so the mean darkening is `opacity`. */
fun Modifier.grainOverlay(opacity: Float): Modifier = drawWithCache {
    val brush = Grain.brush(GrainMode.Tile, "grain-overlay", size, density, 1f)
    onDrawWithContent {
        drawContent()
        brush?.let { drawRect(it, alpha = (opacity * 2).coerceAtMost(1f)) }
    }
}

/** The web's TagPill: auto wobble, the given fill, a faint ink outline. */
@Composable
fun TagPill(text: String, fill: Color = Tokens.Yellow, seed: Double? = null) {
    val s = seed ?: autoSeed(text)
    BasicText(
        text,
        style = AppFonts.body(12f, 600, lineHeight = 1.4f),
        modifier = Modifier
            .drawWithCache {
                val o = WobRectShape(size.height / density / 2.0, s).createOutline(size, layoutDirection, this)
                val stroke = Stroke(Tokens.Ink.toPx())
                onDrawBehind {
                    drawOutline(o, fill)
                    drawOutline(o, Color(0.25f, 0.19f, 0.13f, 0.45f), style = stroke)
                }
            }
            .padding(horizontal = 11.dp, vertical = 4.dp),
    )
}

/** TagPill's automatic seed: a hash of the label, so a tag always wobbles the same. */
fun autoSeed(s: String): Double {
    var hash = 7
    for (c in s) hash = (hash shl 5) - hash + c.code
    return (Math.abs(hash) % 9973 + 1).toDouble()
}

@Composable
fun HandDrawnAvatar(initials: String, imageUrl: String? = null, color: Color = Tokens.TerracottaLight, size: Dp = 32.dp, seed: Double = 7.0) {
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
                onDrawBehind { drawOutline(o, color) }
            },
        contentAlignment = Alignment.Center,
    ) {
        BasicText(initials, style = AppFonts.body(size.value * 0.36f, 700, lineHeight = 1f))
        if (imageUrl != null) {
            AsyncImage(model = imageUrl, contentDescription = null, contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier.size(size).clip(shape))
        }
        Box(Modifier.size(size).drawWithCache {
            val o = shape.createOutline(this.size, layoutDirection, this)
            val s = Stroke(Tokens.InkLight.toPx())
            onDrawBehind { drawOutline(o, Tokens.GhostStroke.copy(alpha = 0.7f), style = s) }
        })
    }
}

@Composable
fun WavyDivider(color: Color = Tokens.FieldBorder, seed: Double = 17.0, amp: Double = 1.4, modifier: Modifier = Modifier, lineWidth: Dp = Tokens.InkLight) {
    Box(
        modifier
            .fillMaxWidth()
            .height(6.dp)
            .clearAndSetSemantics { }
            .drawWithCache {
                val p = wavyLinePath(size.width, size.height, density, seed, amp)
                val s = Stroke(lineWidth.toPx(), cap = StrokeCap.Round)
                onDrawBehind { drawPath(p, color, style = s) }
            },
    )
}

/** OrganicButton: a wobbly pill; primary is filled terracotta with grain. */
@Composable
fun OrganicButton(
    title: String,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.Primary,
    icon: IconName? = null,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val haptic = LocalHapticFeedback.current
    val (fill, stroke, text) = when (variant) {
        ButtonVariant.Primary -> Triple(Tokens.Terracotta, Tokens.TerracottaInk, Tokens.Cream)
        ButtonVariant.Ghost -> Triple(Color.Transparent, Tokens.GhostStroke, Tokens.Text)
        ButtonVariant.Outline -> Triple(Color.Transparent, Tokens.Terracotta, Tokens.Terracotta)
    }
    // The web's BTN_SEEDS, so each variant wobbles like its web twin.
    val shape = OrganicButtonShape(when (variant) { ButtonVariant.Primary -> 3.0; ButtonVariant.Ghost -> 401.0; ButtonVariant.Outline -> 601.0 })
    Row(
        modifier
            .scale(if (pressed) 0.97f else 1f)
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                val grain = if (variant == ButtonVariant.Primary) Grain.brush(GrainMode.Tile, "grain-button", size, density, 0.38f) else null
                val ink = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round)
                onDrawBehind {
                    drawOutline(o, fill)
                    grain?.let { drawOutline(o, it, alpha = 0.38f) }
                    if (pressed) drawOutline(o, if (variant == ButtonVariant.Primary) Color.Black.copy(0.14f) else Tokens.Terracotta.copy(0.14f))
                    drawOutline(o, stroke, style = ink)
                }
            }
            .clickable(interaction, indication = null, enabled = enabled, role = Role.Button) {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .padding(horizontal = 28.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) OrganicIcon(icon, size = 18.dp, color = text)
        BasicText(title, style = AppFonts.body(15f, 600, lineHeight = 1.3f, color = if (enabled) text else text.copy(alpha = 0.5f)))
    }
}

enum class ButtonVariant { Primary, Ghost, Outline }

/**
 * OrganicButton.tsx's outline: a calm pill — radius 16, two or three gentle
 * turns along the long edges, one on the short ones, and the wobble and
 * corner drift scaled to the button (4% and 3% of its short side). A fixed
 * wobble reads as lumpy on a 48dp-tall button, most of all along the top edge.
 */
class OrganicButtonShape(private val seed: Double) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val m = (minOf(size.width, size.height) / density.density).toDouble()
        return WobRectShape(16.0, seed, mag = m * 0.04, options = WobRectOptions(
            curve = 1.3, cornerJitter = 1.3, cornerOffset = m * 0.03, segmentsH = SegValue.Range(2, 3), segmentsV = SegValue.Count(1.0),
        )).createOutline(size, layoutDirection, density)
    }
}

/** A round hand-drawn icon button with a 48dp hit area; `mirrored` flips it (the web's back arrow is arrow-right mirrored). */
@Composable
fun OrganicIconButton(icon: IconName, label: String, mirrored: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier
            .size(48.dp)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(40.dp).drawWithCache {
                val o = WobCircleShape(icon.key.length * 13.0, WobCircleOptions(segments = 7, mag = 1.2, cpJitter = 0.5))
                    .createOutline(size, layoutDirection, this)
                val s = Stroke(Tokens.InkLight.toPx())
                onDrawBehind { drawOutline(o, Tokens.GhostStroke.copy(alpha = 0.8f), style = s) }
            },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(icon, size = 20.dp, mirrored = mirrored) }
    }
}

/** SketchLoader: six dashes travelling nose-to-tail around a two-lap wobbly loop. */
@Composable
fun SketchLoader(size: Dp = 56.dp, color: Color = Tokens.Terracotta) {
    val t by rememberInfiniteTransition(label = "loader").animateFloat(
        0f, 1f, infiniteRepeatable(tween(2600, easing = LinearEasing)), label = "t",
    )
    val links = listOf(0.12f, 0.19f, 0.28f, 0.4f, 0.55f, 0.95f)
    Canvas(Modifier.size(size).semantics { contentDescription = "Loading" }) {
        val d = density
        val c = size.value / 2.0
        val path = wobLoop(c, c, size.value * 0.34, size.value * 0.27, 7.0, WobLoopOptions(segments = 9, mag = size.value * 0.03, cpJitter = 0.7)).toPath(d)
        val measure = PathMeasure().apply { setPath(path, false) }
        val length = measure.length
        links.forEachIndexed { k, alpha ->
            val head = (t + k * 0.12f) % 1f
            val seg = androidx.compose.ui.graphics.Path()
            val end = head + 0.12f
            measure.getSegment(head * length, minOf(end, 1f) * length, seg, true)
            if (end > 1f) measure.getSegment(0f, (end - 1f) * length, seg, true)
            drawPath(seg, color.copy(alpha = alpha), style = Stroke(size.toPx() * 0.036f, cap = if (k == links.lastIndex) StrokeCap.Round else StrokeCap.Butt))
        }
    }
}

/** An empty or error state in the web's voice: a blob, a line of copy, an optional action. */
@Composable
fun OrganicEmptyState(message: String, actionTitle: String? = null, onAction: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Box(Modifier.size(72.dp).clearAndSetSemantics { }.drawWithCache {
            val o = WobCircleShape(41.0, WobCircleOptions(segments = 9, mag = 3.0, cpJitter = 0.6)).createOutline(size, layoutDirection, this)
            val s = Stroke(Tokens.InkLight.toPx())
            onDrawBehind {
                drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.5f))
                drawOutline(o, Tokens.Terracotta.copy(alpha = 0.5f), style = s)
            }
        })
        BasicText(message, style = AppFonts.body(15f, lineHeight = 1.6f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
        if (actionTitle != null && onAction != null) OrganicButton(actionTitle, variant = ButtonVariant.Outline, onClick = onAction)
    }
}

/** OrganicInput: a labelled text field in a wobbly frame that turns terracotta while focused. */
@Composable
fun OrganicTextField(label: String, value: String, onValueChange: (String) -> Unit, placeholder: String = "", isSecure: Boolean = false, seed: Double = 21.0) {
    var focused by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicText(label.uppercase(), style = AppFonts.body(Tokens.LabelSize, 600, lineHeight = 1.3f, color = Tokens.TextMuted))
        Box(
            Modifier
                .fillMaxWidth()
                .drawWithCache {
                    val o = WobRectShape(Tokens.RadiusMd.toDouble(), seed, mag = 1.4).createOutline(size, layoutDirection, this)
                    val s = Stroke(Tokens.Ink.toPx())
                    onDrawBehind {
                        drawOutline(o, Tokens.CardBg)
                        drawOutline(o, if (focused) Tokens.Terracotta else Tokens.FieldBorder, style = s)
                    }
                }
                .padding(horizontal = Tokens.FieldPadX.dp, vertical = Tokens.FieldPadY.dp),
        ) {
            if (value.isEmpty()) BasicText(placeholder, style = AppFonts.body(16f, color = Tokens.Placeholder))
            BasicTextField(
                value, onValueChange,
                textStyle = AppFonts.body(16f),
                singleLine = true,
                visualTransformation = if (isSecure) PasswordVisualTransformation() else VisualTransformation.None,
                modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            )
        }
    }
}

/** Solid page background. */
fun Modifier.cream(): Modifier = background(Tokens.Cream)
