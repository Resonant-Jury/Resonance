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
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
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
import coil3.compose.AsyncImage
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.CornerRadii
import com.resonance.geometry.SegValue
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

/** A bubble's full corner radius (a one-line bubble takes h·0.42 of it: nearly a pill). */
private const val BUBBLE_RADIUS = 18.0
/** The radius of a bubble's corner that faces its neighbour in a run (the others keep the full one). */
private const val TUCKED_RADIUS = 4.0
/** The quoted message over a reply: one shape on its own, a little rounder-cornered than a bubble is tall. */
private const val QUOTE_RADIUS = 16.0

/**
 * MessageBubble's outline — the same recipe on the web and iOS: its wobble follows its own size —
 * radius min(18, h·0.42), swing min(2.6, h·0.05), a turn per 80 across (2–6) and per 52 down
 * (1–8), bow 1.3, corner jitter 1.6, corners pulled in 4%.
 *
 * A bubble in a run of messages from one person (Messenger's stacking) tucks the corners that face
 * its neighbours to a radius of 4, on the sender's side — the right for your own, the left for
 * theirs: the first of a run tucks its bottom one, a middle one both, the last its top one
 * ([RunPosition]). A bubble that carries a preview or a card is still one shape, and tucks the same.
 */
class MessageBubbleShape(
    private val seed: Double,
    private val mine: Boolean = true,
    private val run: RunPosition = RunPosition.Single,
    private val maxRadius: Double = BUBBLE_RADIUS,
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

/**
 * The bubble's stand-in while what it carries is read (a shared card): a plain rounded box of the
 * same footprint and corners — never a wobble measured before its content is there.
 */
private fun plainBubbleShape(mine: Boolean, run: RunPosition): Shape {
    val r = BUBBLE_RADIUS.dp
    val t = TUCKED_RADIUS.dp
    val top = if (run.joinsAbove) t else r
    val bottom = if (run.joinsBelow) t else r
    return if (mine) RoundedCornerShape(r, top, bottom, r) else RoundedCornerShape(top, r, r, bottom)
}

/** A bubble's paper: your own a warm terracotta wash, theirs a deeper paper than the page — both opaque. */
fun bubbleFill(mine: Boolean): Color = if (mine) Tokens.BubbleMine else Tokens.BubbleTheirs

/**
 * A bubble's face: its fill, with no pen line (Messenger's flat bubbles, in the paper's own
 * colours), and everything it holds clipped to its wobbly outline — so a picture inside runs edge
 * to edge and ends where the bubble does. [flash] (0…1, read while drawing) washes it terracotta:
 * the message a reply's quote jumped to.
 */
fun Modifier.bubbleSurface(shape: Shape, fill: Color, flash: () -> Float = { 0f }): Modifier = drawWithCache {
    val outline = shape.createOutline(size, layoutDirection, this)
    val clip = Path().apply { addOutline(outline) }
    onDrawWithContent {
        drawOutline(outline, fill)
        val pulse = flash()
        if (pulse > 0f) drawOutline(outline, Tokens.Terracotta, alpha = 0.3f * pulse)
        clipPath(clip) { this@onDrawWithContent.drawContent() }
    }
}

/**
 * A message's bubble (MessageBubble.tsx): 15/1.4 text, padding 9×14, your own on
 * [Tokens.BubbleMine], theirs on [Tokens.BubbleTheirs], no outline. It hugs its words, unless it
 * carries more ([attachment]: a link's preview, a shared card), which makes it one bubble of a
 * fixed [width] — the words, then what it carries edge to edge. A reply to a note wears a small
 * italic header (`quoteLabel`).
 *
 * The words are drawn by [ChatText]: [links] (ranges of [text]) are underlined, terracotta-deep in
 * your own bubble and terracotta in theirs, and a tap on one calls [onLinkTap] with its index;
 * [highlights] are the matches of a search, washed (the [highlightStrong] ones are the hit being
 * looked at); [flash] pulses the whole bubble. [onLongPress] gets the index of the link pressed, if
 * it was on one. [plain] draws the bubble's stand-in (a plain rounded box) while what it carries
 * is still being read.
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
    width: Dp? = null,
    plain: Boolean = false,
    onLinkTap: ((Int) -> Unit)? = null,
    onLongPress: ((Int?) -> Unit)? = null,
    attachment: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val longPress by rememberUpdatedState(onLongPress)
    val fill = bubbleFill(mine)
    Column(
        modifier
            .then(if (width != null) Modifier.width(width) else Modifier)
            .then(
                if (plain) Modifier.clip(plainBubbleShape(mine, run)).background(fill)
                else Modifier.bubbleSurface(remember(seed, mine, run) { MessageBubbleShape(seed, mine, run) }, fill, flash),
            )
            .then(
                if (onLongPress != null) Modifier
                    .pointerInput(Unit) { detectTapGestures(onLongPress = { longPress?.invoke(null) }) }
                    // The press-and-hold is the message's whole menu: assistive tech reaches it as the long click.
                    .semantics { onLongClick { longPress?.invoke(null); true } }
                else Modifier,
            ),
    ) {
        if (text.isNotEmpty() || quoteLabel != null) {
            Column(
                // What it carries brings its own air above it.
                Modifier.padding(start = BubblePadX, end = BubblePadX, top = BubblePadY, bottom = if (attachment != null) 0.dp else BubblePadY),
                verticalArrangement = Arrangement.spacedBy(4.dp),
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
        attachment?.invoke(this)
    }
}

private val BubblePadX = 14.dp
private val BubblePadY = 9.dp

/** The wash behind a search match: the hit being looked at stronger than the others in view. */
fun highlightWash(strong: Boolean): Color = Tokens.Terracotta.copy(alpha = if (strong) 0.5f else 0.24f)

/**
 * The message a reply answers, quoted over the reply (Messenger's): a muted bubble of its own on
 * [Tokens.BubbleQuote], no outline, 13.5 text in two lines at most, hugging its words. Its foot is
 * [REPLY_OVERLAP] deeper than its words need: the reply's bubble lies over it there.
 */
@Composable
fun QuoteBubble(text: String, seed: Double, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Box(
        modifier
            .bubbleSurface(remember(seed) { MessageBubbleShape(seed, maxRadius = QUOTE_RADIUS) }, Tokens.BubbleQuote)
            .then(if (onClick != null) Modifier.clickable(interactionSource = null, indication = null, role = Role.Button, onClick = onClick) else Modifier)
            .padding(start = 13.dp, end = 13.dp, top = 8.dp, bottom = 8.dp + REPLY_OVERLAP),
    ) {
        ChatText(text, sizeSp = 13.5f, lineHeight = 1.4f, color = Tokens.TextMuted, maxLines = 2)
    }
}

/** How far a reply's bubble lies over the foot of the message it quotes. */
val REPLY_OVERLAP = 14.dp

/** The reply glyph and a line of who answered whom, over the quote. */
@Composable
fun ReplyCaption(text: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        OrganicIcon(IconName.Reply, size = 12.dp, color = Tokens.TextMuted)
        BasicText(text, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted))
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
    sizeSp: Float = 15f,
    weight: Int = 400,
    lineHeight: Float = 1.4f,
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

// What a bubble carries

/** How much wider than the bubble a picture inside it is drawn on each side: past its wobbly edge's widest swing, so the clip, not the picture, ends it. */
private val PictureBleed = 4.dp

/** Wider than its box by [by] on each side, centred on it (the bubble's clip cuts it at the bubble's edge). */
private fun Modifier.bleedSides(by: Dp): Modifier = layout { measurable, constraints ->
    val extra = by.roundToPx()
    val w = constraints.maxWidth
    val placeable = measurable.measure(constraints.copy(minWidth = w + 2 * extra, maxWidth = w + 2 * extra))
    layout(w, placeable.height) { placeable.place(-extra, 0) }
}

/** A picture edge to edge across a bubble at 1.91:1 (the share-image ratio); [onError] when it won't load. */
@Composable
private fun BubblePicture(url: String, onError: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(1.91f)
            .bleedSides(PictureBleed)
            .background(Tokens.Text.copy(alpha = 0.06f)),
    ) {
        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(), onError = { onError() })
    }
}

/** What a part of a bubble that leads somewhere does under the finger: a tap goes, a hold is the message's menu. */
@OptIn(ExperimentalFoundationApi::class)
private fun Modifier.bubblePart(label: String, onClick: (() -> Unit)?, onLongPress: (() -> Unit)?): Modifier =
    if (onClick == null) this else combinedClickable(
        interactionSource = null,
        // The ink spreads from the finger over this part, and the bubble's own outline cuts it.
        indication = OrganicIndication(shape = RectangleShape),
        role = Role.Button,
        onClickLabel = label,
        onLongClick = onLongPress,
        onClick = onClick,
    )

/**
 * A link's unfurled page inside its message's bubble (Messenger's): after the words, the page's
 * picture edge to edge at 1.91:1 — when it has one and it loads; one that won't takes its section
 * with it — then the title (14.5/600, two lines), a description (12.5, two) and the host with the
 * link glyph. [host] is the ASCII host the tap leads to, as the app would name it in its confirm.
 * [afterWords]: the message's words are above it (the picture keeps a step from them; without
 * them it starts at the bubble's top edge). A tap opens the link; a hold is the message's menu.
 */
@Composable
fun ColumnScope.LinkPreviewSection(
    title: String,
    description: String?,
    host: String,
    imageUrl: String?,
    afterWords: Boolean,
    onClick: (() -> Unit)?,
    onLongPress: (() -> Unit)?,
) {
    Column(Modifier.fillMaxWidth().bubblePart(title, onClick, onLongPress)) {
        var pictureFailed by remember(imageUrl) { mutableStateOf(false) }
        if (imageUrl != null && !pictureFailed) {
            if (afterWords) Box(Modifier.height(BubblePadY))
            BubblePicture(imageUrl) { pictureFailed = true }
        }
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.body(14.5f, 600, lineHeight = 1.35f))
            if (description != null) {
                BasicText(description, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12.5f, lineHeight = 1.45f, color = Tokens.TextMuted))
            }
            Row(Modifier.padding(top = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                OrganicIcon(IconName.Link, size = 12.dp, color = Tokens.TextMuted)
                BasicText(host, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted))
            }
        }
    }
}

/** Who wrote a shared card: their face and pen name — or, for a card posted anonymously, [anonymous]'s mark. */
data class CardByline(
    val name: String,
    val initials: String,
    val imageUrl: String?,
    val color: Color,
    val avatarSeed: Double,
    val isAnonymous: Boolean = false,
) {
    companion object {
        /** A card posted anonymously: the mark the card page shows (a dot on paper) beside [name] (匿名) — never the author. */
        fun anonymous(name: String) = CardByline(name, "·", null, Tokens.CreamDark, 97.0, isAnonymous = true)
    }
}

/**
 * A Resonance card shared in a message, inside its bubble — Messenger's shared post, so it reads at
 * a glance as a card of this site and what it is about: the author (avatar 32, pen name, and
 * [source] · the read time under it), the cover edge to edge at 1.91:1 (or, without one, a band of
 * the card's own colour with the wave mark), the title in the heading face (16 bold, three lines),
 * the excerpt (two) and a source line — the wave and [source], like the "Facebook" under a shared
 * post. A tap opens the card; a hold is the message's menu.
 */
@Composable
fun ColumnScope.SharedCardSection(
    byline: CardByline,
    readTime: String,
    title: String,
    excerpt: String?,
    imageUrl: String?,
    accentHue: Double?,
    source: String,
    onClick: (() -> Unit)?,
    onLongPress: (() -> Unit)?,
) {
    Column(Modifier.fillMaxWidth().bubblePart(title, onClick, onLongPress)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            HandDrawnAvatar(byline.initials, byline.imageUrl, byline.color, 32.dp, byline.avatarSeed)
            Column(Modifier.weight(1f)) {
                BasicText(
                    byline.name, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = AppFonts.body(14f, 600, lineHeight = 1.3f, color = if (byline.isAnonymous) Tokens.TextMuted else Tokens.Text),
                )
                BasicText("$source · $readTime", maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12f, lineHeight = 1.35f, color = Tokens.TextMuted))
            }
        }
        var coverFailed by remember(imageUrl) { mutableStateOf(false) }
        if (imageUrl != null && !coverFailed) {
            BubblePicture(imageUrl) { coverFailed = true }
        } else {
            val palette = CardPalette(accentHue, 0)
            Box(
                Modifier.fillMaxWidth().height(96.dp).bleedSides(PictureBleed).background(palette.fill).grainOverlay(0.04f),
                contentAlignment = Alignment.Center,
            ) { OrganicIcon(IconName.Wave, size = 40.dp, color = palette.border.copy(alpha = 0.32f)) }
        }
        Column(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            BasicText(title, maxLines = 3, overflow = TextOverflow.Ellipsis, style = AppFonts.heading(16f, 700, lineHeight = 1.3f))
            if (!excerpt.isNullOrBlank()) {
                BasicText(excerpt, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.body(13f, lineHeight = 1.45f, color = Tokens.TextMuted))
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            OrganicIcon(IconName.Wave, size = 14.dp, color = Tokens.Terracotta)
            BasicText(source, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted))
        }
    }
}

/** [SharedCardSection] while the card is read: its footprint in plain shimmering blocks (no wobble, nothing measured). */
@Composable
fun ColumnScope.SharedCardSkeleton() {
    Column(Modifier.fillMaxWidth().semantics { contentDescription = "Loading" }) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Skeleton(height = 32.dp, circle = true)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Skeleton(Modifier.width(88.dp), height = 12.dp)
                Skeleton(Modifier.width(64.dp), height = 10.dp)
            }
        }
        Box(Modifier.fillMaxWidth().aspectRatio(1.91f).background(Tokens.Text.copy(alpha = 0.06f)))
        Column(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Skeleton(Modifier.fillMaxWidth(0.85f), height = 15.dp)
            Skeleton(Modifier.fillMaxWidth(0.6f), height = 15.dp)
            Skeleton(Modifier.fillMaxWidth(0.9f), height = 11.dp)
        }
        Box(Modifier.padding(start = 12.dp, top = 12.dp, bottom = 14.dp)) { Skeleton(Modifier.width(56.dp), height = 11.dp) }
    }
}

// Send

/**
 * The composer's Send: a wobbly terracotta rounded rectangle — the shape of the web's and iOS's
 * (one seed, one turn a side) — with the paper plane in cream. It is the verb of the bar, so it is
 * a solid face with the buttons' grain and no pen line of its own. Dimmed and deaf until there is
 * something to send — never held by a send in flight.
 */
@Composable
fun OrganicSendButton(label: String, enabled: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val haptic = LocalHapticFeedback.current
    val shape = remember { SendShape }
    Box(
        modifier
            .size(width = SendWidth, height = SendHeight)
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
        // The plane is drawn optically centred in its own box: it sits in the middle as it is.
        OrganicIcon(IconName.Send, size = 20.dp, color = Tokens.Cream)
    }
}

/** Send's size: a little wider than tall, beside a field one line high. */
val SendWidth = 52.dp
val SendHeight = 44.dp

/** Send's outline: radius 13, seed 23, a 1.1 swing, one turn a side with the corners a little lopsided (the web's 48×40 wobRect, at the apps' size). */
private val SendShape = WobRectShape(
    13.0, 23.0, mag = 1.1,
    options = WobRectOptions(curve = 1.3, cornerJitter = 2.4, cornerOffset = 2.2, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0)),
)

/**
 * The soft edge where a thread's messages meet its composer (or whatever stands at its foot): a
 * band of the page's paper fading to nothing upward, laid over the messages so they dissolve into
 * the composer instead of ending on a hard line — eased, so neither of its edges shows. Nothing
 * under it is hidden from a finger or a screen reader. Light on a divider: the composer itself
 * stays opaque on the same paper, so it reads as its edge, not as a shadow.
 */
@Composable
fun ComposerFade(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(ComposerFadeHeight)
            .clearAndSetSemantics { }
            .drawBehind { drawRect(ComposerFadeBrush) },
    )
}

/** How tall the composer's soft edge is (the thread's list keeps that much more room at its foot). */
val ComposerFadeHeight = 12.dp

/** The paper from the bottom (whole) to the top (gone), on an eased curve: 1, .75 at 35%, .3 at 70%, 0. */
private val ComposerFadeBrush = Brush.verticalGradient(
    0f to Tokens.Cream.copy(alpha = 0f),
    0.3f to Tokens.Cream.copy(alpha = 0.3f),
    0.65f to Tokens.Cream.copy(alpha = 0.75f),
    1f to Tokens.Cream,
)

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
