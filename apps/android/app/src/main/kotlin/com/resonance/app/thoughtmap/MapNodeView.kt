package com.resonance.app.thoughtmap

import android.graphics.LinearGradient
import android.graphics.Shader
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.graphics.text.LineBreaker
import android.util.LruCache
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import coil3.size.Size
import com.resonance.design.AppFonts
import com.resonance.design.CssLineHeightSpan
import com.resonance.design.GeometryCache
import com.resonance.design.OklchColor
import com.resonance.design.OrganicIcon
import com.resonance.design.WobRectShape
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.prefersReducedMotion
import com.resonance.design.toPath
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.WobTabRectOptions
import com.resonance.geometry.mapNodeH
import com.resonance.geometry.mapNodeW
import com.resonance.geometry.seedFromString
import com.resonance.geometry.wobRect
import com.resonance.geometry.wobTabRect
import kotlin.math.ceil
import kotlin.math.roundToInt

// What a card on the map says

private val CodeFence = Regex("```[\\s\\S]*?```")
private val Image = Regex("!\\[[^\\]]*\\]\\([^)]*\\)")
private val Link = Regex("\\[([^\\]]*)\\]\\([^)]*\\)")
private val Heading = Regex("^#{1,6}\\s+", RegexOption.MULTILINE)
private val Quote = Regex("^>\\s?", RegexOption.MULTILINE)
private val Marks = Regex("[*_~`]+")
// JavaScript's `\s` is Unicode-aware (the ideographic space, NBSP, the BOM); Android's regex needs them spelled out.
private val Spaces = Regex("[\\s\\p{Z}\\uFEFF]+")
private val FirstImage = Regex("!\\[[^\\]]*\\]\\((https?://[^\\s)]+)\\)")

/** plainExcerpt (src/lib/adapters/story.ts): the story's prose with the Markdown stripped, cut at `max` UTF-16 units like the web's `slice`. */
fun plainExcerpt(markdown: String, max: Int = 80): String {
    val t = markdown
        .replace(CodeFence, " ")
        .replace(Image, " ")
        .replace(Link, "$1")
        .replace(Heading, "")
        .replace(Quote, "")
        .replace(Marks, "")
        .replace(Spaces, " ")
        .trim()
    return if (t.length > max) t.substring(0, max) + "…" else t
}

/** The card's little picture: its cover, else the story's first inline image. */
fun mapThumbUrl(card: MapCard): String? = card.mediaUrl ?: FirstImage.find(card.story)?.groupValues?.get(1)

/**
 * The node's text, broken into lines the way the browser lays it out: CSS line
 * boxes (15px/1.4 title, 11.5px/1.6 excerpt 6px below it), and the lines beside
 * the floated 56px thumbnail (its 64×64 margin box at the top-right) shortened
 * to 136. Each line is placed by its baseline, so a CJK fallback glyph can't
 * push it off the web's grid; the lines themselves are drawn by the node (text
 * in a scaled layer stays vector, so it is crisp at any zoom).
 */
class NodeTextLayout private constructor(val lines: List<Line>) {
    /** `baseline` is in dp from the body's top. */
    class Line(val text: String, val title: Boolean, val baseline: Float)

    companion object {
        const val width = 200f
        const val bodyHeight = 126f
        private val cache = LruCache<String, NodeTextLayout>(400)

        fun make(title: String, excerpt: String, thumb: Boolean, density: Float): NodeTextLayout {
            val key = "$density|$thumb|$title|$excerpt"
            cache.get(key)?.let { return it }
            val lines = ArrayList<Line>()
            var y = 0f

            fun flow(text: String, family: AppFonts.Family, sizeDp: Float, weight: Int, lineBox: Float, isTitle: Boolean) {
                if (text.isEmpty()) return
                val paint = TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                    typeface = AppFonts.typeface(family, weight)
                    textSize = sizeDp * density
                }
                // The lines whose box starts above the float's bottom (64) share the row with it.
                val beside = if (thumb) ceil(((64f - y) / lineBox).toDouble()).toInt().coerceAtLeast(0) else 0
                val builder = StaticLayout.Builder.obtain(text, 0, text.length, paint, (width * density).roundToInt())
                    .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                    .setIncludePad(false)
                    .setUseLineSpacingFromFallbacks(false)
                    .setBreakStrategy(LineBreaker.BREAK_STRATEGY_SIMPLE) // greedy, like browsers
                    .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
                if (beside > 0) {
                    val floatPx = (64f * density).roundToInt()
                    builder.setIndents(null, IntArray(beside + 1) { if (it < beside) floatPx else 0 })
                }
                if (Build.VERSION.SDK_INT >= 35) builder.setUseBoundsForWidth(false)
                val layout = builder.build()
                val fm = paint.fontMetrics
                // The CSS line box: half the leading above the primary font's content area.
                val baselineInBox = (lineBox + (-fm.ascent / density) - fm.descent / density) / 2f
                for (i in 0 until layout.lineCount) {
                    val line = text.substring(layout.getLineStart(i), layout.getLineEnd(i)).trim()
                    lines.add(Line(line, isTitle, y + baselineInBox))
                    y += lineBox
                    if (y > bodyHeight + lineBox) break
                }
            }

            flow(title, AppFonts.Family.Heading, 15f, 600, 21f, true)
            if (excerpt.isNotEmpty()) {
                y += 6f
                flow(excerpt, AppFonts.Family.Body, 11.5f, 400, 18.4f, false)
            }
            return NodeTextLayout(lines).also { cache.put(key, it) }
        }
    }
}

// A card on the map

private val FadeIn = CubicBezierEasing(0f, 0f, 0.58f, 1f) // CSS ease-out

fun visibilityIcon(v: String): IconName = when (v) {
    "connections" -> IconName.Users
    "private" -> IconName.Lock
    else -> IconName.Globe
}

/**
 * ThoughtMapNode: the card's hand-drawn outline in its hue (a folder tab grows
 * out of it when selected), the title and excerpt wrapping round the thumbnail,
 * the visibility glyph and tags, and — selected — the link handle and the tab's
 * Open / remove buttons. Purely drawn: the map's touch surface does all the
 * hit-testing. Sized in dp, placed and scaled by the camera's layer around it.
 */
@Composable
fun MapNodeView(
    card: MapCard,
    selected: Boolean,
    linkTarget: Boolean,
    dragging: Boolean,
    showsHandle: Boolean,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current.density
    val context = LocalContext.current
    val tabbed = selected && !dragging
    val emphasized = selected || linkTarget
    val hue = ThoughtMapStore.hue(card)
    val seed = seedFromString(card.id).toDouble()
    val thumb = remember(card.mediaUrl, card.story) { mapThumbUrl(card) }
    val layout = remember(card.title, card.story, thumb != null, density) {
        NodeTextLayout.make(card.title.replace(Spaces, " ").trim(), plainExcerpt(card.story, if (thumb == null) 100 else 80), thumb != null, density)
    }
    // The web remounts the outline's svg whenever the card is (un)selected or dragged, and each new one fades in (280ms ease-out; not with animations off).
    val still = remember(context) { context.prefersReducedMotion() }
    // A fresh Animatable per outline (it starts at 0 in the very frame the new outline first draws, not a frame later).
    val fade = remember(tabbed) { Animatable(if (still) 1f else 0f) }
    LaunchedEffect(fade) {
        if (!still) fade.animateTo(1f, tween(280, easing = FadeIn))
    }

    Box(
        modifier
            .requiredSize(mapNodeW.dp, mapNodeH.dp)
            .drawWithCache {
                val d = density
                val fill = if (tabbed) MapInk.nodeFill(hue, true) else MapInk.nodeFill(hue, emphasized)
                val stroke = if (tabbed) MapInk.nodeStroke(hue, true) else MapInk.nodeStroke(hue, emphasized)
                val penWidth = (if (tabbed || emphasized) Tokens.InkStrong else Tokens.Ink).toPx()
                val outline = if (tabbed) {
                    GeometryCache.get("tab|$seed") {
                        wobTabRect(mapNodeW, mapNodeH, ThoughtMapStore.tabX, ThoughtMapStore.tabW, ThoughtMapStore.tabH, seed, WobTabRectOptions(R = 18.0, tabR = 9.0, mag = 2.4, curve = 1.0))
                    }.toPath(d, 0f, -ThoughtMapStore.tabH.toFloat() * d)
                } else {
                    GeometryCache.get("node|$seed") {
                        wobRect(mapNodeW, mapNodeH, 18.0, seed, 4.0, WobRectOptions(curve = 1.0, cornerJitter = 0.8, cornerOffset = 3.0, segmentsH = SegValue.Range(3, 4), segmentsV = SegValue.Count(2.0)))
                    }.toPath(d)
                }
                val pen = Stroke(penWidth, cap = if (tabbed) StrokeCap.Round else StrokeCap.Butt, join = StrokeJoin.Round)
                // The body's text: the title and excerpt faded out over the last 14px, as the web's mask does — painted with a
                // gradient so it stays vector text (no offscreen layer, which would blur when the camera scales it).
                val opaque = Tokens.Text.toArgb()
                val muted = Tokens.TextMuted.toArgb()
                fun paint(family: AppFonts.Family, sizeDp: Float, weight: Int, color: Int) = TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                    typeface = AppFonts.typeface(family, weight)
                    textSize = sizeDp * d
                    shader = LinearGradient(0f, (NodeTextLayout.bodyHeight - 14f) * d, 0f, NodeTextLayout.bodyHeight * d, color, color and 0x00FFFFFF, Shader.TileMode.CLAMP)
                }
                val titlePaint = paint(AppFonts.Family.Heading, 15f, 600, opaque)
                val excerptPaint = paint(AppFonts.Family.Body, 11.5f, 400, muted)
                onDrawBehind {
                    val a = fade.value
                    drawPath(outline, fill.copy(alpha = fill.alpha * a))
                    drawPath(outline, stroke.copy(alpha = a), style = pen)
                    drawIntoCanvas { c ->
                        val nc = c.nativeCanvas
                        nc.save()
                        nc.translate(16f * d, 14f * d)
                        nc.clipRect(0f, 0f, NodeTextLayout.width * d, NodeTextLayout.bodyHeight * d)
                        for (line in layout.lines) {
                            nc.drawText(line.text, 0f, line.baseline * d, if (line.title) titlePaint else excerptPaint)
                        }
                        nc.restore()
                    }
                }
            },
    ) {
        if (thumb != null) MapThumb(thumb, hue, seed, Modifier.offset((16 + NodeTextLayout.width - 56).dp, (14 + 2).dp))
        // The meta row: the visibility glyph (a pen for a draft) and the tags, 8 apart, under the body's 126 and the 8 gap.
        Row(
            Modifier.offset(16.dp, (14 + 126 + 8).dp).requiredSize(200.dp, 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
        ) {
            OrganicIcon(if (card.publishedAt == null) IconName.Pen else visibilityIcon(card.visibility), size = 14.dp, color = Tokens.TextMuted)
            BasicText(
                card.tags.joinToString(" ") { "#$it" },
                style = AppFonts.body(11.5f, 400, lineHeight = 1.4f, color = Tokens.TextMuted),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        if (selected && showsHandle && !dragging) LinkHandle()
        if (tabbed) TabRow()
    }
}

/** NodeThumb: 56×56 in a wobbly clip, the picture overscanned 4px each side and decoded for the largest zoom, not the full file. */
@Composable
private fun MapThumb(url: String, hue: Double, seed: Double, modifier: Modifier) {
    val context = LocalContext.current
    val density = LocalDensity.current.density
    val clip = remember(seed) {
        WobRectShape(
            12.0, seed + 3, mag = 1.8,
            options = WobRectOptions(curve = 1.3, cornerJitter = 1.4, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(2.0)),
        )
    }
    val px = (64 * density * 2).roundToInt()
    val request = remember(url, px) { ImageRequest.Builder(context).data(url).size(Size(px, px)).crossfade(false).build() }
    Box(
        modifier
            .size(56.dp)
            .drawWithContent {
                drawContent()
                drawOutline(clip.createOutline(size, layoutDirection, this), MapInk.thumbRim(hue), style = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            },
    ) {
        Box(Modifier.size(56.dp).clip(clip)) {
            AsyncImage(
                model = request,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.requiredSize(64.dp).offset((-4).dp, (-4).dp),
            )
        }
    }
}

/** The link handle: a dashed 28dp circle on the right edge (centred on the card's edge at 233, 89), an arrow inside. */
@Composable
private fun LinkHandle() {
    Box(
        Modifier
            .offset((mapNodeW - 13).dp, (mapNodeH / 2 - 14).dp)
            .size(28.dp)
            .drawBehind {
                drawCircle(Tokens.CardBg)
                // `border: 1.6px dashed`, drawn inside the 28 box.
                val w = 1.6.dp.toPx()
                drawCircle(
                    Tokens.FieldBorderHover, radius = size.minDimension / 2 - w / 2,
                    style = Stroke(w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.8.dp.toPx(), 3.2.dp.toPx()))),
                )
            },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(IconName.ArrowRight, size = 14.dp, color = Tokens.TextMuted) }
}

/** The tab's buttons: "Open" and the trash, centred in the 118×30 tab above the card. */
@Composable
private fun TabRow() {
    Box(
        Modifier
            .offset(ThoughtMapStore.tabX.dp, (-ThoughtMapStore.tabH).dp)
            .requiredSize(ThoughtMapStore.tabW.dp, ThoughtMapStore.tabH.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier.padding(start = 6.dp, end = 6.dp, top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(2.dp),
        ) {
            BasicText(
                com.resonance.kit.l10n.L10n.Me.ThoughtMap.open,
                style = AppFonts.body(12.5f, 600, lineHeight = 1.3f, color = Tokens.Text),
                modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
            )
            OrganicIcon(IconName.Trash, size = 14.dp, color = Tokens.Text, modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp).size(14.dp))
        }
    }
}

/** The map's inks: oklch colors per hue, made once (the web writes them as CSS oklch()). */
object MapInk {
    private val cache = HashMap<String, Color>()

    fun oklch(l: Double, c: Double, h: Double, alpha: Double = 1.0): Color =
        cache.getOrPut("$l|$c|$h|$alpha") { OklchColor.of(l, c, h, alpha) }

    fun nodeFill(hue: Double, emphasized: Boolean) = if (emphasized) oklch(0.925, 0.045, hue) else oklch(0.975, 0.012, hue)
    fun nodeStroke(hue: Double, emphasized: Boolean) = if (emphasized) oklch(0.38, 0.13, hue) else oklch(0.52, 0.11, hue)
    fun thumbRim(hue: Double) = oklch(0.52, 0.11, hue, 0.55)
    fun regionFill(hue: Double, hot: Boolean) = oklch(0.965, 0.032, hue, if (hot) 0.92 else 0.78)
    fun regionStroke(hue: Double, strong: Boolean) = if (strong) oklch(0.45, 0.1, hue) else oklch(0.6, 0.085, hue)
    fun edgeInk(selected: Boolean) = if (selected) oklch(0.28, 0.05, 60.0) else oklch(0.46, 0.045, 60.0)
    fun linkInk(hue: Double) = oklch(0.52, 0.11, hue)
    val pillFill = oklch(0.94, 0.02, 75.0)
    val pillFillSelected = oklch(0.88, 0.03, 60.0)
    val dot = oklch(0.82, 0.025, 75.0)
    val scrim = oklch(0.3, 0.02, 75.0, 0.16)
}
