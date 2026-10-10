package com.resonance.design

import androidx.compose.foundation.Canvas
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicText
import com.resonance.design.generated.IconName
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import com.resonance.geometry.penWave
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobRect
import com.resonance.kit.l10n.L10n
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * The story cards' grain (the web's STORY_GRAIN, src/lib/design/grain.ts):
 * GrainOverlay's mean darkening over the band — text and cover included —
 * and over a cover picture. Kept light: over the text it reads as sandpaper.
 */
internal object StoryGrain {
    const val Band = 0.045f
    const val Cover = 0.03f
}

/** OrganicImage's wobble: a few gentle turns, corners drifting 6 (OrganicImage.tsx, OrganicStoryImage.tsx). */
private val ImageWob = WobRectOptions(
    curve = 0.4, cornerJitter = 1.1, cornerOffset = 6.0, segmentsH = SegValue.Range(3, 4), segmentsV = SegValue.Range(2, 3),
)

/**
 * OrganicImage's clip: wobRect (R 18, 5% wobble) over the box, the picture
 * bleeding past it so the outward bulges land on real pixels (OrganicImage.tsx).
 */
class OrganicImageShape(private val seed: Double, private val radius: Double = 18.0, private val magFactor: Double = 0.05) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val d = density.density
        val w = (size.width / d).toDouble()
        val h = (size.height / d).toDouble()
        if (w <= 0 || h <= 0) return Outline.Rectangle(Rect.Zero)
        val cmds = GeometryCache.get("img|$w|$h|$seed|$radius|$magFactor") {
            wobRect(w, h, min(radius, min(w, h) / 2), seed, min(w, h) * magFactor, ImageWob)
        }
        return Outline.Generic(cmds.toPath(d))
    }
}

/** How far a picture must overflow its box so the clip's outward swing (wobble + corner drift) lands on pixels. */
internal fun imageBleed(w: Float, h: Float, magFactor: Double): Dp = ceil(min(w, h) * magFactor + 6 + 4).dp

/**
 * A remote image (or placeholder) in the organic clip, bleeding past its box
 * by the wobble's outward swing. `grain` lays the web's GrainOverlay over the
 * picture itself (StoryCard's covers carry StoryGrain.Cover).
 */
@Composable
fun OrganicImage(
    url: String?,
    seed: Double,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    grain: Float = 0f,
    radius: Double = 18.0,
    magFactor: Double = 0.05,
    /** The picture couldn't be loaded (the placeholder stays); a caller may drop the frame altogether. */
    onError: (() -> Unit)? = null,
    /** Laid over the picture, inside the same clip (a picked card's wash and tick). */
    overlay: (@Composable () -> Unit)? = null,
    placeholder: @Composable () -> Unit,
) {
    BoxWithConstraints(modifier) {
        val bleed = imageBleed(maxWidth.value, maxHeight.value, magFactor)
        Box(
            Modifier
                .requiredSize(maxWidth + bleed * 2, maxHeight + bleed * 2)
                .clip(BledShape(seed, bleed.value.toDouble(), radius, magFactor))
                .then(if (grain > 0f) Modifier.grainOverlay(grain) else Modifier),
        ) {
            placeholder()
            if (url != null) AsyncImage(
                model = url, contentDescription = contentDescription, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(),
                onError = onError?.let { report -> { _ -> report() } },
            )
            overlay?.invoke()
        }
    }
}

/** The clip drawn inside a frame `bleed` larger on every side. */
internal class BledShape(private val seed: Double, private val bleed: Double, private val radius: Double = 18.0, private val magFactor: Double = 0.05) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val d = density.density
        val w = size.width / d - bleed * 2
        val h = size.height / d - bleed * 2
        if (w <= 0 || h <= 0) return Outline.Rectangle(Rect.Zero)
        val cmds = GeometryCache.get("bled|$w|$h|$seed|$radius|$magFactor") {
            wobRect(w, h, min(radius, min(w, h) / 2), seed, min(w, h) * magFactor, ImageWob)
        }
        return Outline.Generic(cmds.toPath(d, (bleed * d).toFloat(), (bleed * d).toFloat()))
    }
}

/**
 * The web's striped cover placeholder: the card's fill, diagonal hatching in
 * the fill 7 L darker at 0.28 (a tint of the card, not grey), the label. The
 * 320×200 drawing covers the box, centred (`xMidYMid slice`).
 */
@Composable
fun StoryImagePlaceholder(fill: Color, stripe: Color, label: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(fill)
            val scale = maxOf(size.width / 320f, size.height / 200f)
            val dx = (size.width - 320f * scale) / 2
            val dy = (size.height - 200f * scale) / 2
            for (i in 0 until 22) {
                val x = dx + (i * 22f - 160f) * scale
                drawLine(stripe.copy(alpha = 0.28f), Offset(x, dy), Offset(x + 320f * scale, dy + 200f * scale), strokeWidth = Tokens.InkLight.toPx() * scale)
            }
        }
        BasicText(label, maxLines = 1, style = AppFonts.body(10.5f, color = Tokens.Text.copy(alpha = 0.42f)).copy(fontFamily = FontFamily.Monospace))
    }
}

/** What a story card shows (the app maps its FeedCard into this). */
data class StoryCardContent(
    val id: String,
    val title: String,
    val excerpt: String,
    val authorName: String,
    val authorInitials: String,
    val authorImageUrl: String?,
    val avatarSeed: Double,
    val readTime: String,
    val tags: List<String>,
    val imageUrl: String?,
    val imageLabel: String,
    val accentHue: Double?,
    /** Why the feed picked it — Resonance's handwritten margin note. */
    val reason: String? = null,
    /** The author's own color (MiniStoryCard paints their avatar with it). */
    val authorAccent: Color? = null,
)

/** CSS `margin-top` (negative too): shifts the child and takes the same amount off the space it claims. */
private fun Modifier.marginTop(dy: Dp): Modifier = layout { measurable, constraints ->
    val p = measurable.measure(constraints)
    val d = dy.roundToPx()
    layout(p.width, max(0, p.height + d)) { p.place(0, d) }
}

/**
 * The phone band every story card is (StoryCard/MiniStoryCard ≤ 640px): the
 * card's paper edge to edge, a wavy rule along its top edge — and the same
 * rule along the bottom for the last card — and GrainOverlay above
 * everything, photo and text included (it sits at z-index 10 on the web).
 * Content is inset 38 (page padding 20 + the band's own 18).
 */
@Composable
private fun StoryBand(
    palette: CardPalette,
    ruleSeed: Double,
    isLast: Boolean,
    verticalPadding: Dp,
    gap: Dp,
    modifier: Modifier,
    isFirst: Boolean = false,
    inset: Dp = BandInset,
    content: @Composable ColumnScope.() -> Unit,
) {
    val interior = palette.interior
    val border = palette.border
    // The first band of a list that starts under the bar's wavy band: its paper runs up beneath the
    // wave (the bar's pen line is its top edge, so it draws no rule of its own), and its content
    // keeps its place.
    val bleed = if (isFirst) HeaderEdgeHeight else 0.dp
    Column(
        modifier
            .fillMaxWidth()
            .drawWithCache {
                val grain = Grain.brush(GrainMode.Tile, "grain-overlay", size, density, 1f)
                // wavyLine(200, seed + 17, 1.4, 7) stretched across the band, centred on its edge.
                val rule = wavyLinePath(size.width, 0f, density, ruleSeed, 1.4, 7)
                val stroke = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
                onDrawWithContent {
                    drawRect(interior)
                    if (!isFirst) drawPath(rule, border, style = stroke)
                    if (isLast) translate(top = size.height) { drawPath(rule, border, style = stroke) }
                    drawContent()
                    // The tile's ink averages ½: twice the mean darkening.
                    grain?.let { drawRect(it, alpha = StoryGrain.Band * 2) }
                }
            }
            .padding(start = inset, end = inset, top = verticalPadding + bleed, bottom = verticalPadding),
        verticalArrangement = Arrangement.spacedBy(gap),
        content = content,
    )
}

/** StoryCard's rule above the byline: wavyLine(200, seed + 91, 1.2, 6), 2 below the excerpt. */
@Composable
private fun BylineRule(seed: Double, color: Color) {
    Box(Modifier.fillMaxWidth().padding(top = 2.dp).height(6.dp).clearAndSetSemantics { }.drawWithCache {
        val p = wavyLinePath(size.width, size.height, density, seed + 91, 1.2, 6)
        val s = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
        onDrawBehind { drawPath(p, color, style = s) }
    })
}

/** The family a list gave the card ([CardPalette.palettes]), else its own preference. */
private fun cardPalette(family: Int?, accentHue: Double?, position: Int): CardPalette =
    if (family != null) CardPalette.of(family) else CardPalette(accentHue, position)

/** A band's content inset on a phone: the page's 20 and the band's own 18. */
val BandInset = 38.dp

/**
 * StoryCard as the web draws it on a phone: a full-bleed band tinted with the
 * card's hue, then image, tags, title, excerpt, rule, byline. [isFirst]: the
 * feed's first card, which starts under the bar's wavy band (see StoryBand).
 * [inset]: how far in its content sits — 38 on a phone; on a medium window the
 * side inset of the centred reading column, the paper still running edge to edge.
 */
@Composable
fun StoryCard(
    content: StoryCardContent, position: Int, isLast: Boolean = false, modifier: Modifier = Modifier, isFirst: Boolean = false, inset: Dp = BandInset,
    /** The family its list gives it (CardPalette.palettes); null: its own preference. */
    palette: Int? = null,
) {
    val palette = cardPalette(palette, content.accentHue, position)
    val seed = position * 77.0 + 13
    StoryBand(palette, seed + 17, isLast, 32.dp, 14.dp, modifier, isFirst, inset) { StoryCardBody(content, palette, seed) }
}

/** What a story card holds, band or bordered: cover, tags, title, excerpt, rule, byline (and the margin note). */
@Composable
private fun ColumnScope.StoryCardBody(content: StoryCardContent, palette: CardPalette, seed: Double) {
    OrganicImage(content.imageUrl, seed + 5, Modifier.fillMaxWidth().aspectRatio(1 / 0.62f), grain = StoryGrain.Cover) {
        StoryImagePlaceholder(palette.fill, palette.stripe, content.imageLabel)
    }
    // The web renders the tag row even when empty (its 8px margin still counts).
    FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        content.tags.take(4).forEach { TagPill(it, fill = palette.fill) }
    }
    CssText(content.title, AppFonts.Family.Heading, 18f, 700, lineHeight = 1.3f, modifier = Modifier.fillMaxWidth())
    CssText(content.excerpt, AppFonts.Family.Body, 14f, 400, lineHeight = 1.65f, color = Tokens.TextMuted, modifier = Modifier.fillMaxWidth())
    BylineRule(seed, palette.separator)
    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        HandDrawnAvatar(content.authorInitials, content.authorImageUrl, palette.fill, 30.dp, content.avatarSeed)
        Column(Modifier.weight(1f)) {
            BasicText(content.authorName, style = AppFonts.body(13f, 600, lineHeight = 1.4f))
            BasicText(content.readTime, style = AppFonts.body(12f, lineHeight = 1.4f, color = Tokens.TextMuted))
        }
        OrganicIcon(IconName.ArrowRight, size = 18.dp, color = Tokens.Text.copy(alpha = 0.28f), strokeWidth = Tokens.Ink.value)
    }
    if (!content.reason.isNullOrEmpty()) {
        Row(Modifier.marginTop((-4).dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            OrganicIcon(IconName.Sparkle, Modifier.padding(top = 5.dp), size = 13.dp, color = palette.noteInk, strokeWidth = Tokens.InkLight.value)
            CssText(content.reason, AppFonts.Family.Handwritten, 17f, 400, lineHeight = 1.45f, color = palette.noteInk, modifier = Modifier.weight(1f), letterSpacing = 0.02f)
        }
    }
}

/**
 * StoryCard in `loading` mode: the real band, rules and grain, with the
 * cover, tags, title, excerpt and byline as shimmering blocks tinted with the
 * card's own hue.
 */
@Composable
fun StoryCardSkeleton(position: Int, isLast: Boolean = false, modifier: Modifier = Modifier, isFirst: Boolean = false, inset: Dp = BandInset, palette: Int? = null) {
    val palette = cardPalette(palette, null, position)
    val seed = position * 77.0 + 13
    WithSkeletonHue(palette.hue) {
        StoryBand(palette, seed + 17, isLast, 32.dp, 14.dp, modifier.semantics { contentDescription = L10n.Home.moreLoading }, isFirst, inset) {
            StoryCardSkeletonBody(palette, seed)
        }
    }
}

@Composable
private fun ColumnScope.StoryCardSkeletonBody(palette: CardPalette, seed: Double) {
    Skeleton(Modifier.aspectRatio(1 / 0.62f), height = Dp.Unspecified, radius = 18.dp)
    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Skeleton(Modifier.width(56.dp), height = 22.dp, radius = 11.dp)
        Skeleton(Modifier.width(72.dp), height = 22.dp, radius = 11.dp)
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Skeleton(Modifier.fillMaxWidth(0.9f), height = 18.dp)
        Skeleton(Modifier.fillMaxWidth(0.55f), height = 18.dp)
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Skeleton(height = 13.dp)
        Skeleton(height = 13.dp)
        Skeleton(Modifier.fillMaxWidth(0.7f), height = 13.dp)
    }
    BylineRule(seed, palette.separator)
    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Skeleton(height = 30.dp, circle = true)
        Column(Modifier.weight(1f)) {
            Skeleton(Modifier.width(96.dp), height = 13.dp)
            Skeleton(Modifier.padding(top = 6.dp).width(56.dp), height = 11.dp)
        }
        Skeleton(height = 18.dp, circle = true)
    }
}

/**
 * The web's desktop StoryCard (`desktopChrome`) for an expanded window's grid (design note §10):
 * the card's paper inside a hand-drawn outline (R 22, seed index × 77 + 13, 2.5 % wobble), the
 * paper grain clipped to it, then its pen line in the card's border ink; the band's content
 * inside, 22 in. A pointer over it washes the paper a shade deeper (320 ms), as BrushWash does.
 */
@Composable
fun BorderedStoryCard(content: StoryCardContent, position: Int, modifier: Modifier = Modifier, palette: Int? = null) {
    val palette = cardPalette(palette, content.accentHue, position)
    val seed = position * 77.0 + 13
    BorderedCardFrame(palette, seed, modifier) { StoryCardBody(content, palette, seed) }
}

/** [BorderedStoryCard] while its list is read: the same outline round shimmering blocks. */
@Composable
fun BorderedStoryCardSkeleton(position: Int, modifier: Modifier = Modifier, palette: Int? = null) {
    val palette = cardPalette(palette, null, position)
    val seed = position * 77.0 + 13
    WithSkeletonHue(palette.hue) {
        BorderedCardFrame(palette, seed, modifier.semantics { contentDescription = L10n.Home.moreLoading }, hover = false) {
            StoryCardSkeletonBody(palette, seed)
        }
    }
}

@Composable
private fun BorderedCardFrame(palette: CardPalette, seed: Double, modifier: Modifier, hover: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    val source = remember { MutableInteractionSource() }
    val hovered by source.collectIsHoveredAsState()
    val wash by animateFloatAsState(if (hover && hovered) 1f else 0f, tween(320), label = "cardWash")
    val interior = palette.interior
    val washed = OklchColor.parse("oklch(92.5% 0.024 ${palette.hue})") ?: interior
    Column(
        modifier
            .fillMaxWidth()
            .then(if (hover) Modifier.hoverable(source).pointerHoverIcon(PointerIcon.Hand) else Modifier)
            .drawWithCache {
                val w = (size.width / density).toDouble()
                val h = (size.height / density).toDouble()
                val outline = WobRectShape(22.0, seed, mag = min(w, h) * 0.025, options = BorderedCardWob).createOutline(size, layoutDirection, this)
                val grain = Grain.brush(GrainMode.Tile, "grain-card", size, density, BorderedCardGrain)
                val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    drawOutline(outline, if (wash > 0f) lerp(interior, washed, wash) else interior)
                    grain?.let { drawOutline(outline, it, alpha = BorderedCardGrain) }
                    drawOutline(outline, palette.border, style = pen)
                }
            }
            .padding(22.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        content = content,
    )
}

/** StoryCard.tsx's desktop outline: 3–4 turns across, 5–6 down, gentle curves, corners drifting 4. */
private val BorderedCardWob = WobRectOptions(
    curve = 0.55, cornerJitter = 0.7, cornerOffset = 4.0, segmentsH = SegValue.Range(3, 4), segmentsV = SegValue.Range(5, 6),
)

/** STORY_GRAIN.paper: the bordered card's paper grain. */
private const val BorderedCardGrain = 0.2f

/**
 * MiniStoryCard on a phone — the pared-back card of the resonance and
 * linked-cards lists: cover (0.56, the author's color when there is no
 * picture), title, avatar and name. No tags, excerpt or read time.
 */
@Composable
fun MiniStoryCard(content: StoryCardContent, position: Int, isLast: Boolean = false, modifier: Modifier = Modifier, inset: Dp = BandInset, palette: Int? = null) {
    val palette = cardPalette(palette, content.accentHue, position)
    val seed = position * 71.0 + 19
    val accent = content.authorAccent ?: palette.accent
    StoryBand(palette, seed + 17, isLast, 28.dp, 12.dp, modifier, inset = inset) {
        OrganicImage(content.imageUrl, seed + 5, Modifier.fillMaxWidth().aspectRatio(1 / 0.56f), grain = StoryGrain.Cover) {
            if (content.imageUrl == null) Box(Modifier.fillMaxSize().background(accent))
        }
        CssText(content.title, AppFonts.Family.Heading, 17f, 700, lineHeight = 1.3f, modifier = Modifier.fillMaxWidth())
        Row(Modifier.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            HandDrawnAvatar(content.authorInitials, content.authorImageUrl, accent, 30.dp, content.avatarSeed)
            BasicText(content.authorName, style = AppFonts.body(13f, 600, lineHeight = 1.4f))
        }
    }
}

/**
 * EmbedStoryCard: the smallest of the family, set inside an article — a chip
 * at most 360 wide, a 52 thumbnail, the title in the body face (14.5/600, two
 * lines) over a one-line author.
 */
@Composable
fun EmbedStoryCard(title: String, author: String?, imageUrl: String?, hue: Double?, seed: Double, modifier: Modifier = Modifier) {
    val h = hue ?: 55.0
    val interior = OklchColor.parse("oklch(97.5% 0.012 $h)") ?: Tokens.CardBg
    val accent = OklchColor.parse("oklch(90% 0.06 $h)") ?: Tokens.TerracottaLight
    val border = OklchColor.parse("oklch(52% 0.11 $h)") ?: Tokens.Terracotta
    Row(
        modifier
            .widthIn(max = 360.dp)
            .fillMaxWidth()
            .drawWithCache {
                val o = WobRectShape(16.0, seed).createOutline(size, layoutDirection, this)
                val s = Stroke(Tokens.Ink.toPx())
                onDrawBehind {
                    drawOutline(o, interior)
                    drawOutline(o, border, style = s)
                }
            }
            .padding(start = 10.dp, top = 10.dp, bottom = 10.dp, end = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OrganicImage(imageUrl, seed + 5, Modifier.size(52.dp), grain = StoryGrain.Cover) {
            if (imageUrl == null) Box(Modifier.fillMaxSize().background(accent))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            BasicText(title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.body(14.5f, 600, lineHeight = 1.35f))
            if (author != null) BasicText(author, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12f, lineHeight = 1.4f, color = Tokens.TextMuted))
        }
    }
}

/**
 * The end of a feed (design note §2): a short pen wave — `penWave(40, seed 307)` in the fields'
 * border ink at 70% — with a terracotta dot 5 past its end, and one quiet line 10 under it. Shown
 * only when nothing more can load; not a heading. The mark is decoration: the line says it all.
 */
@Composable
fun FeedEndMark(text: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Canvas(Modifier.size(width = FeedEndWave + 5.dp + 3.2.dp, height = 8.dp).clearAndSetSemantics { }) {
            val mid = size.height / 2
            val wave = penWave(FeedEndWave.value.toDouble(), 307.0, amp = 1.2, half = 4.5).toPath(density, 0f, mid)
            drawPath(wave, Tokens.FieldBorderHover.copy(alpha = 0.7f), style = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            drawCircle(Tokens.Terracotta, radius = 1.6.dp.toPx(), center = Offset((FeedEndWave + 5.dp + 1.6.dp).toPx(), mid))
        }
        BasicText(
            text,
            style = AppFonts.body(13.5f, lineHeight = 1.5f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 10.dp),
        )
    }
}

private val FeedEndWave = 40.dp
