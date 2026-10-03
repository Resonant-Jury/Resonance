package com.resonance.design

import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.text.Layout
import android.text.SpannableString
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.text.style.TypefaceSpan
import android.text.style.UnderlineSpan
import android.graphics.text.LineBreaker
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.CornerRadii
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobCircleOptions
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.jsRound
import com.resonance.kit.chat.RunPosition
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * MessageBubble's seedFromId: a Java-style string hash over UTF-16 units
 * (Int wrapping), folded into 1…9973. Bubbles start from 7; a shared card's
 * embed starts from 11. ("m1" → 183, "card-77" from 11 → 6326.) The twin of
 * iOS's seedFromId.
 */
fun seedFromId(id: String, start: Int = 7): Double {
    var h = start
    for (unit in id) h = h * 31 + unit.code
    return (abs(h % 9973) + 1).toDouble()
}

/** The radius of a bubble's corner that faces its neighbour in a run (the others keep the full one). */
private const val TUCKED_RADIUS = 5.0

/**
 * MessageBubble's outline: its wobble follows its own size — radius
 * min(16, h·0.42), swing min(2.6, h·0.05), a turn per 80 across (2–6) and per
 * 52 down (1–8), bow 1.3, corner jitter 1.6, corners pulled in 4%.
 *
 * A bubble in a run of messages from one person (Messenger's stacking) tucks the corners that face
 * its neighbours, on the sender's side — the right for your own, the left for theirs: the first of a
 * run tucks its bottom one, a middle one both, the last its top one ([RunPosition]).
 */
class MessageBubbleShape(
    private val seed: Double,
    private val mine: Boolean = true,
    private val run: RunPosition = RunPosition.Single,
    /** The ghost of a quoted message: a little rounder-edged and smaller, same family. */
    private val maxRadius: Double = 16.0,
) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val d = density.density
        val w = (size.width / d).toDouble()
        val h = (size.height / d).toDouble()
        if (w <= 0 || h <= 0) return Outline.Rectangle(Rect.Zero)
        val across = min(6.0, max(2.0, jsRound(w / 80)))
        val down = min(8.0, max(1.0, jsRound(h / 52)))
        val radius = min(maxRadius, h * 0.42)
        val tucked = min(TUCKED_RADIUS, radius)
        val top = if (run.joinsAbove) tucked else radius
        val bottom = if (run.joinsBelow) tucked else radius
        val radii = if (mine) CornerRadii(radius, top, bottom, radius) else CornerRadii(top, radius, radius, bottom)
        return WobRectShape(
            radius, seed, mag = min(2.6, h * 0.05),
            options = WobRectOptions(
                curve = 1.3, cornerJitter = 1.6, cornerOffset = min(w, h) * 0.04,
                segmentsH = SegValue.Count(across), segmentsV = SegValue.Count(down),
                cornerRadii = if (run == RunPosition.Single) null else radii,
            ),
        ).createOutline(size, layoutDirection, density)
    }
}

/** A bubble's fill and line: your own on a terracotta-light wash, theirs on cream with a thin field line (1.1, the web's own number). */
private fun Modifier.bubbleFace(shape: () -> MessageBubbleShape, mine: Boolean, flash: () -> Float, quiet: Boolean = false): Modifier = drawWithCache {
    val o = shape().createOutline(size, layoutDirection, this)
    val line = Stroke(1.1.dp.toPx(), join = StrokeJoin.Round)
    onDrawBehind {
        // Your own bubble is the wash over a cream ground of its own, so what lies under it (a quoted
        // message it overlaps) never shows through.
        if (quiet) {
            drawOutline(o, Tokens.CreamDark, alpha = 0.55f)
            drawOutline(o, Tokens.FieldBorder, alpha = 0.55f, style = line)
        } else if (mine) {
            drawOutline(o, Tokens.Cream)
            drawOutline(o, Tokens.TerracottaLight, alpha = 0.62f)
        } else {
            drawOutline(o, Tokens.Cream)
            drawOutline(o, Tokens.FieldBorder, style = line)
        }
        val pulse = flash()
        if (pulse > 0f) drawOutline(o, Tokens.Terracotta, alpha = 0.3f * pulse)
    }
}

/**
 * A message's bubble (MessageBubble.tsx): 14/1.65 text, padding 10×16, your
 * own on a terracotta-light wash, theirs on cream with a thin field line (1.1,
 * the web's own number). It hugs its words. A reply to a note wears a small
 * italic header (`quoteLabel`).
 *
 * The words are drawn by [ChatText]: [links] (ranges of [text]) are terracotta and underlined and a
 * tap on one calls [onLinkTap] with its index; [highlights] are the matches of a search, washed (the
 * [highlightStrong] ones are the hit being looked at); [flash] (0…1, read while drawing) pulses the
 * whole bubble — the one a reply's quote jumped to. [onLongPress] gets the index of the link
 * pressed, if it was on one.
 */
@Composable
fun MessageBubble(
    text: String,
    mine: Boolean,
    seed: Double,
    modifier: Modifier = Modifier,
    quoteLabel: String? = null,
    run: RunPosition = RunPosition.Single,
    links: List<IntRange> = emptyList(),
    highlights: List<IntRange> = emptyList(),
    highlightStrong: Boolean = false,
    flash: () -> Float = { 0f },
    onLinkTap: ((Int) -> Unit)? = null,
    onLongPress: ((Int?) -> Unit)? = null,
) {
    val longPress by rememberUpdatedState(onLongPress)
    Column(
        modifier
            .bubbleFace({ MessageBubbleShape(seed, mine, run) }, mine, flash)
            .then(
                if (onLongPress != null) Modifier
                    .pointerInput(Unit) { detectTapGestures(onLongPress = { longPress?.invoke(null) }) }
                    // The press-and-hold is the message's whole menu: assistive tech reaches it as the long click.
                    .semantics { onLongClick { longPress?.invoke(null); true } }
                else Modifier,
            )
            .padding(vertical = 10.dp, horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (quoteLabel != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                OrganicIcon(IconName.Note, size = 13.dp, color = Tokens.TextMuted)
                BasicText(quoteLabel, style = AppFonts.oblique(AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted)))
            }
        }
        if (text.isNotEmpty()) ChatText(
            text,
            links = links,
            // The terracotta of a link would sink into your own bubble's wash.
            linkColor = if (mine) Tokens.TerracottaDeep else Tokens.Terracotta,
            highlights = highlights,
            highlightColor = highlightWash(highlightStrong),
            onTap = onLinkTap,
            onLongPress = onLongPress,
        )
    }
}

/** The wash behind a search match: the hit being looked at stronger than the others in view. */
fun highlightWash(strong: Boolean): Color = Tokens.Terracotta.copy(alpha = if (strong) 0.5f else 0.24f)

/**
 * The message a reply answers, quoted above the reply as a ghost of its bubble: smaller, muted,
 * two lines at most, on a faint fill (Messenger's reply). [text] is the quote's own words.
 */
@Composable
fun QuoteBubble(text: String, mine: Boolean, seed: Double, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Box(
        modifier
            .bubbleFace({ MessageBubbleShape(seed, mine, RunPosition.Single, maxRadius = 14.0) }, mine, { 0f }, quiet = true)
            .then(if (onClick != null) Modifier.clickable(interactionSource = null, indication = null, role = Role.Button, onClick = onClick) else Modifier)
            .padding(start = 14.dp, end = 14.dp, top = 7.dp, bottom = 9.dp),
    ) {
        ChatText(text, sizeSp = 13f, lineHeight = 1.5f, color = Tokens.TextMuted, maxLines = 2)
    }
}

/** The reply glyph and a line of who answered whom, over the quote. */
@Composable
fun ReplyCaption(text: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        OrganicIcon(IconName.Reply, size = 12.dp, color = Tokens.TextMuted)
        BasicText(text, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(11.5f, lineHeight = 1.3f, color = Tokens.TextMuted))
    }
}

// Words

/**
 * A bubble's words on CSS line boxes (the twin of [CssText], which has no spans): [links] are
 * coloured and underlined, [highlights] washed behind the glyphs on rounded rects, and a tap or
 * long-press on a link is reported by its index in [links]. Takes the text's own width when it
 * wraps (a bubble hugs its words).
 */
@Composable
fun ChatText(
    text: String,
    modifier: Modifier = Modifier,
    sizeSp: Float = 14f,
    weight: Int = 400,
    lineHeight: Float = 1.65f,
    color: Color = Tokens.Text,
    links: List<IntRange> = emptyList(),
    linkColor: Color = Tokens.Terracotta,
    highlights: List<IntRange> = emptyList(),
    highlightColor: Color = highlightWash(false),
    /** The highlighted words in a heavier face (a search result's match). */
    highlightWeight: Int? = null,
    maxLines: Int = Int.MAX_VALUE,
    onTap: ((Int) -> Unit)? = null,
    onLongPress: ((Int?) -> Unit)? = null,
) {
    val scaled = LocalDensity.current
    val density = scaled.density
    val tap by rememberUpdatedState(onTap)
    val press by rememberUpdatedState(onLongPress)
    BoxWithConstraints(modifier) {
        val widthPx = constraints.maxWidth
        val layout = remember(text, sizeSp, weight, lineHeight, widthPx, density, scaled.fontScale, color, linkColor, links, highlights, highlightWeight, maxLines, AppFonts.useBundledCJK) {
            buildChatLayout(text, sizeSp, weight, lineHeight, widthPx, scaled, color, links, linkColor, highlightWeight.takeIf { highlights.isNotEmpty() }?.let { highlights to it }, maxLines)
        }
        val widest = ceil((0 until layout.lineCount).maxOfOrNull { layout.getLineMax(it) } ?: 0f).toInt()
        val boxPx = min(layout.width, widest)
        val hit: (Float, Float) -> Int? = { x, y -> linkAt(layout, links, x, y, 6f * density) }
        Box(
            Modifier
                .width(Dp(boxPx / density))
                .height(Dp(layout.height / density))
                .semantics { this.text = AnnotatedString(text) }
                .drawBehind {
                    if (highlights.isNotEmpty()) {
                        val r = 4.dp.toPx()
                        val lift = cssFontPx(sizeSp) * 1.3f
                        for (rect in highlightRects(layout, highlights, lift, 2.dp.toPx())) {
                            drawRoundRect(highlightColor, androidx.compose.ui.geometry.Offset(rect.left, rect.top), Size(rect.width(), rect.height()), androidx.compose.ui.geometry.CornerRadius(r))
                        }
                    }
                    drawIntoCanvas { layout.draw(it.nativeCanvas) }
                }
                .then(
                    if (onTap != null || onLongPress != null) Modifier.pointerInput(layout, links) {
                        detectTapGestures(
                            onTap = { p -> hit(p.x, p.y)?.let { i -> tap?.invoke(i) } },
                            onLongPress = { p -> press?.invoke(hit(p.x, p.y)) },
                        )
                    } else Modifier,
                ),
        )
    }
}

/**
 * [CssLayout.build] with spans: the same CSS line boxes and greedy breaks, [links] coloured and
 * underlined, an optional heavier face for some ranges, and at most [maxLines] lines (cut with …).
 */
private fun buildChatLayout(
    text: String,
    sizeSp: Float,
    weight: Int,
    lineHeight: Float,
    widthPx: Int,
    density: Density,
    color: Color,
    links: List<IntRange>,
    linkColor: Color,
    heavier: Pair<List<IntRange>, Int>?,
    maxLines: Int,
): StaticLayout {
    val sizePx = density.cssFontPx(sizeSp)
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = AppFonts.typeface(AppFonts.Family.Body, weight)
        textSize = sizePx
        this.color = color.toArgb()
    }
    val spanned = SpannableString(text).apply {
        setSpan(CssLineHeightSpan(sizePx * lineHeight, paint.fontMetrics), 0, text.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
        for (r in links) {
            val (a, b) = clamp(r, text.length) ?: continue
            setSpan(ForegroundColorSpan(linkColor.toArgb()), a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            setSpan(UnderlineSpan(), a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        heavier?.let { (ranges, w) ->
            val face: Typeface = AppFonts.typeface(AppFonts.Family.Body, w)
            for (r in ranges) {
                val (a, b) = clamp(r, text.length) ?: continue
                setSpan(TypefaceSpan(face), a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }
    }
    val b = StaticLayout.Builder.obtain(spanned, 0, text.length, paint, widthPx)
        .setAlignment(Layout.Alignment.ALIGN_NORMAL)
        .setIncludePad(false)
        .setUseLineSpacingFromFallbacks(false)
        .setBreakStrategy(LineBreaker.BREAK_STRATEGY_SIMPLE)
        .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
    if (maxLines != Int.MAX_VALUE) b.setMaxLines(maxLines).setEllipsize(TextUtils.TruncateAt.END).setEllipsizedWidth(widthPx)
    if (Build.VERSION.SDK_INT >= 35) b.setUseBoundsForWidth(false)
    return b.build()
}

/** A UTF-16 range (both ends inclusive) as a span's [start, end) inside the text; null when nothing of it is in the text. */
private fun clamp(r: IntRange, length: Int): Pair<Int, Int>? {
    val a = r.first.coerceAtLeast(0)
    val b = (r.last + 1).coerceAtMost(length)
    return if (a < b) a to b else null
}

/** The link under the point (x, y) of the text, if any; `slop` is the room round a line's words that still counts. */
private fun linkAt(layout: StaticLayout, links: List<IntRange>, x: Float, y: Float, slop: Float): Int? {
    if (links.isEmpty() || y < 0 || y > layout.height) return null
    val line = layout.getLineForVertical(y.toInt())
    val left = layout.getLineLeft(line)
    if (x < left - slop || x > left + layout.getLineMax(line) + slop) return null
    val offset = layout.getOffsetForHorizontal(line, x.coerceIn(left, left + layout.getLineMax(line)))
    // The offset is a gap between two characters: the character the finger is on is the one it is nearer.
    val at = if (offset > 0 && layout.getPrimaryHorizontal(offset) - x > 0) offset - 1 else offset
    return links.indexOfFirst { at in it }.takeIf { it >= 0 }
}

/**
 * Where each highlighted range falls: one rect per line it crosses, as tall as the glyphs (`lift`),
 * centred on the line box, `grow` wider than the words at each end.
 */
private fun highlightRects(layout: StaticLayout, ranges: List<IntRange>, lift: Float, grow: Float): List<RectF> {
    val out = ArrayList<RectF>()
    val length = layout.text.length
    for (r in ranges) {
        val (a, b) = clamp(r, length) ?: continue
        val first = layout.getLineForOffset(a)
        val last = layout.getLineForOffset(b - 1)
        for (line in first..last) {
            // A line cut with … has nothing drawn past its end.
            if (line >= layout.lineCount) break
            val start = if (line == first) a else layout.getLineStart(line)
            val end = if (line == last) b else layout.getLineEnd(line)
            if (end <= start) continue
            val left = layout.getPrimaryHorizontal(start)
            val right = if (end >= layout.getLineEnd(line)) layout.getLineLeft(line) + layout.getLineMax(line) else layout.getPrimaryHorizontal(end)
            if (right <= left) continue
            val mid = (layout.getLineTop(line) + layout.getLineBottom(line)) / 2f
            out += RectF(left - grow, mid - lift / 2, right + grow, mid + lift / 2)
        }
    }
    return out
}

// Link preview

/**
 * The unfurled page under a message with a link (every chat app's): at most 280 wide, in the
 * embedded-card family's frame, the picture on top at 1.91:1 when there is one, then the title
 * (two lines), a description (two) and the host with the link glyph. A press inks it like a card.
 * [host] is the ASCII host the tap leads to, as the app would name it in its confirm.
 */
@Composable
fun LinkPreviewCard(
    title: String,
    description: String?,
    host: String,
    imageUrl: String?,
    seed: Double,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Column(
        modifier
            .widthIn(max = 280.dp)
            .scale(if (pressed) 0.985f else 1f)
            .drawWithCache {
                val o = WobRectShape(16.0, seed).createOutline(size, layoutDirection, this)
                val s = Stroke(Tokens.Ink.toPx())
                onDrawBehind {
                    drawOutline(o, Tokens.CardBg)
                    drawOutline(o, Tokens.FieldBorderHover, alpha = 0.6f, style = s)
                }
            }
            .clickable(source, indication = null, role = Role.Button, onClick = onClick)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // A picture that won't load (gone, refused by the proxy) takes its frame with it: no empty grey box.
        var imageFailed by remember(imageUrl) { mutableStateOf(false) }
        if (imageUrl != null && !imageFailed) {
            OrganicImage(imageUrl, seed + 5, Modifier.fillMaxWidth().aspectRatio(1.91f), grain = 0.03f, onError = { imageFailed = true }) {
                Box(Modifier.fillMaxSize().background(Tokens.CreamDark))
            }
        }
        Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.body(14f, 600, lineHeight = 1.35f))
            if (description != null) {
                BasicText(description, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12.5f, lineHeight = 1.45f, color = Tokens.TextMuted))
            }
            Row(Modifier.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                OrganicIcon(IconName.Link, size = 12.dp, color = Tokens.TextMuted)
                BasicText(host, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(11f, lineHeight = 1.3f, color = Tokens.TextMuted))
            }
        }
    }
}

// Send

/**
 * The composer's Send: a wobbly terracotta disc with the paper plane in cream. It is the verb of the
 * bar, so it is a solid face with the buttons' grain and no pen line of its own. Dimmed and deaf
 * until there is something to send — never held by a send in flight.
 */
@Composable
fun OrganicSendButton(label: String, enabled: Boolean, modifier: Modifier = Modifier, size: Dp = 44.dp, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val haptic = LocalHapticFeedback.current
    val shape = remember { WobCircleShape(23.0, WobCircleOptions(segments = 8, mag = 0.9, cpJitter = 0.4)) }
    Box(
        modifier
            .size(size)
            .fade(if (enabled) 1f else 0.45f)
            .scale(if (pressed) 0.95f else 1f)
            .drawWithCache {
                val o = shape.createOutline(this.size, layoutDirection, this)
                val grain = Grain.brush(GrainMode.Tile, "grain-button", this.size, density, 0.38f)
                onDrawBehind {
                    drawOutline(o, Tokens.Terracotta)
                    grain?.let { drawOutline(o, it, alpha = 0.38f) }
                }
            }
            .clickable(source, indication = remember(shape) { OrganicIndication(OrganicIndication.OnFill, shape = shape) }, enabled = enabled, role = Role.Button, onClickLabel = label) {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        // The plane's weight sits low and to the left of its box: a step right and up to read as centred.
        OrganicIcon(IconName.Send, Modifier.offset(x = 1.dp, y = (-1).dp), size = 20.dp, color = Tokens.Cream)
    }
}

/** A reply's rule in the composer: a short vertical pen line in terracotta, wavy like the headers' edges. */
@Composable
fun ReplyRule(modifier: Modifier = Modifier, seed: Double = 31.0) {
    Box(
        modifier
            .width(6.dp)
            .clearAndSetSemantics { }
            .drawWithCache {
                val h = size.height / density
                val line = com.resonance.geometry.wavyVertical(h.toDouble(), seed, 1.1, max(3, (h / 9).toInt())).toPath(density, size.width / 2, 0f)
                val pen = Stroke(2.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round)
                onDrawBehind { drawPath(line, Tokens.Terracotta, style = pen) }
            },
    )
}
