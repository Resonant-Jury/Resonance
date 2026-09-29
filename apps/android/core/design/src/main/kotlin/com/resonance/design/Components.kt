package com.resonance.design

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
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
import androidx.compose.ui.unit.em
import coil3.compose.AsyncImage
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobLoopOptions
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobLoop
import kotlin.math.hypot
import kotlin.math.max

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

/** The system's "Remove animations" (animator duration scale 0) — the web's prefers-reduced-motion. */
fun Context.prefersReducedMotion(): Boolean =
    Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

/**
 * TagPill.tsx's sizes: sm under the owner's cards (the anonymous badge), md on
 * cards, lg in the writer — the label's px, its tracking in em, and the pill's
 * horizontal × vertical padding.
 */
enum class TagSize(val font: Float, val tracking: Float, val padX: Dp, val padY: Dp) {
    Sm(10f, 0.04f, 10.dp, 3.dp),
    Md(11f, 0.04f, 14.dp, 4.dp),
    Lg(13f, 0.05f, 18.dp, 7.dp),
}

/**
 * The web's TagPill: small caps — sm 10px/600 at 0.04em, padding 3×10; md
 * 11px, 4×14; lg 13px at 0.05em, 7×18 — on an auto-wobbled pill of the given
 * fill with a faint ink outline. `onRemove` adds its hand-drawn × (the writer's tags).
 */
@Composable
fun TagPill(text: String, fill: Color = Tokens.Yellow, seed: Double? = null, size: TagSize = TagSize.Md, onRemove: (() -> Unit)? = null) {
    val s = seed ?: autoSeed(text)
    Row(
        Modifier
            .drawWithCache {
                val o = WobRectShape(this.size.height / density / 2.0, s).createOutline(this.size, layoutDirection, this)
                val stroke = Stroke(Tokens.Ink.toPx())
                onDrawBehind {
                    drawOutline(o, fill)
                    drawOutline(o, Color(0.25f, 0.19f, 0.13f, 0.45f), style = stroke)
                }
            }
            .padding(horizontal = size.padX, vertical = size.padY),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        BasicText(
            text.uppercase(),
            style = AppFonts.body(size.font, 600, lineHeight = 1.3f).copy(letterSpacing = size.tracking.em),
        )
        if (onRemove != null) Canvas(
            Modifier
                .padding(start = 2.dp)
                .size(10.dp)
                .alpha(0.55f)
                .plainClickable(role = Role.Button, onClickLabel = "Remove tag", onClick = onRemove),
        ) {
            val k = this.size.width / 10f
            val x = Path().apply {
                moveTo(1.6f * k, 1.8f * k); cubicTo(3f * k, 3f * k, 5.2f * k, 5.2f * k, 8.2f * k, 8.4f * k)
                moveTo(8.2f * k, 1.8f * k); cubicTo(7f * k, 3f * k, 4.8f * k, 5.2f * k, 1.6f * k, 8.4f * k)
            }
            drawPath(x, Tokens.Text, style = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round))
        }
    }
}

/** TagPill's automatic seed: a hash of the label, so a tag always wobbles the same. */
fun autoSeed(s: String): Double {
    var hash = 7
    for (c in s) hash = (hash shl 5) - hash + c.code
    return (Math.abs(hash) % 9973 + 1).toDouble()
}

/**
 * HandDrawnAvatar: a lopsided rounded square — one turn per side, corners
 * jittered and shifted (AVATAR_WOB) — filled with the person's color and
 * initials, or clipped to their picture, with a soft ink rim.
 */
@Composable
fun HandDrawnAvatar(initials: String, imageUrl: String? = null, color: Color = Tokens.TerracottaLight, size: Dp = 32.dp, seed: Double = 7.0) {
    val s = size.value.toDouble()
    val shape = WobRectShape(
        s * 0.4, seed, mag = s * 0.022,
        options = WobRectOptions(curve = 1.3, cornerJitter = 3.2, cornerOffset = s * 0.06, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0)),
    )
    Box(
        Modifier
            .size(size)
            .clearAndSetSemantics { }
            .drawWithCache {
                val o = shape.createOutline(this.size, layoutDirection, this)
                val ink = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round)
                onDrawWithContent {
                    drawOutline(o, color)
                    drawContent()
                    drawOutline(o, Mixes.AvatarRim, style = ink)
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        BasicText(initials, style = AppFonts.body(size.value * 0.35f, 700, lineHeight = 1f))
        if (imageUrl != null) {
            AsyncImage(model = imageUrl, contentDescription = null, contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier.size(size).clip(shape))
        }
    }
}

/**
 * The web's Divider: `wavyLine(240, seed, amp, 7)` stretched across the row —
 * seven gentle turns at any width — in a faint field-border tone.
 */
@Composable
fun WavyDivider(
    color: Color = Tokens.FieldBorderHover.copy(alpha = 0.35f),
    seed: Double = 17.0,
    amp: Double = 1.4,
    modifier: Modifier = Modifier,
    lineWidth: Dp = Tokens.InkLight,
    steps: Int = 7,
) {
    Box(
        modifier
            .fillMaxWidth()
            .height(6.dp)
            .clearAndSetSemantics { }
            .drawWithCache {
                val p = wavyLinePath(size.width, size.height, density, seed, amp, steps)
                val s = Stroke(lineWidth.toPx(), cap = StrokeCap.Round)
                onDrawBehind { drawPath(p, color, style = s) }
            },
    )
}

/**
 * OrganicButton: a wobbly pill; primary is filled terracotta with grain. A
 * press grows the web's hover wash from the touch point; a disabled or busy
 * button fades as a whole (the web's 0.6).
 */
@Composable
fun OrganicButton(
    title: String,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.Primary,
    icon: IconName? = null,
    /** A brand mark (Google's) drawn as it is, instead of a hand-drawn glyph. */
    image: Painter? = null,
    enabled: Boolean = true,
    /** OrganicButton.tsx's `size="sm"`: tighter padding and 14px, for dialogs and dense rows. */
    small: Boolean = false,
    /** Just the glyph (the /me pen chip): `title` becomes its accessible name. */
    iconOnly: Boolean = false,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    var pressAt by remember { mutableStateOf(Offset.Unspecified) }
    LaunchedEffect(interaction) {
        interaction.interactions.collect { if (it is PressInteraction.Press) pressAt = it.pressPosition }
    }
    // The web's hover brush: a circle from the pointer to the far corner over 340ms.
    val reveal by animateFloatAsState(if (pressed) 1f else 0f, tween(340, easing = LinearEasing), label = "reveal")
    val haptic = LocalHapticFeedback.current
    val (fill, stroke, text) = when (variant) {
        ButtonVariant.Primary -> Triple(Tokens.Terracotta, Tokens.TerracottaInk, Tokens.Cream)
        ButtonVariant.Ghost -> Triple(Color.Transparent, Tokens.GhostStroke, Tokens.Text)
        ButtonVariant.Outline -> Triple(Color.Transparent, Mixes.TerracottaOutline, Tokens.Terracotta)
    }
    val overlay = if (variant == ButtonVariant.Primary) Color.Black.copy(0.14f) else Tokens.Terracotta.copy(0.14f)
    // The web's BTN_SEEDS, so each variant wobbles like its web twin.
    val shape = OrganicButtonShape(when (variant) { ButtonVariant.Primary -> 3.0; ButtonVariant.Ghost -> 401.0; ButtonVariant.Outline -> 601.0 })
    val padding = when {
        iconOnly -> PaddingValues(horizontal = 11.dp, vertical = 9.dp)
        small -> PaddingValues(horizontal = 18.dp, vertical = 9.dp)
        else -> PaddingValues(horizontal = 32.dp, vertical = 14.dp)
    }
    Row(
        modifier
            .alpha(if (enabled) 1f else 0.6f)
            .scale(if (pressed) 0.97f else 1f)
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                val path = (o as? Outline.Generic)?.path
                val grain = if (variant == ButtonVariant.Primary) Grain.brush(GrainMode.Tile, "grain-button", size, density, 0.38f) else null
                val ink = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round)
                onDrawBehind {
                    drawOutline(o, fill)
                    grain?.let { drawOutline(o, it, alpha = 0.38f) }
                    if (reveal > 0f && path != null) {
                        val c = if (pressAt.isSpecified) pressAt else center
                        val far = hypot(max(c.x, size.width - c.x), max(c.y, size.height - c.y)) + 4.dp.toPx()
                        clipPath(path) { drawCircle(overlay, far * reveal, c) }
                    }
                    drawOutline(o, stroke, style = ink)
                }
            }
            .clickable(interaction, indication = null, enabled = enabled, role = Role.Button) {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .then(if (iconOnly) Modifier.semantics { contentDescription = title } else Modifier)
            .padding(padding),
        verticalAlignment = Alignment.CenterVertically,
        // The web's label gap is 7; a brand mark sits in its own 10-gap span (signin/page.tsx).
        horizontalArrangement = Arrangement.spacedBy(if (image != null) 10.dp else 7.dp),
    ) {
        if (icon != null) OrganicIcon(icon, size = if (iconOnly) 17.dp else 16.dp, color = text)
        if (image != null) Image(image, contentDescription = null, modifier = Modifier.size(18.dp))
        if (!iconOnly) BasicText(title, style = AppFonts.body(if (small) 14f else 15f, 600, lineHeight = 1.3f, color = text).copy(letterSpacing = 0.02.em))
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

/**
 * A bare hand-drawn glyph with a 48dp hit area — the web header's back
 * control (arrow-right mirrored, 18px, no frame); `mirrored` flips it.
 */
@Composable
fun OrganicIconButton(icon: IconName, label: String, mirrored: Boolean = false, size: Dp = 18.dp, color: Color = Tokens.Text, onClick: () -> Unit) {
    Box(
        Modifier
            .size(48.dp)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(icon, size = size, color = color, mirrored = mirrored) }
}

/**
 * SketchLoader: six dashes travelling nose-to-tail around a two-lap wobbly
 * loop. With animations removed it rests as the whole loop, un-dashed, at 0.7
 * (the web's reduced-motion sketch).
 */
@Composable
fun SketchLoader(size: Dp = 56.dp, color: Color = Tokens.Terracotta) {
    val context = LocalContext.current
    val still = remember(context) { context.prefersReducedMotion() }
    val links = listOf(0.12f, 0.19f, 0.28f, 0.4f, 0.55f, 0.95f)
    val t = if (still) null else rememberInfiniteTransition(label = "loader").animateFloat(
        0f, 1f, infiniteRepeatable(tween(2600, easing = LinearEasing)), label = "t",
    )
    Canvas(Modifier.size(size).semantics { contentDescription = "Loading" }) {
        val d = density
        val c = size.value / 2.0
        val path = wobLoop(c, c, size.value * 0.34, size.value * 0.27, 7.0, WobLoopOptions(segments = 9, mag = size.value * 0.03, cpJitter = 0.7)).toPath(d)
        val pen = size.toPx() * 0.036f
        if (t == null) {
            drawPath(path, color.copy(alpha = 0.7f), style = Stroke(pen, cap = StrokeCap.Round, join = StrokeJoin.Round))
            return@Canvas
        }
        val measure = PathMeasure().apply { setPath(path, false) }
        val length = measure.length
        links.forEachIndexed { k, alpha ->
            val head = (t.value + k * 0.12f) % 1f
            val seg = androidx.compose.ui.graphics.Path()
            val end = head + 0.12f
            measure.getSegment(head * length, minOf(end, 1f) * length, seg, true)
            if (end > 1f) measure.getSegment(0f, (end - 1f) * length, seg, true)
            drawPath(seg, color.copy(alpha = alpha), style = Stroke(pen, cap = if (k == links.lastIndex) StrokeCap.Round else StrokeCap.Butt))
        }
    }
}

/** How an empty state's action reads: the web's filled CTA, an outline, or a plain terracotta link (not-found "back"). */
enum class EmptyAction { Primary, Outline, Link }

/**
 * A page-level empty, not-found or error state as the web sets it: an
 * optional Playfair title in the text color, muted copy, then the action —
 * no decoration (the web never draws a blob here).
 */
@Composable
fun OrganicEmptyState(
    message: String? = null,
    actionTitle: String? = null,
    onAction: (() -> Unit)? = null,
    title: String? = null,
    titleSize: Float = 22f,
    action: EmptyAction = EmptyAction.Primary,
    verticalPadding: Dp = 64.dp,
) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = verticalPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val center = TextAlign.Center
        if (title != null) {
            BasicText(title, style = AppFonts.heading(titleSize, 400, lineHeight = 1.3f).copy(textAlign = center))
        }
        if (message != null) {
            if (title != null) Box(Modifier.height(8.dp))
            BasicText(message, style = AppFonts.body(16f, lineHeight = 1.6f, color = Tokens.TextMuted).copy(textAlign = center))
        }
        if (actionTitle != null && onAction != null) {
            // Not-found pages put their link 12 under the title; a CTA sits 24 under the copy.
            Box(Modifier.height(if (message == null) 12.dp else 24.dp))
            when (action) {
                EmptyAction.Link -> BasicText(
                    actionTitle,
                    style = AppFonts.body(16f, lineHeight = 1.6f, color = Tokens.Terracotta),
                    modifier = Modifier.clickable(role = Role.Button, onClick = onAction).padding(vertical = 8.dp),
                )
                EmptyAction.Primary -> OrganicButton(actionTitle, onClick = onAction)
                EmptyAction.Outline -> OrganicButton(actionTitle, variant = ButtonVariant.Outline, onClick = onAction)
            }
        }
    }
}

/** An empty list inside a screen (notifications, the block list): plain muted text, no title or art. */
@Composable
fun OrganicListEmpty(message: String, size: Float = 14f, modifier: Modifier = Modifier) {
    BasicText(message, style = AppFonts.body(size, lineHeight = 1.6f, color = Tokens.TextMuted), modifier = modifier.fillMaxWidth())
}

/**
 * Field.tsx's Input: a labelled field on cream, framed by a hand-drawn line
 * (R 16, the size's own wobble) that turns terracotta while focused.
 * `multiline` is its Textarea (seed 17 there); `display` is its
 * `tone="display"` (the writing screen's title, Playfair 22 on two lines),
 * and `maxLength` caps it with the web's "12 / 60" counter underneath.
 */
@Composable
fun OrganicTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "",
    isSecure: Boolean = false,
    seed: Double = 13.0,
    multiline: Boolean = false,
    minLines: Int = 3,
    /** Read-only (the sign-in email on the account screen). */
    enabled: Boolean = true,
    display: Boolean = false,
    maxLength: Int? = null,
    /** A set bow (the writer's title passes 0.8); null keeps the size's own. */
    curve: Double? = null,
) {
    var focused by remember { mutableStateOf(false) }
    val text = if (display) AppFonts.heading(22f, lineHeight = 1.35f) else AppFonts.body(15f, lineHeight = 1.6f)
    // globals.css: every placeholder is the body face, italic, at the field's size and weight.
    val hint = AppFonts.oblique(AppFonts.body(if (display) 22f else 15f, if (display) 700 else 400, lineHeight = if (display) 1.35f else 1.6f, color = Tokens.Placeholder))
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        FieldLabel(label)
        Box(
            Modifier
                .fillMaxWidth()
                .fieldSurface(seed, { focused }, curve)
                .padding(horizontal = Tokens.FieldPadX.dp, vertical = Tokens.FieldPadY.dp),
        ) {
            if (value.isEmpty()) BasicText(placeholder, style = hint)
            BasicTextField(
                value, { onValueChange(if (maxLength != null) it.take(maxLength) else it) },
                textStyle = text,
                singleLine = !multiline,
                enabled = enabled,
                minLines = if (multiline) minLines else 1,
                visualTransformation = if (isSecure) PasswordVisualTransformation() else VisualTransformation.None,
                modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            )
        }
        if (maxLength != null) BasicText(
            "${value.length} / $maxLength",
            style = AppFonts.body(11f, lineHeight = 1.3f, color = if (value.length > maxLength) Tokens.Terracotta else Tokens.TextMuted)
                .copy(textAlign = TextAlign.End, fontFeatureSettings = "tnum"),
            // 6 under the field (the column spaces its rows 10).
            modifier = Modifier.fillMaxWidth().offset(y = (-4).dp),
        )
    }
}

/** Field.tsx's label: small caps in the muted ink, 10 above the control (the caller spaces it). */
@Composable
fun FieldLabel(text: String) {
    BasicText(text.uppercase(), style = AppFonts.body(Tokens.LabelSize, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em))
}

/**
 * The web Input/Textarea surface (HandDrawnDashedSurface R16): cream paper
 * framed by a hand-drawn line (the size's own wobble, or a set `curve`) that
 * darkens to terracotta while `focused`. Padding is the caller's
 * (`Tokens.FieldPadX` × `FieldPadY`); `focused` is read while drawing, so a
 * focus change redraws without recomposing.
 */
fun Modifier.fieldSurface(seed: Double = 13.0, focused: () -> Boolean = { false }, curve: Double? = null): Modifier = drawWithCache {
    val shape = curve?.let { AutoWobRectShape(Tokens.RadiusMd.toDouble(), seed, it) } ?: WobRectShape(Tokens.RadiusMd.toDouble(), seed)
    val o = shape.createOutline(size, layoutDirection, this)
    val s = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
    val r = CornerRadius(Tokens.RadiusMd.dp.toPx())
    onDrawBehind {
        // The web fills the field's plain rounded box; the pen line wobbles around it.
        drawRoundRect(Tokens.Cream, cornerRadius = r)
        drawOutline(o, if (focused()) Tokens.Terracotta else Tokens.FieldBorder, style = s)
    }
}

/** globals.css: every placeholder is the body face, italic, at the field's size and weight. */
fun fieldHintStyle(size: Float = 15f, lineHeight: Float = 1.6f) = AppFonts.oblique(AppFonts.body(size, 400, lineHeight = lineHeight, color = Tokens.Placeholder))

/** Solid page background. */
fun Modifier.cream(): Modifier = background(Tokens.Cream)
