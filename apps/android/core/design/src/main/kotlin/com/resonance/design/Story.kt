package com.resonance.design

import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.text.LineBreaker
import android.os.Build
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.CharacterStyle
import android.text.style.ForegroundColorSpan
import android.text.style.MetricAffectingSpan
import android.text.style.StrikethroughSpan
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.resonance.design.generated.Tokens
import com.resonance.geometry.penWave
import com.resonance.geometry.wavyVertical
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.ProseMetrics
import com.resonance.kit.story.StoryBlock
import com.resonance.geometry.seedFromString
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** How a run of story text looks: the reader's `.prose` styles (StoryMarkdown.module.css). */
data class ProseStyle(
    val family: AppFonts.Family,
    val size: Float,
    val weight: Int,
    val lineHeight: Float,
    val color: Color,
    val italic: Boolean = false,
    /** CSS letter-spacing in em. */
    val tracking: Float = 0f,
) {
    val quoted get() = copy(color = Tokens.TextMuted, italic = true)

    companion object {
        val Body = ProseStyle(AppFonts.Family.Body, 17f, 400, 1.8f, Tokens.Text)
        val H2 = ProseStyle(AppFonts.Family.Heading, 22f, 700, 1.3f, Tokens.Text, tracking = -0.01f)
        val H3 = ProseStyle(AppFonts.Family.Heading, 18f, 700, 1.35f, Tokens.Text)
    }
}

/** Browsers slant upright glyphs for italics when a face has none (the site loads none). */
private class SyntheticItalicSpan : MetricAffectingSpan() {
    override fun updateDrawState(tp: TextPaint) { tp.textSkewX = -0.2f }
    override fun updateMeasureState(tp: TextPaint) { tp.textSkewX = -0.2f }
}

private class TypefaceWeightSpan(private val typeface: Typeface) : MetricAffectingSpan() {
    override fun updateDrawState(tp: TextPaint) { tp.typeface = typeface }
    override fun updateMeasureState(tp: TextPaint) { tp.typeface = typeface }
}

/**
 * A link in running text: terracotta, with no straight underline — [RichCssText]
 * draws the pen's wave under each line the link covers — and taps resolved there.
 */
class LinkSpan(val url: String, private val color: Int) : CharacterStyle() {
    override fun updateDrawState(tp: TextPaint) {
        tp.color = color
    }
}

/** One line's share of a link: where its stroke runs, in layout pixels. */
data class LinkFragment(val left: Float, val right: Float, val baseline: Float)

/**
 * The line fragments of the text range [start, end): one per line it touches
 * (a link that wraps gets a stroke under each part). [lineOf], [lineStart] and
 * [lineVisibleEnd] (the line's end without its trailing space), [xStart],
 * [xEnd] (told the line, since an offset on a line break sits on two) and [baselineOf] are a text Layout's own answers, so this stays testable
 * without a Layout.
 */
fun linkFragments(
    start: Int,
    end: Int,
    lineOf: (Int) -> Int,
    lineStart: (Int) -> Int,
    lineVisibleEnd: (Int) -> Int,
    xStart: (Int) -> Float,
    xEnd: (line: Int, offset: Int) -> Float,
    baselineOf: (Int) -> Float,
): List<LinkFragment> {
    if (end <= start) return emptyList()
    return (lineOf(start)..lineOf(end - 1)).mapNotNull { line ->
        val a = max(start, lineStart(line))
        val b = min(end, lineVisibleEnd(line))
        if (b <= a) return@mapNotNull null
        val left = xStart(a)
        val right = xEnd(line, b)
        if (right <= left) null else LinkFragment(min(left, right), max(left, right), baselineOf(line))
    }
}

/** A link's strokes, ready to draw: its url (for the press state), wave paths and where they sit. */
private class LinkStroke(val url: String, val x: Float, val y: Float, val wave: androidx.compose.ui.graphics.Path)

private fun linkStrokes(layout: Layout, spanned: Spanned, sizePx: Float, density: Float): List<LinkStroke> =
    spanned.getSpans(0, spanned.length, LinkSpan::class.java).flatMap { span ->
        val frags = linkFragments(
            spanned.getSpanStart(span), spanned.getSpanEnd(span),
            layout::getLineForOffset, layout::getLineStart, layout::getLineVisibleEnd,
            { layout.getPrimaryHorizontal(it) },
            { line, o -> if (o == layout.getLineEnd(line)) layout.getLineRight(line) else layout.getPrimaryHorizontal(o) },
            { layout.getLineBaseline(it).toFloat() },
        )
        frags.mapIndexed { i, f ->
            // Seeded by the link, and by the fragment so a wrapped link's parts don't repeat.
            val wave = penWave(((f.right - f.left) / density).toDouble(), (seedFromString(span.url) + i).toDouble()).toPath(density)
            // Under the letters, not under the line box: 0.2em below the baseline, like OrganicLink.
            LinkStroke(span.url, f.left, f.baseline + sizePx * 0.2f, wave)
        }
    }

private fun buildRichLayout(runs: List<InlineRun>, style: ProseStyle, widthPx: Int, density: Density): Pair<StaticLayout, Spanned> {
    val base = AppFonts.typeface(style.family, style.weight)
    val sizePx = density.cssFontPx(style.size)
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = base
        textSize = sizePx
        color = style.color.toArgb()
        letterSpacing = style.tracking
    }
    val text = SpannableStringBuilder()
    for (run in runs) {
        val start = text.length
        text.append(run.text)
        val end = text.length
        if (start == end) continue
        val face = when {
            run.code -> Typeface.MONOSPACE
            run.bold -> AppFonts.typeface(style.family, 700)
            else -> null
        }
        face?.let { text.setSpan(TypefaceWeightSpan(it), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
        if (style.italic || run.italic) text.setSpan(SyntheticItalicSpan(), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (run.strikethrough) text.setSpan(StrikethroughSpan(), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        run.link?.let { text.setSpan(LinkSpan(it, Tokens.Terracotta.toArgb()), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
        if (run.code) text.setSpan(ForegroundColorSpan(style.color.toArgb()), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    text.setSpan(CssLineHeightSpan(sizePx * style.lineHeight, paint.fontMetrics), 0, text.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    val b = StaticLayout.Builder.obtain(text, 0, text.length, paint, max(1, widthPx))
        .setAlignment(Layout.Alignment.ALIGN_NORMAL)
        .setIncludePad(false)
        .setUseLineSpacingFromFallbacks(false)
        .setBreakStrategy(LineBreaker.BREAK_STRATEGY_SIMPLE)
        .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
    if (Build.VERSION.SDK_INT >= 35) b.setUseBoundsForWidth(false)
    return b.build() to text
}

/** Rich story text in exact CSS line boxes, with tappable links. */
@Composable
fun RichCssText(runs: List<InlineRun>, style: ProseStyle, onOpenUrl: (String) -> Unit, modifier: Modifier = Modifier) {
    val scaled = LocalDensity.current
    val density = scaled.density
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val widthPx = constraints.maxWidth
        val (layout, spanned) = remember(runs, style, widthPx, density, scaled.fontScale) { buildRichLayout(runs, style, widthPx, scaled) }
        val plain = remember(runs) { runs.joinToString("") { it.text } }
        val sizePx = scaled.cssFontPx(style.size)
        val strokes = remember(layout, spanned, sizePx, density) { linkStrokes(layout, spanned, sizePx, density) }
        var pressedUrl by remember { mutableStateOf<String?>(null) }
        Box(
            Modifier
                .width(Dp(layout.width / density))
                .height(Dp(layout.height / density))
                .semantics { this.text = AnnotatedString(plain) }
                .pointerInput(layout) {
                    fun linkAt(p: androidx.compose.ui.geometry.Offset): LinkSpan? {
                        val line = layout.getLineForVertical(p.y.roundToInt())
                        val offset = layout.getOffsetForHorizontal(line, p.x)
                        return spanned.getSpans(offset, offset, LinkSpan::class.java).firstOrNull()
                    }
                    detectTapGestures(
                        onPress = { p ->
                            // The pen presses harder while the finger is down: the web's hover.
                            pressedUrl = linkAt(p)?.url
                            tryAwaitRelease()
                            pressedUrl = null
                        },
                    ) { p -> linkAt(p)?.let { onOpenUrl(it.url) } }
                }
                .drawBehind {
                    drawIntoCanvas { layout.draw(it.nativeCanvas) }
                    val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    strokes.forEach { s ->
                        translate(s.x, s.y) { drawPath(s.wave, Tokens.Terracotta, alpha = if (s.url == pressedUrl) 1f else 0.7f, style = pen) }
                    }
                },
        )
    }
}

/**
 * A story, laid out like the web reader's `.prose`: 17sp DM Sans on a 1.8
 * line box, Playfair headings, the curved quote rail, photos in organic
 * clips, card links as embedded cards, blank-line markers as air; vertical
 * rhythm from CSS margins, collapsing between blocks. The twin of iOS's
 * StoryMarkdownView.
 */
@Composable
fun StoryMarkdown(blocks: List<StoryBlock>, onOpenUrl: (String) -> Unit, embed: @Composable (href: String, title: String) -> Unit) {
    BlockColumn(blocks, ProseStyle.Body, onOpenUrl, embed)
}

/**
 * The reader's 1em in dp: 17 at the system's normal text size, more when the
 * text scale grows the body, so the margins, indents and list markers the web
 * measures in ems stay in proportion to the words they sit beside.
 */
@Composable
private fun readerEm(): Dp = with(LocalDensity.current) { cssFontPx(ProseMetrics.EM).toDp() }

@Composable
private fun BlockColumn(blocks: List<StoryBlock>, style: ProseStyle, onOpenUrl: (String) -> Unit, embed: @Composable (String, String) -> Unit) {
    val gaps = remember(blocks) { ProseMetrics.gaps(blocks) }
    val grown = readerEm().value / ProseMetrics.EM
    Column(Modifier.fillMaxWidth()) {
        blocks.forEachIndexed { i, block ->
            if (gaps[i] > 0) Spacer(Modifier.height((gaps[i] * grown).dp))
            Block(block, style, onOpenUrl, embed)
        }
    }
}

@Composable
private fun Block(block: StoryBlock, style: ProseStyle, onOpenUrl: (String) -> Unit, embed: @Composable (String, String) -> Unit) {
    val em = readerEm()
    when (block) {
        is StoryBlock.Paragraph -> RichCssText(block.runs, style, onOpenUrl)
        is StoryBlock.Heading -> RichCssText(block.runs, if (block.level <= 2) ProseStyle.H2 else ProseStyle.H3, onOpenUrl, Modifier.semantics { heading() })
        StoryBlock.Blank -> Spacer(Modifier.height(em * 1.6f).clearAndSetSemantics { })
        is StoryBlock.Image -> StoryImage(block.url, block.alt)
        is StoryBlock.CardEmbed -> embed(block.href, block.title)
        // The rail is drawn behind the quote's own box (its height is the
        // content's), not a sibling sized by intrinsics — the story text is
        // built on BoxWithConstraints, which cannot answer intrinsic queries.
        // The web's vertical Divider (seed 5): trimmed 6 at each end (18% for a
        // very short quote), a turn every ~34px, the light pen, centred in its
        // 5.2px-wide strip, 1em before the text.
        is StoryBlock.Quote -> Box(
            Modifier
                .fillMaxWidth()
                .drawBehind {
                    val h = size.height / density
                    val trim = min(0.18f * h, 6f)
                    val run = h - trim * 2
                    val path = wavyVertical(run.toDouble(), 5.0, 1.4, max(2, (run / 34).roundToInt()))
                        .toPath(density, QuoteRailWidth.toPx() / 2, trim * density)
                    drawPath(path, Tokens.TerracottaLight, style = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round))
                }
                .padding(start = QuoteRailWidth + em),
        ) { BlockColumn(block.children, style.quoted, onOpenUrl, embed) }
        is StoryBlock.ListBlock -> Column(verticalArrangement = Arrangement.spacedBy(em * 0.3f)) {
            block.items.forEachIndexed { i, item ->
                Row {
                    Box(Modifier.width(em * 1.5f)) {
                        RichCssText(listOf(InlineRun(if (block.ordered) "${block.start + i}." else "•")), style, onOpenUrl, Modifier.clearAndSetSemantics { })
                    }
                    Box(Modifier.weight(1f)) { BlockColumn(item, style, onOpenUrl, embed) }
                }
            }
        }
        StoryBlock.Rule -> WavyDivider(seed = 23.0)
        is StoryBlock.CodeBlock -> BasicText(block.code, style = AppFonts.body(15f, color = Tokens.Text).copy(fontFamily = FontFamily.Monospace))
    }
}

/**
 * OrganicStoryImage: a photo at its own proportions (≤ 520dp or 62% of the
 * screen tall), centred, in a gentle clip (R 12, 2.5% wobble). Like the
 * cover, the photo overflows its box by the clip's outward swing so the
 * bulges land on pixels instead of being cut flat.
 */
@Composable
private fun StoryImage(url: String, alt: String) {
    var aspect by remember(url) { mutableFloatStateOf(1.5f) }
    val maxH = min(520f, LocalConfiguration.current.screenHeightDp * 0.62f)
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val w = min(maxWidth.value, maxH * aspect)
        val seed = seedFromString(url).toDouble()
        BoxWithConstraints(Modifier.widthIn(max = w.dp).aspectRatio(aspect).heightIn(min = 40.dp)) {
            val bleed = imageBleed(maxWidth.value, maxHeight.value, 0.025)
            AsyncImage(
                model = url,
                contentDescription = alt,
                contentScale = ContentScale.Crop,
                onSuccess = { s ->
                    val d = s.result.image
                    if (d.height > 0) aspect = d.width.toFloat() / d.height
                },
                modifier = Modifier
                    .requiredSize(maxWidth + bleed * 2, maxHeight + bleed * 2)
                    .clip(BledShape(seed, bleed.value.toDouble(), radius = 12.0, magFactor = 0.025)),
            )
        }
    }
}

/** The quote rail's strip: the web Divider's width (amplitude and pen, twice each). */
private val QuoteRailWidth = 5.2.dp
