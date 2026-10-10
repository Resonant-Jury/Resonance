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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.layout.Layout
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.text.modifiers.TextAutoSizeLayoutScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
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
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.stateDescription
import com.resonance.geometry.wobCircle
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobCircleOptions
import com.resonance.geometry.WobLoopOptions
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.penWave
import com.resonance.geometry.seedFromString
import com.resonance.geometry.wobLoop
import com.resonance.kit.l10n.L10n
import kotlin.math.hypot
import kotlin.math.max

/** A hand-drawn filled surface with grain and its ink outline — the StoryCard / Panel frame. A transparent `stroke` draws no pen line (paper). */
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
        if (stroke != Color.Transparent) drawOutline(outline, stroke, style = ink)
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
 * fill. A tag in a card's footer or on an arrow sits on a surface that is
 * framed already, so sm and md are the colour alone; lg (the writer's) is the
 * one that stands by itself among fields and keeps a faint ink outline.
 * `outlined` overrides that for a pill on bare page paper rather than inside a
 * framed card (the anonymous badge under a card on the shelves, cream-dark on
 * the cream page, vanishes without its rim). `onRemove` adds its hand-drawn ×
 * (the writer's tags).
 */
@Composable
fun TagPill(
    text: String,
    fill: Color = Tokens.Yellow,
    seed: Double? = null,
    size: TagSize = TagSize.Md,
    outlined: Boolean = size == TagSize.Lg,
    onRemove: (() -> Unit)? = null,
) {
    val s = seed ?: autoSeed(text)
    Row(
        Modifier
            .drawWithCache {
                val o = WobRectShape(this.size.height / density / 2.0, s).createOutline(this.size, layoutDirection, this)
                val stroke = Stroke(Tokens.Ink.toPx())
                onDrawBehind {
                    drawOutline(o, fill)
                    if (outlined) drawOutline(o, Color(0.25f, 0.19f, 0.13f, 0.45f), style = stroke)
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
                .plainClickable(role = Role.Button, onClickLabel = L10n.Write.removeTag, onClick = onRemove),
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
 * The web's OrganicLink (OrganicLink.tsx): a text link in terracotta with no
 * straight underline — a pen's wavy stroke sits under it instead, seeded from
 * the link's `href` so each link wobbles its own way (the twin of iOS's
 * OrganicLink). The stroke is `penWave` at the text's real width — a crest
 * every ~4.5dp, 1.2 high — centred 0.2em under the baseline, INK wide, at 70%
 * (100% while pressed, like the web's hover). `href` only seeds the wobble;
 * `onClick` decides where a tap goes.
 *
 * The box is the text's own CSS line box (`line-height: normal`: Compose
 * lines take the fallback face's height too, so Han labels stand taller than
 * Latin ones, like in the browser); Compose already reaches a 48dp touch
 * target past it, short of the neighbouring link's.
 */
@Composable
fun OrganicLink(
    text: String,
    href: String,
    modifier: Modifier = Modifier,
    sizeSp: Float = 16f,
    onClick: () -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val opacity by animateFloatAsState(if (pressed) 1f else 0.7f, tween(160), label = "organicLinkUnderline")
    val seed = remember(href) { seedFromString(href).toDouble() }
    var baseline by remember { mutableFloatStateOf(Float.NaN) }
    Box(
        modifier
            .clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onClick)
            .drawWithCache {
                val stroke = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                val underline = penWave((size.width / density).toDouble(), seed).toPath(density)
                onDrawBehind {
                    // Under the letters, not under the line box: 0.2em below the baseline.
                    val y = if (baseline.isNaN()) size.height - 3.dp.toPx() else baseline + sizeSp.sp.toPx() * 0.2f
                    translate(top = y) { drawPath(underline, Tokens.Terracotta, alpha = opacity, style = stroke) }
                }
            },
    ) {
        BasicText(
            text,
            // Short links stay whole (white-space: nowrap), so the stroke is one line.
            style = AppFonts.body(sizeSp, color = Tokens.Terracotta).copy(lineHeight = TextUnit.Unspecified, lineHeightStyle = null),
            maxLines = 1,
            softWrap = false,
            onTextLayout = { baseline = it.firstBaseline },
        )
    }
}

/**
 * OrganicButton: a filled wobbly pill with the buttons' grain, and never a pen line — an outline
 * marks a floating surface, a container or an input, not a button ([ButtonVariant] says which
 * face). A press spreads the web's hover wash from the touch point ([OrganicIndication], the same
 * ink every control uses); a disabled button fades to the web's 0.45, one in progress keeps its
 * face and shows its loader ([ButtonLoader]). Its
 * content sits in the middle of the pill, however wide the caller makes it.
 */
@Composable
fun OrganicButton(
    title: String,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.Solid,
    icon: IconName? = null,
    /** A brand mark (Google's) drawn as it is, instead of a hand-drawn glyph. */
    image: Painter? = null,
    enabled: Boolean = true,
    /** OrganicButton.tsx's `size="sm"`: tighter padding and 14px, for dialogs and dense rows. */
    small: Boolean = false,
    /** Just the glyph (the /me pen chip): `title` becomes its accessible name. */
    iconOnly: Boolean = false,
    /** The glyph's size, when the design asks for another than 16 (17 in an icon-only chip). */
    iconSize: Dp? = null,
    /** Flip the glyph (arrow-right as "back": the web's `transform: scaleX(-1)`). */
    mirrorIcon: Boolean = false,
    /** An icon-only chip at the size's own padding (sm: 9×18) instead of the tight 9×11. */
    roomy: Boolean = false,
    /**
     * The brand [image] on a small white wobbly disc (30, the mark 18 on it):
     * Google's G keeps the white ground its guidelines ask for on a filled pill.
     */
    markOnDisc: Boolean = false,
    /**
     * A provider button that fills its row (the sign-in sheet's; the web's
     * `block`): full width, at least 52 tall, 16 in from its ends, a 16 label
     * that keeps to one line by shrinking to 85% before it wraps.
     */
    block: Boolean = false,
    /**
     * Working on the last tap (design note B6): the label stays, a [ButtonLoader] takes the glyph's
     * place (or stands 6 before the label, the pair kept centred), the face keeps its full colour
     * and its size, and the button takes no tap — TalkBack hears it as busy.
     */
    loading: Boolean = false,
    onClick: () -> Unit,
) {
    val active = enabled && !loading
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val haptic = LocalHapticFeedback.current
    val face = ButtonFace.of(variant)
    val text = face.label
    val overlay = face.press
    val shape = remember(variant) { OrganicButtonShape(face.seed) }
    val padding = when {
        iconOnly && roomy -> if (small) PaddingValues(horizontal = 18.dp, vertical = 9.dp) else PaddingValues(horizontal = 32.dp, vertical = 14.dp)
        iconOnly -> PaddingValues(horizontal = 11.dp, vertical = 9.dp)
        small -> PaddingValues(horizontal = 18.dp, vertical = 9.dp)
        block -> PaddingValues(horizontal = 16.dp, vertical = 12.dp)
        else -> PaddingValues(horizontal = 32.dp, vertical = 14.dp)
    }
    Row(
        modifier
            .then(if (block) Modifier.fillMaxWidth().heightIn(min = 52.dp) else Modifier)
            .fade(if (loading || enabled) 1f else ButtonFace.DISABLED_ALPHA)
            .scale(if (pressed) 0.97f else 1f)
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                val grain = Grain.brush(GrainMode.Tile, face.grainTile, size, density, face.grainAlpha)
                onDrawBehind {
                    drawOutline(o, face.fill)
                    grain?.let { drawOutline(o, it, alpha = face.grainAlpha) }
                }
            }
            // The web's hover brush as a press: ink spreading from the finger, inside the pill.
            .clickable(interaction, indication = remember(overlay, shape) { OrganicIndication(overlay, shape = shape) }, enabled = active, role = Role.Button) {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .then(if (iconOnly) Modifier.semantics { contentDescription = title } else Modifier)
            .then(if (loading) Modifier.semantics { stateDescription = L10n.App.busy } else Modifier)
            .padding(padding),
        verticalAlignment = Alignment.CenterVertically,
        // A glyph sits 6 from its label (design note §7); a brand mark in its own 10-gap span (signin/page.tsx).
        // Centred, so a pill wider than its content (a block) keeps it in the middle.
        horizontalArrangement = Arrangement.spacedBy(if (image != null) 10.dp else 6.dp, Alignment.CenterHorizontally),
    ) {
        if (icon != null) {
            val glyph = iconSize ?: if (iconOnly) 17.dp else 16.dp
            val drop = if (iconOnly) Modifier else Modifier.offset(y = labelInkDrop(if (block) 16f else if (small) 14f else 15f))
            // In progress, the loop takes the glyph's place at its size.
            if (loading) ButtonLoader(text, glyph, drop) else OrganicIcon(icon, drop, size = glyph, color = text, mirrored = mirrorIcon)
        }
        if (image != null && loading) {
            Box(Modifier.size(if (markOnDisc) 30.dp else 18.dp), contentAlignment = Alignment.Center) { ButtonLoader(text, 18.dp) }
        } else if (image != null) {
            // The same disc as the web's (signin/page.tsx) and iOS's: seed 12, 8 segments, mag 0.7.
            if (markOnDisc) Box(
                Modifier.size(30.dp).drawWithCache {
                    val o = WobCircleShape(12.0, WobCircleOptions(segments = 8, mag = 0.7, cpJitter = 0.4)).createOutline(size, layoutDirection, this)
                    onDrawBehind { drawOutline(o, Color.White) }
                },
                contentAlignment = Alignment.Center,
            ) { Image(image, contentDescription = null, modifier = Modifier.size(18.dp)) }
            else Image(image, contentDescription = null, modifier = Modifier.size(18.dp))
        }
        if (!iconOnly) {
            val style = if (block) AppFonts.body(16f, 600, lineHeight = 1.25f, color = text).copy(letterSpacing = 0.02.em, textAlign = TextAlign.Center)
                else AppFonts.body(if (small) 14f else 15f, 600, lineHeight = 1.3f, color = text).copy(letterSpacing = 0.02.em)
            // A block's label takes the largest step down to 85% that fits one line, then wraps at 85%.
            val autoSize = if (block) remember(style.fontSize) { OneLineFirst(style.fontSize) } else null
            val label: @Composable () -> Unit = { BasicText(title, style = style, autoSize = autoSize) }
            // Nothing for the loop to stand in for: it goes 6 before the label, outside the label's
            // measured room, and the two slide half that over so the pair stays centred.
            if (icon == null && image == null) LoaderBeforeLabel(loading, text, if (small) ButtonLoaderSmall else ButtonLoaderSize, label)
            else label()
        }
    }
}

/** The button loop's box: 16 in md and lg buttons, 14 in sm (design note B6). */
val ButtonLoaderSize = 16.dp
val ButtonLoaderSmall = 14.dp

/**
 * A label that a [ButtonLoader] stands before while [loading]: the loop [size] wide, 6 before the
 * label's start, drawn outside the label's measured width; both slide (size + 6) / 2 toward the
 * end so the pair keeps the label's centre — the button measures the same either way. The loop
 * fades in and the label slides in 120 ms (at once with animations off).
 */
@Composable
private fun LoaderBeforeLabel(loading: Boolean, color: Color, size: Dp, label: @Composable () -> Unit) {
    val context = LocalContext.current
    val still = remember(context) { context.prefersReducedMotion() }
    val shown by animateFloatAsState(if (loading) 1f else 0f, tween(if (still) 0 else 120, easing = ButtonEaseOut), label = "buttonLoader")
    val density = LocalDensity.current
    val shiftPx = with(density) { ((size + 6.dp) / 2).toPx() }
    Box(Modifier.graphicsLayer { translationX = shiftPx * shown }, contentAlignment = Alignment.CenterStart) {
        label()
        if (shown > 0f) ButtonLoader(color, size, Modifier.offset(x = -(size + 6.dp)).alpha(shown))
    }
}

/** CSS `ease-out`, the label's slide. */
private val ButtonEaseOut = androidx.compose.animation.core.CubicBezierEasing(0f, 0f, 0.58f, 1f)

/**
 * ButtonLoader (design note B6): a pen loop drawing itself round inside a button in progress —
 * SketchLoader's caravan on one lap. A wobbly circle (wobCircle, r 0.36 of the box, seed 29, six
 * turns) carries four links, each 0.17 of the loop, nose to tail, α 0.22 → 1 back to front, one trip
 * every 1100 ms; the pen is INK whatever the box, joins round, only the leading link's cap round.
 * With animations off it rests as the whole loop at 0.75. In the label's own [color]; decoration
 * only (the button says it is busy).
 */
@Composable
fun ButtonLoader(color: Color, size: Dp = ButtonLoaderSize, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val still = remember(context) { context.prefersReducedMotion() }
    val t = if (still) null else rememberInfiniteTransition(label = "buttonLoop").animateFloat(
        0f, 1f, infiniteRepeatable(tween(BUTTON_LOOP_MILLIS, easing = LinearEasing)), label = "t",
    )
    Canvas(modifier.size(size).clearAndSetSemantics { }) {
        val box = size.value.toDouble()
        val c = box / 2
        val path = wobCircle(c, c, 0.36 * box, 29.0, WobCircleOptions(segments = 6, mag = 0.035 * box, cpJitter = 0.6)).toPath(density)
        val pen = Tokens.Ink.toPx()
        if (t == null) {
            drawPath(path, color.copy(alpha = color.alpha * 0.75f), style = Stroke(pen, cap = StrokeCap.Round, join = StrokeJoin.Round))
            return@Canvas
        }
        val measure = PathMeasure().apply { setPath(path, false) }
        val length = measure.length
        ButtonLoopLinks.forEachIndexed { k, alpha ->
            val head = (t.value + k * BUTTON_LINK) % 1f
            val end = head + BUTTON_LINK
            val seg = Path()
            measure.getSegment(head * length, minOf(end, 1f) * length, seg, true)
            if (end > 1f) measure.getSegment(0f, (end - 1f) * length, seg, true)
            val cap = if (k == ButtonLoopLinks.lastIndex) StrokeCap.Round else StrokeCap.Butt
            drawPath(seg, color.copy(alpha = color.alpha * alpha), style = Stroke(pen, cap = cap, join = StrokeJoin.Round))
        }
    }
}

/** The button loop's links back to front, and each one's share of the loop. */
private val ButtonLoopLinks = listOf(0.22f, 0.42f, 0.68f, 1f)
private const val BUTTON_LINK = 0.17f
private const val BUTTON_LOOP_MILLIS = 1100

/**
 * How far below its line box's middle a label's ink sits (design note §7): about 0.06em for our
 * faces, Latin and CJK alike — so a glyph beside the label is set that much lower, and reads level
 * with the words instead of high. In the label's own sp, so it follows the text size.
 */
@Composable
fun labelInkDrop(fontSizeSp: Float): Dp = with(LocalDensity.current) { (fontSizeSp * 0.06f).sp.toDp() }

/**
 * A block button's label size: the first of 100, 95, 90 and 85% of [size]
 * that lays the label out on one line; if none does, it wraps at 85% (a long
 * provider label at a large text size on a narrow phone).
 */
private class OneLineFirst(private val size: TextUnit) : TextAutoSize {
    override fun TextAutoSizeLayoutScope.getFontSize(constraints: Constraints, text: AnnotatedString): TextUnit {
        for (step in OneLineSteps) {
            if (performLayout(constraints, text, size * step).lineCount <= 1) return size * step
        }
        return size * OneLineSteps.last()
    }

    override fun equals(other: Any?) = other is OneLineFirst && other.size == size
    override fun hashCode() = size.hashCode()
}

private val OneLineSteps = floatArrayOf(1f, 0.95f, 0.9f, 0.85f)

/**
 * Fade a hand-drawn control as a whole (disabled, busy) without cutting it:
 * `Modifier.alpha` draws into a layer the size of the box, and a pen line's
 * wobble — or half its stroke — lies outside the box and would be clipped
 * straight. This fades each drawing instead.
 */
fun Modifier.fade(alpha: Float): Modifier =
    if (alpha >= 1f) this else graphicsLayer { this.alpha = alpha; compositingStrategy = CompositingStrategy.ModulateAlpha }

/**
 * A button's rank, as the web's OrganicButton names them — every one a fill, none a pen line, and
 * none see-through (a bare word does not read as something to press):
 *  - [Solid] the verb: deep terracotta, cream label — Publish, Send, Confirm, the page's one call
 *    to action. [Primary] is its older name.
 *  - [Tonal] everything beside it: a soft peach face with a deep terracotta label — a secondary
 *    action (Sign out, Retry), Cancel / Keep / Close, Download, Load more, Unblock. [Ghost],
 *    [Outline], [Text] and [TextAccent] (the names those call sites carry) wear it too.
 *  - [Danger] solid in red: the final confirm of what can't be undone.
 *  - [DangerTonal] the peach's red twin: a button that opens a destructive flow (Settings' Delete
 *    account), whose dialog then asks with [Danger].
 *  - [Ink] solid in the ink colour, for a brand that asks for a black button (Sign in with Apple).
 *  - [Paper] the cards' paper with their grain, for a control that has to match a paper surface.
 * Bare text is left to a link in running text and to icon-only header and toolbar glyphs.
 */
enum class ButtonVariant { Primary, Ghost, Outline, Solid, Ink, Danger, Paper, Text, TextAccent, Tonal, DangerTonal }

/**
 * How a [ButtonVariant] is drawn (OrganicButton.tsx's BTN_VARIANTS): its [fill], its [label]
 * colour, the ink a press spreads ([press]: a filled face darkens, a tinted one takes a wash of
 * its own hue), the grain tile over it and the seed it wobbles by (the web's BTN_SEEDS — each rank
 * keeps the wobble of the variant it grew out of).
 */
class ButtonFace private constructor(
    val fill: Color,
    val label: Color,
    val press: Color,
    val seed: Double,
    val grainTile: String = "grain-button",
    val grainAlpha: Float = 0.38f,
) {
    companion object {
        /** Not pressable yet: the face stays, faded (the web's `:disabled`). */
        const val DISABLED_ALPHA = 0.45f

        private val Solid = ButtonFace(Mixes.ButtonFill, Tokens.Cream, OrganicIndication.OnFill, 3.0)
        private fun tonal(seed: Double) = ButtonFace(Mixes.ButtonTonal, Mixes.ButtonOnTonal, OrganicIndication.Wash, seed)

        fun of(variant: ButtonVariant): ButtonFace = when (variant) {
            ButtonVariant.Primary, ButtonVariant.Solid -> Solid
            ButtonVariant.Ghost, ButtonVariant.Text -> tonal(401.0)
            ButtonVariant.Outline, ButtonVariant.TextAccent, ButtonVariant.Tonal -> tonal(601.0)
            ButtonVariant.Danger -> ButtonFace(Mixes.DangerFill, Tokens.Cream, OrganicIndication.OnFill, 3.0)
            ButtonVariant.DangerTonal -> ButtonFace(Mixes.ButtonDangerTonal, Mixes.ButtonOnDangerTonal, Mixes.Danger.copy(alpha = 0.14f), 601.0)
            ButtonVariant.Ink -> ButtonFace(Tokens.Text, Tokens.Cream, OrganicIndication.OnFill, 3.0)
            // Paper carries the cards' own grain (the Modal's).
            ButtonVariant.Paper -> ButtonFace(Tokens.CardBg, Tokens.Text, OrganicIndication.Wash, 401.0, grainTile = "grain-card", grainAlpha = 0.3f)
        }
    }
}

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
 * control (arrow-right mirrored, 18px, no frame); `mirrored` flips it. The
 * header's other actions (share, ⋯) are bare glyphs too: a bar is chrome
 * enough, so nothing in it draws a frame of its own.
 */
@Composable
fun OrganicIconButton(icon: IconName, label: String, mirrored: Boolean = false, size: Dp = 18.dp, color: Color = Tokens.Text, onClick: () -> Unit) {
    Box(
        Modifier
            .size(48.dp)
            // A press washes a wobbly squircle round the glyph, inside the hit box.
            .clickable(interactionSource = null, indication = OrganicIndication(inset = 4.dp), role = Role.Button, onClickLabel = label, onClick = onClick)
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
    Canvas(Modifier.size(size).semantics { contentDescription = L10n.Home.moreLoading }) {
        val path = loaderLoop(size, density)
        val pen = loaderPen(size)
        if (t == null) {
            drawPath(path, color.copy(alpha = LOOP_AT_REST), style = Stroke(pen, cap = StrokeCap.Round, join = StrokeJoin.Round))
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

/**
 * The loader's loop drawn as far as [drawn] (0…1, read as it draws: a pull's progress) — the same
 * two wobbly laps SketchLoader's dashes travel, in the loop's resting ink, so a loop drawn to its
 * end is the reduced-motion loader.
 */
@Composable
fun SketchLoaderLoop(drawn: () -> Float, size: Dp = 56.dp, color: Color = Tokens.Terracotta) {
    Canvas(Modifier.size(size)) {
        val part = drawn().coerceIn(0f, 1f)
        if (part <= 0f) return@Canvas
        val path = loaderLoop(size, density)
        val measure = PathMeasure().apply { setPath(path, false) }
        val seg = Path()
        measure.getSegment(0f, part * measure.length, seg, true)
        drawPath(seg, color.copy(alpha = LOOP_AT_REST), style = Stroke(loaderPen(size), cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

/** The loader's two-lap wobbly loop at [size] (seed 7: every loader is the same sketch). */
private fun loaderLoop(size: Dp, density: Float): Path {
    val c = size.value / 2.0
    return wobLoop(c, c, size.value * 0.34, size.value * 0.27, 7.0, WobLoopOptions(segments = 9, mag = size.value * 0.03, cpJitter = 0.7)).toPath(density)
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.loaderPen(size: Dp): Float = size.toPx() * 0.036f

/** The whole loop at rest (the web's reduced-motion sketch), and a pull drawing it. */
private const val LOOP_AT_REST = 0.7f

/**
 * How an empty state's action reads: the verb's solid pill (only "write your first card"), or the
 * tonal one (Retry, a not-found page's way home: `Outline`, its older name) — every action a
 * filled button, as on the web.
 */
enum class EmptyAction { Primary, Outline }

/**
 * The one empty state (design note §1; the web's EmptyState, iOS's OrganicEmptyState): an
 * optional [icon] on a small paper blob (the avatar recipe at 64, [seed]), an optional title in
 * the heading face, one quiet line, then the action — a column at most 340 wide, centred, 24 in
 * from the sides, the same gaps on every page. With [fill] it takes all the height it is given
 * (a list passes `fillParentMaxHeight()`), at least 300, and puts its middle at 45% of it;
 * without, it keeps [verticalPadding] above and below. The not-found and error pages call it
 * without a mark and keep their own title size.
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
    icon: IconName? = null,
    seed: Double = 23.0,
    fill: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val content: @Composable () -> Unit = {
        Column(
            Modifier.widthIn(max = EmptyStateColumn).padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val center = TextAlign.Center
            if (icon != null) {
                EmptyMark(icon, seed)
                Box(Modifier.height(if (title != null) 18.dp else 14.dp))
            }
            if (title != null) {
                val size = if (icon != null) 20f else titleSize
                BasicText(
                    title,
                    style = AppFonts.heading(size, 400, lineHeight = 1.3f).copy(textAlign = center),
                    modifier = if (icon != null) Modifier.semantics { heading() } else Modifier,
                )
            }
            if (message != null) {
                if (title != null) Box(Modifier.height(8.dp))
                val style = if (icon != null) AppFonts.body(14.5f, lineHeight = 1.6f, color = Tokens.TextMuted)
                    else AppFonts.body(16f, lineHeight = 1.6f, color = Tokens.TextMuted)
                BasicText(message, style = style.copy(textAlign = center))
            }
            if (actionTitle != null && onAction != null) {
                Box(Modifier.height(20.dp))
                when (action) {
                    EmptyAction.Primary -> OrganicButton(actionTitle, small = icon != null, onClick = onAction)
                    EmptyAction.Outline -> OrganicButton(actionTitle, variant = ButtonVariant.Tonal, small = icon != null, onClick = onAction)
                }
            }
        }
    }
    if (fill) {
        // The middle a little above the middle: 45% down whatever height the region has.
        Layout(content, modifier.fillMaxWidth().heightIn(min = 300.dp)) { measurables, constraints ->
            val p = measurables.first().measure(constraints.copy(minWidth = 0, minHeight = 0))
            val h = if (constraints.hasBoundedHeight) max(constraints.maxHeight, p.height) else max(constraints.minHeight, p.height)
            val w = constraints.maxWidth
            layout(w, h) {
                val y = (h * 0.45f - p.height / 2f).toInt().coerceIn(0, max(0, h - p.height))
                p.place((w - p.width) / 2, y)
            }
        }
    } else {
        Box(modifier.fillMaxWidth().padding(vertical = verticalPadding), contentAlignment = Alignment.TopCenter) { content() }
    }
}

/** An empty state's column: never wider than this, however wide the screen. */
private val EmptyStateColumn = 340.dp

/**
 * The empty state's mark: the glyph (28, the tonal label's ink) on a 64 blob — HandDrawnAvatar's
 * outline at 64 — of terracotta-light at half strength with the paper's grain, no pen line.
 * Decorative: the words beside it say everything.
 */
@Composable
private fun EmptyMark(icon: IconName, seed: Double) {
    val shape = remember(seed) {
        WobRectShape(
            25.6, seed, mag = 1.41,
            options = WobRectOptions(curve = 1.3, cornerJitter = 3.2, cornerOffset = 3.84, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0)),
        )
    }
    Box(
        Modifier
            .size(64.dp)
            .clearAndSetSemantics { }
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                val grain = Grain.brush(GrainMode.Tile, "grain-card", size, density, 0.3f)
                onDrawBehind {
                    drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.5f))
                    grain?.let { drawOutline(o, it, alpha = 0.3f) }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        OrganicIcon(icon, size = 28.dp, color = Mixes.ButtonOnTonal, strokeWidth = Tokens.Ink.value)
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
