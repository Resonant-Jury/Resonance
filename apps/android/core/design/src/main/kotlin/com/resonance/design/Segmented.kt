package com.resonance.design

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobRect
import kotlin.math.max
import kotlin.math.min

/**
 * One segment of a [SegmentedActionBar]: its words and glyph; its own face ([fill], else the
 * bar's) and label colour ([textColor]); the ink a press spreads ([press]); what a screen reader
 * calls it when that isn't its words ([contentDescription] — the note's short label reads its
 * full words); and, for a choice, whether it is the chosen option ([selected]: a radio, not a
 * button). A [collapsible] segment shows its glyph alone when the bar has no room for every
 * label (the card page's bookmark on a narrow phone), its words kept for a screen reader.
 */
class Segment(
    val key: String,
    val label: String,
    val icon: IconName? = null,
    val fill: Color? = null,
    val textColor: Color = Mixes.ButtonOnTonal,
    val press: Color = OrganicIndication.Wash,
    val contentDescription: String? = null,
    val collapsible: Boolean = false,
    val selected: Boolean? = null,
    /** The glyph drawn filled (a saved bookmark), and its pen. */
    val iconFill: Color? = null,
    val iconStroke: Float = Tokens.InkStrong.value,
    val onClick: () -> Unit,
)

/**
 * SegmentedActionBar.tsx: actions fused into one organic bar, split by hand-drawn wavy seams. Its
 * segments are buttons, so like every button it is a filled shape with no pen line: the bar wears
 * the tonal face ([fill]), a segment may bring its own (the verb's `--button-fill`), and the
 * seams between them are cut in the paper's colour ([divider]); the buttons' grain over all of it.
 * A press spreads its ink from the finger inside its own segment.
 *
 * On a phone (narrower than 560) the bar spans its column and the segments share it evenly; wider,
 * it stands at its own width. When every label no longer fits, the [Segment.collapsible] ones
 * show their glyph alone and take only their own room ([SegmentedLayout]). Each segment is at
 * least 48 tall. Not [enabled] (the viewer's own answer still being read), it fades to 0.6 and
 * takes no tap.
 */
@Composable
fun SegmentedActionBar(
    segments: List<Segment>,
    modifier: Modifier = Modifier,
    seed: Double = 71.0,
    fill: Color = Mixes.ButtonTonal,
    divider: Color = Tokens.Cream,
    enabled: Boolean = true,
) {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val style = AppFonts.body(14f, 600, lineHeight = 1f)
    BoxWithConstraints(modifier) {
        val room = maxWidth.value
        val spread = room < SegmentedLayout.SPREAD_BELOW
        val labels = segments.map { seg ->
            with(density) { measurer.measure(seg.label, style, softWrap = false, maxLines = 1).size.width.toDp().value }
        }
        val widths = SegmentedLayout.widths(
            labels, segments.map { it.icon != null }, segments.map { it.collapsible }, room, spread,
        )
        val iconOnly = SegmentedLayout.collapses(labels, segments.map { it.icon != null }, room, spread)
        val lefts = widths.runningFold(0f) { x, w -> x + w }.dropLast(1)
        val scope = rememberCoroutineScope()
        val ink = remember { InkSpread() }
        val leftsNow by rememberUpdatedState(lefts)
        var pressed by remember { mutableStateOf<Int?>(null) }
        Row(
            Modifier
                .fade(if (enabled) 1f else 0.6f)
                // As tall as the tallest segment (a large text size), every segment that tall.
                .height(IntrinsicSize.Min)
                .drawWithCache {
                    val w = size.width / this.density
                    val h = size.height / this.density
                    val outer = wobRect(w.toDouble(), h.toDouble(), 16.0, seed, min(w, h) * 0.05, WobRectOptions(
                        segmentsH = SegValue.Range(7, 9), segmentsV = SegValue.Range(2, 3), curve = 1.2, cornerJitter = 1.2, cornerOffset = h * 0.04,
                    )).toPath(this.density)
                    // Fills overshoot the bar by `pad` and the outline trims them, so its outward swings stay filled.
                    val pad = max(12.0, h * 0.3)
                    val boundaries = lefts.drop(1).mapIndexed { i, x -> boundaryPoints(x.toDouble(), h.toDouble(), seed + i * 37 + 11, 1.6, pad) }
                    val regions = segments.indices.map { i ->
                        Path().apply {
                            op(SegmentedLayout.regionPath(i, segments.size, boundaries, w, h, pad.toFloat(), this@drawWithCache.density), outer, PathOperation.Intersect)
                        }
                    }
                    val seams = boundaries.map { polylinePath(it, this.density) }
                    val grain = Grain.brush(GrainMode.Tile, "grain-button", size, this.density, 0.38f)
                    val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round)
                    onDrawBehind {
                        drawPath(outer, fill)
                        segments.forEachIndexed { i, seg -> seg.fill?.let { drawPath(regions[i], it) } }
                        pressed?.let { i -> with(ink) { draw(regions[i], segments[i].press) } }
                        clipPath(outer) { seams.forEach { drawPath(it, divider, style = pen) } }
                        grain?.let { drawPath(outer, it, alpha = 0.38f) }
                    }
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            segments.forEachIndexed { i, seg ->
                val source = remember { MutableInteractionSource() }
                LaunchedEffect(source) {
                    source.interactions.collect {
                        when (it) {
                            is PressInteraction.Press -> {
                                pressed = i
                                ink.press(scope, Offset(it.pressPosition.x + with(density) { leftsNow[i].dp.toPx() }, it.pressPosition.y))
                            }
                            is PressInteraction.Release, is PressInteraction.Cancel -> ink.release(scope)
                        }
                    }
                }
                val collapsed = iconOnly && seg.collapsible
                Row(
                    Modifier
                        .width(widths[i].dp)
                        .fillMaxHeight()
                        .heightIn(min = 48.dp)
                        .clickable(source, indication = null, enabled = enabled, role = if (seg.selected != null) Role.RadioButton else Role.Button, onClick = seg.onClick)
                        .semantics {
                            (seg.contentDescription ?: seg.label.takeIf { collapsed })?.let { contentDescription = it }
                            seg.selected?.let { selected = it }
                        }
                        .padding(horizontal = if (collapsed) 16.dp else SegmentedLayout.PAD.dp, vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(SegmentedLayout.GAP.dp, Alignment.CenterHorizontally),
                ) {
                    seg.icon?.let { OrganicIcon(it, size = SegmentedLayout.ICON.dp, color = seg.textColor, strokeWidth = seg.iconStroke, fill = seg.iconFill) }
                    if (!collapsed) BasicText(
                        seg.label, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis,
                        style = style.copy(color = seg.textColor),
                        // The short label stands for the full words, which are read instead.
                        modifier = if (seg.contentDescription != null) Modifier.clearAndSetSemantics { } else Modifier,
                    )
                }
            }
        }
    }
}

/**
 * How a [SegmentedActionBar] shares its width (dp), apart from Compose so it can be tested — the
 * web's: a segment's own width is its padding, glyph, gap and label; on a phone the bar spans
 * the room and the segments share it evenly, a glyph alone taking only its own; the collapsible
 * segments drop their words once the labels (at their own widths) need more than the room.
 */
object SegmentedLayout {
    /** Narrower than this the bar spans its column (the web's 560px). */
    const val SPREAD_BELOW = 560f
    /** A segment's padding a side on a phone (the web's `clamp(8px, 2vw, 14px)` at a phone's width), its glyph and the gap after it. */
    const val PAD = 8f
    const val ICON = 16f
    const val GAP = 8f
    /** A glyph alone: 16 a side. */
    const val ICON_ONLY = ICON + 32f
    /** Wider, a segment stands at its own width with the web's desktop padding. */
    const val WIDE_PAD = 24f

    /** A segment's own width: its padding, glyph, gap and label — and a dp to spare, so rounding to pixels never cuts the label. */
    private fun natural(label: Float, icon: Boolean, pad: Float) = 2 * pad + label + (if (icon) ICON + GAP else 0f) + 1f

    /** Whether the collapsible segments show their glyph alone: every label at its own width needs more than [room]. */
    fun collapses(labels: List<Float>, icons: List<Boolean>, room: Float, spread: Boolean): Boolean {
        val pad = if (spread) PAD else WIDE_PAD
        return labels.indices.sumOf { natural(labels[it], icons[it], pad).toDouble() } > room + 0.5
    }

    fun widths(labels: List<Float>, icons: List<Boolean>, collapsible: List<Boolean>, room: Float, spread: Boolean): List<Float> {
        val tight = collapses(labels, icons, room, spread)
        val alone = labels.indices.map { tight && collapsible[it] && icons[it] }
        if (!spread) return labels.indices.map { if (alone[it]) ICON_ONLY else natural(labels[it], icons[it], WIDE_PAD) }
        // Shared evenly (the web's `flex: 1`), but never narrower than a segment's own words (its min-content):
        // one that needs more than an even share keeps its own width, and the rest is shared again.
        val widths = labels.indices.map { if (alone[it]) ICON_ONLY else 0f }.toMutableList()
        val open = labels.indices.filter { !alone[it] }.toMutableList()
        var rest = room - alone.count { it } * ICON_ONLY
        while (open.isNotEmpty()) {
            val share = rest / open.size
            val wide = open.filter { natural(labels[it], icons[it], PAD) > share }
            if (wide.isEmpty()) {
                open.forEach { widths[it] = share }
                break
            }
            wide.forEach {
                widths[it] = natural(labels[it], icons[it], PAD)
                rest -= widths[it]
                open.remove(it)
            }
        }
        return widths
    }

    /**
     * Segment [i]'s region (px): between its two seams, straight outer edges pushed [pad] past the
     * bar (the outline trims them) — the web's segmentRegion, so a fill's edge lies under its seam.
     */
    fun regionPath(i: Int, count: Int, boundaries: List<List<Offset>>, w: Float, h: Float, pad: Float, density: Float): Path {
        val left = if (i == 0) listOf(Offset(-pad, -pad), Offset(-pad, h + pad)) else boundaries[i - 1]
        val right = if (i == count - 1) listOf(Offset(w + pad, -pad), Offset(w + pad, h + pad)) else boundaries[i]
        val points = left + right.reversed()
        return Path().apply {
            points.forEachIndexed { k, p -> if (k == 0) moveTo(p.x * density, p.y * density) else lineTo(p.x * density, p.y * density) }
            close()
        }
    }
}
