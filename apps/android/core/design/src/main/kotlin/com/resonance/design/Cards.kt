package com.resonance.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobRect
import kotlin.math.ceil
import kotlin.math.min

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
            wobRect(w, h, min(radius, min(w, h) / 2), seed, min(w, h) * magFactor, WobRectOptions(
                curve = 0.4, cornerJitter = 1.1, cornerOffset = 6.0, segmentsH = SegValue.Range(3, 4), segmentsV = SegValue.Range(2, 3),
            ))
        }
        return Outline.Generic(cmds.toPath(d))
    }
}

/** A remote image (or placeholder) in the organic clip, bleeding past its box by the wobble's outward swing. */
@Composable
fun OrganicImage(url: String?, seed: Double, modifier: Modifier = Modifier, contentDescription: String? = null, placeholder: @Composable () -> Unit) {
    BoxWithConstraints(modifier) {
        val mag = min(maxWidth.value, maxHeight.value) * 0.05f
        val bleed = ceil(mag + 6 + 4).dp
        Box(
            Modifier
                .requiredSize(maxWidth + bleed * 2, maxHeight + bleed * 2)
                .clip(BledShape(seed, bleed.value.toDouble())),
        ) {
            placeholder()
            if (url != null) AsyncImage(model = url, contentDescription = contentDescription, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

/** The clip drawn inside a frame `bleed` larger on every side. */
private class BledShape(private val seed: Double, private val bleed: Double) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val d = density.density
        val w = size.width / d - bleed * 2
        val h = size.height / d - bleed * 2
        if (w <= 0 || h <= 0) return Outline.Rectangle(Rect.Zero)
        val cmds = wobRect(w, h, min(18.0, min(w, h) / 2), seed, min(w, h) * 0.05, WobRectOptions(
            curve = 0.4, cornerJitter = 1.1, cornerOffset = 6.0, segmentsH = SegValue.Range(3, 4), segmentsV = SegValue.Range(2, 3),
        ))
        return Outline.Generic(cmds.toPath(d, (bleed * d).toFloat(), (bleed * d).toFloat()))
    }
}

/** The web's striped cover placeholder: the card's fill, diagonal hatching, the label, grain. */
@Composable
fun StoryImagePlaceholder(fill: Color, label: String) {
    Box(Modifier.fillMaxSize().grainOverlay(0.055f), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(fill)
            val scale = maxOf(size.width / 320f, size.height / 200f)
            for (i in 0 until 22) {
                val x = (i * 22f - 160f) * scale
                drawLine(Tokens.Text.copy(alpha = 0.07f), Offset(x, 0f), Offset(x + 320f * scale, 200f * scale), strokeWidth = Tokens.InkLight.toPx())
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
)

/**
 * StoryCard as the web draws it on a phone: a full-bleed band tinted with the
 * card's hue, grain, a wavy rule along its top edge (and bottom for the last
 * card), then image, tags, title, excerpt, rule, byline.
 */
@Composable
fun StoryCard(content: StoryCardContent, position: Int, isLast: Boolean = false, modifier: Modifier = Modifier) {
    val palette = CardPalette(content.accentHue, position)
    val seed = position * 77.0 + 13
    Column(
        modifier
            .fillMaxWidth()
            .drawWithCache {
                val interior = palette.interior
                val grain = Grain.brush(GrainMode.Tile, "grain-overlay", size, density, 1f)
                val top = wavyLinePath(size.width, 6.dp.toPx(), density, seed + 17, 1.4)
                val bottom = wavyLinePath(size.width, 6.dp.toPx(), density, seed + 23, 1.4)
                val stroke = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
                onDrawBehind {
                    drawRect(interior)
                    grain?.let { drawRect(it, alpha = 0.16f) }
                    drawContext.canvas.save()
                    drawContext.transform.translate(0f, -3.dp.toPx())
                    drawPath(top, palette.border, style = stroke)
                    drawContext.canvas.restore()
                    if (isLast) {
                        drawContext.transform.translate(0f, size.height - 3.dp.toPx())
                        drawPath(bottom, palette.border, style = stroke)
                        drawContext.transform.translate(0f, -(size.height - 3.dp.toPx()))
                    }
                }
            }
            .padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        OrganicImage(content.imageUrl, seed + 5, Modifier.fillMaxWidth().aspectRatio(1 / 0.62f)) {
            StoryImagePlaceholder(palette.fill, content.imageLabel)
        }
        if (content.tags.isNotEmpty()) {
            FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                content.tags.take(4).forEach { TagPill(it, fill = palette.fill) }
            }
        }
        CssText(content.title, AppFonts.Family.Heading, 18f, 700, lineHeight = 1.3f, modifier = Modifier.fillMaxWidth())
        CssText(content.excerpt, AppFonts.Family.Body, 14f, 400, lineHeight = 1.65f, color = Tokens.TextMuted, modifier = Modifier.fillMaxWidth())
        Box(Modifier.fillMaxWidth().height(6.dp).padding(top = 0.dp).clearAndSetSemantics { }.drawWithCache {
            val p = wavyLinePath(size.width, size.height, density, seed + 91, 1.2)
            val s = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
            onDrawBehind { drawPath(p, palette.separator, style = s) }
        })
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            HandDrawnAvatar(content.authorInitials, content.authorImageUrl, palette.fill, 30.dp, content.avatarSeed)
            Column(Modifier.weight(1f)) {
                BasicText(content.authorName, style = AppFonts.body(13f, 600, lineHeight = 1.4f))
                BasicText(content.readTime, style = AppFonts.body(12f, lineHeight = 1.4f, color = Tokens.TextMuted))
            }
            OrganicIcon(IconName.ArrowRight, size = 18.dp, color = Tokens.Text.copy(alpha = 0.28f), strokeWidth = Tokens.Ink.value)
        }
        if (!content.reason.isNullOrEmpty()) {
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                OrganicIcon(IconName.Sparkle, Modifier.padding(top = 5.dp), size = 13.dp, color = palette.noteInk, strokeWidth = Tokens.InkLight.value)
                CssText(content.reason, AppFonts.Family.Handwritten, 17f, 400, lineHeight = 1.45f, color = palette.noteInk, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** EmbedStoryCard: the smallest of the family, set inside an article. */
@Composable
fun EmbedStoryCard(title: String, author: String?, imageUrl: String?, hue: Double?, seed: Double, modifier: Modifier = Modifier) {
    val h = hue ?: 55.0
    val interior = OklchColor.parse("oklch(97.5% 0.012 $h)") ?: Tokens.CardBg
    val accent = OklchColor.parse("oklch(90% 0.06 $h)") ?: Tokens.TerracottaLight
    val border = OklchColor.parse("oklch(52% 0.11 $h)") ?: Tokens.Terracotta
    Row(
        modifier
            .fillMaxWidth()
            .drawWithCache {
                val o = WobRectShape(16.0, seed).createOutline(size, layoutDirection, this)
                val s = Stroke(Tokens.Ink.toPx())
                onDrawBehind {
                    drawOutline(o, interior)
                    drawOutline(o, border, style = s)
                }
            }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        OrganicImage(imageUrl, seed + 5, Modifier.size(64.dp)) {
            Box(Modifier.fillMaxSize().grainOverlay(0.055f)) { Canvas(Modifier.fillMaxSize()) { drawRect(accent) } }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            BasicText(title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.heading(16f, lineHeight = 1.3f))
            if (author != null) BasicText(author, style = AppFonts.body(13f, color = Tokens.TextMuted))
        }
    }
}
