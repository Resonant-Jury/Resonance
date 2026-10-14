package com.resonance.design

import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.semantics.selected
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.design.generated.Tokens
import com.resonance.geometry.wavyVertical
import com.resonance.kit.story.StoryBlock
import kotlinx.coroutines.launch
import java.util.IdentityHashMap
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** One entry of a story's table of contents: an h2 or an h3, in reading order. */
class TocHeading(val block: StoryBlock.Heading, val text: String) {
    val level: Int get() = block.level
}

object StoryToc {
    /**
     * The story's h2 and h3 in reading order, inside quotes and list items too — what the web's
     * CardDetailClient finds with `querySelectorAll('h2, h3')` in the rendered story; a heading
     * with no words (no slug, so no anchor on the web) is left out.
     */
    fun headings(blocks: List<StoryBlock>): List<TocHeading> {
        val out = ArrayList<TocHeading>()
        fun walk(list: List<StoryBlock>) {
            for (b in list) when (b) {
                is StoryBlock.Heading -> if (b.level == 2 || b.level == 3) {
                    val text = b.runs.joinToString("") { it.text }.trim()
                    if (text.isNotEmpty()) out += TocHeading(b, text)
                }
                is StoryBlock.Quote -> walk(b.children)
                is StoryBlock.ListBlock -> b.items.forEach(::walk)
                else -> {}
            }
        }
        walk(blocks)
        return out
    }
}

/**
 * Where a story's headings are laid out, for the table of contents to scroll to: each heading's
 * [StoryMarkdown] `headingAnchor` records its coordinates (by the block itself — two headings with
 * the same words are two places).
 */
@Stable
class StoryAnchors {
    private val placed = IdentityHashMap<StoryBlock.Heading, LayoutCoordinates>()

    fun anchor(block: StoryBlock.Heading): Modifier = Modifier.onPlaced { placed[block] = it }

    /** Where [heading] is in [within] (null when either isn't laid out now). */
    fun positionIn(within: LayoutCoordinates?, heading: StoryBlock.Heading): Float? {
        val at = placed[heading] ?: return null
        if (within == null || !within.isAttached || !at.isAttached) return null
        return within.localPositionOf(at, Offset.Zero).y
    }

    companion object {
        /**
         * The heading being read: the last whose top ([tops], in reading order, the same space as
         * [line]; null where not laid out) has passed the reading [line]; none before the first has.
         */
        fun <T> reading(headings: List<T>, tops: (T) -> Float?, line: Float): T? {
            var found: T? = null
            for (h in headings) {
                val top = tops(h) ?: break
                if (top <= line) found = h else break
            }
            return found
        }
    }
}

/**
 * scrollbarGeometry.ts `thumbGeometry`, in dp: where a scroller's thumb stands on a track [trackH]
 * tall — as long as the visible share of the content (at least [MIN], at most the track), as far
 * down as the scroller is. Null when there is nothing worth a bar (a scroll range of 6 or less) or
 * nothing measured yet. [max] is the scroll range.
 */
data class ScrollThumb(val h: Float, val top: Float, val max: Float) {
    companion object {
        const val MIN = 36f

        fun of(scrollTop: Float, scrollHeight: Float, clientHeight: Float, trackH: Float): ScrollThumb? {
            val max = scrollHeight - clientHeight
            if (max <= 6f || trackH <= 0f || clientHeight <= 0f) return null
            val h = min(trackH, max(MIN, trackH * clientHeight / scrollHeight)).roundToInt().toFloat()
            val progress = (scrollTop / max).coerceIn(0f, 1f)
            return ScrollThumb(h, (trackH - h) * progress, max)
        }

        /** `scrollTopForThumb`: the scroll that puts a thumb [h] long at [thumbTop] (clamped to the track's ends). */
        fun scrollFor(thumbTop: Float, trackH: Float, h: Float, max: Float): Float {
            val room = trackH - h
            if (room <= 0f) return 0f
            return thumbTop.coerceIn(0f, room) / room * max
        }
    }
}

/**
 * CardToc.tsx, in a card page's rail: the title (12/600, spaced capitals, muted), 10 under it the
 * headings — 14 muted, terracotta while pressed or pointed at; an h3 12 in — and a tap on one is
 * [onSelect]. The heading being read ([active]: the page decides which) is terracotta too, its
 * weight unchanged; when it changes the list brings its row a third of the way down what shows
 * (250 ms, at once with animations off; clamped to the list's ends) — not while the reader holds
 * the list or its stretch. Given less room than it needs (the rail stops at the window) the list
 * scrolls in place, with no bar of its own: the wavy rule down its left (wavyVertical, amp 5,
 * seed 9, the fields' border ink) stays put, as tall as the list shows, and a terracotta stretch of
 * it (INK_STRONG, round ends, its length along the curve) stands for the part in view, sized and
 * placed by [ScrollThumb] — dragged, it scrolls the list; a tap on the rule above or below it moves
 * the list a page. At most min([TocMaxHeight], half the window) of the list shows. The side the list
 * can still move toward fades out over [TocFade]. A list with room to spare is still: a drag over it
 * is the page's.
 */
@Composable
fun StoryToc(
    headings: List<TocHeading>,
    title: String,
    onSelect: (TocHeading) -> Unit,
    modifier: Modifier = Modifier,
    active: TocHeading? = null,
) {
    if (headings.isEmpty()) return
    val scroll = rememberScrollState()
    val toc = remember(headings) { TocLayout(headings.size) }
    val context = LocalContext.current
    val still = remember(context) { context.prefersReducedMotion() }
    val listHeld by scroll.interactionSource.collectIsDraggedAsState()
    LaunchedEffect(active, toc) {
        val i = headings.indexOfFirst { it === active }
        if (i < 0) return@LaunchedEffect
        // A row not laid out yet (the page just came in): a frame on, it is.
        if (toc.rowTops[i] < 0f) withFrameNanos { }
        if (toc.ruleHeld || listHeld) return@LaunchedEffect
        val target = TocLayout.followScroll(toc.rowTops[i], toc.viewport.toFloat(), scroll.maxValue) ?: return@LaunchedEffect
        if (still) scroll.scrollTo(target) else scroll.animateScrollTo(target, tween(TOC_FOLLOW_MILLIS))
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BasicText(
            title.uppercase(),
            style = AppFonts.body(12f, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.08.em),
            modifier = Modifier.semantics { heading() },
        )
        // A long contents stays a sidebar, not a second page: at most min(360, half the window)
        // shows (about a dozen rows), the rest scrolls; the rail's own room caps it further.
        val window = LocalWindowInfo.current.containerSize.height
        val cap = with(LocalDensity.current) { minOf(TocMaxHeight, (window / 2).toDp()) }
        TocRule(scroll, toc, Modifier.weight(1f, fill = false).heightIn(max = cap)) {
            headings.forEachIndexed { i, h ->
                TocLink(h, h === active, Modifier.onPlaced { toc.rowTops[i] = it.positionInParent().y }, onSelect)
            }
        }
    }
}

/**
 * What the table of contents knows of its own layout, outside composition: where each row's top is
 * in the list's content, how tall the part that shows is, and whether a finger holds the stretch.
 */
internal class TocLayout(rows: Int) {
    val rowTops = FloatArray(rows) { -1f }
    var viewport = 0
    var ruleHeld = false

    companion object {
        /**
         * The scroll that sets a row whose top is [rowTop] (in the content, px) a third of the way down
         * a list [viewport] tall, clamped to its ends ([max] its scroll range); null before either is known.
         */
        fun followScroll(rowTop: Float, viewport: Float, max: Int): Int? {
            if (rowTop < 0f || viewport <= 0f || max == Int.MAX_VALUE) return null
            return (rowTop - viewport / 3f).roundToInt().coerceIn(0, max.coerceAtLeast(0))
        }
    }
}

/** The most of a long list that shows at once (CardToc's `max-height: min(360px, 50vh)`). */
private val TocMaxHeight = 360.dp

/** The list following the heading being read. */
private const val TOC_FOLLOW_MILLIS = 250

/** How far the list fades out at an edge it can still move toward. */
private val TocFade = 16.dp

/** The rule's column: as wide as the curve's swing and its pen, plus 2 (CardToc's RAIL_W). */
private val TocRuleWidth = (TOC_AMP * 2).dp + Tokens.InkLight + 2.dp
private const val TOC_AMP = 5.0
private const val TOC_SEED = 9.0
/** A tap on the rule above or below the stretch moves the list this share of what shows. */
private const val TOC_PAGE = 0.9f
/** How far round the stretch a finger still takes hold of it. */
private val TocGrabSlack = 12.dp

@Composable
private fun TocRule(scroll: ScrollState, toc: TocLayout, modifier: Modifier, content: @Composable () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val still = remember(context) { context.prefersReducedMotion() }
    // A wheel's notch as the platform's views take it.
    val wheelStep = remember(context) { android.view.ViewConfiguration.get(context).scaledVerticalScrollFactor }
    // A list that scrolls keeps its drags (the web's overscroll-behavior: contain); one with room to
    // spare hands them on, so the page under the rail still scrolls.
    val contain = remember(scroll) {
        object : NestedScrollConnection {
            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset =
                if (scroll.maxValue in 1 until Int.MAX_VALUE) available.copy(x = 0f) else Offset.Zero
            override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity =
                if (scroll.maxValue in 1 until Int.MAX_VALUE) available.copy(x = 0f) else Velocity.Zero
        }
    }
    Box(
        modifier
            .drawWithCache {
                val track = size.height / density
                val path: Path = wavyVertical(track.toDouble(), TOC_SEED, TOC_AMP, max(5, (track / 32).roundToInt()))
                    .toPath(density, TocRuleWidth.toPx() / 2)
                val measure = PathMeasure().apply { setPath(path, false) }
                val length = measure.length
                val rule = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
                val stretch = Stroke(Tokens.InkStrong.toPx(), cap = StrokeCap.Round)
                val part = Path()
                onDrawBehind {
                    drawPath(path, Tokens.FieldBorder, style = rule)
                    // Read while drawing: scrolling redraws the stretch and recomposes nothing.
                    val thumb = thumbOf(scroll, size.height, density) ?: return@onDrawBehind
                    part.reset()
                    measure.getSegment(length * thumb.top / track, length * (thumb.top + thumb.h) / track, part, true)
                    drawPath(part, Tokens.Terracotta, style = stretch)
                }
            }
            .pointerInput(scroll, still) {
                val ruleW = TocRuleWidth.toPx()
                val slack = TocGrabSlack.toPx()
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    if (down.position.x > ruleW + slack / 2) return@awaitEachGesture
                    val thumb = thumbOf(scroll, size.height.toFloat(), density) ?: return@awaitEachGesture
                    val y = down.position.y / density
                    val grabbed = y >= thumb.top - slack / density && y <= thumb.top + thumb.h + slack / density
                    down.consume()
                    toc.ruleHeld = grabbed
                    if (!grabbed) {
                        // The rule above or below the stretch: a page up or down.
                        val by = (if (y < thumb.top) -1 else 1) * size.height * TOC_PAGE
                        scope.launch { if (still) scroll.scrollBy(by) else scroll.animateScrollBy(by) }
                    }
                    // Grabbed: the stretch keeps the place under the finger it was taken by.
                    val grab = (y - thumb.top).coerceIn(0f, thumb.h)
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull { it.id == down.id } ?: break
                        if (!change.pressed) break
                        if (grabbed) {
                            val now = thumbOf(scroll, size.height.toFloat(), density) ?: break
                            val target = ScrollThumb.scrollFor(change.position.y / density - grab, size.height / density, now.h, now.max) * density
                            scroll.dispatchRawDelta(target - scroll.value)
                        }
                        change.consume()
                    }
                    toc.ruleHeld = false
                }
            }
            .pointerInput(scroll, wheelStep) {
                // A wheel over the rule scrolls the list too.
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        if (event.type != PointerEventType.Scroll || scroll.maxValue !in 1 until Int.MAX_VALUE) continue
                        val change = event.changes.firstOrNull() ?: continue
                        if (change.position.x > TocRuleWidth.toPx()) continue
                        scroll.dispatchRawDelta(change.scrollDelta.y * wheelStep)
                        change.consume()
                    }
                }
            },
    ) {
        Column(
            Modifier
                .padding(start = TocRuleWidth)
                .onSizeChanged { toc.viewport = it.height }
                .scrollFade(scroll, TocFade)
                .nestedScroll(contain)
                .verticalScroll(scroll)
                // Room for a pressed heading's ink at the ends; the list's own 6 from the rule.
                .padding(start = 6.dp, end = 4.dp, top = 2.dp, bottom = 2.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) { content() }
    }
}

/** The thumb on a track [heightPx] tall, from where [scroll] is (in dp; null: nothing to scroll). */
private fun thumbOf(scroll: ScrollState, heightPx: Float, density: Float): ScrollThumb? {
    val max = scroll.maxValue
    if (max == Int.MAX_VALUE) return null
    return ScrollThumb.of(scroll.value / density, (heightPx + max) / density, heightPx / density, heightPx / density)
}

@Composable
private fun TocLink(heading: TocHeading, reading: Boolean, modifier: Modifier, onSelect: (TocHeading) -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val hovered by source.collectIsHoveredAsState()
    BasicText(
        heading.text,
        style = AppFonts.body(14f, lineHeight = 1.45f, color = if (reading || pressed || hovered) Tokens.Terracotta else Tokens.TextMuted),
        modifier = modifier
            .fillMaxWidth()
            .semantics { selected = reading }
            .padding(start = if (heading.level == 3) 12.dp else 0.dp)
            .hoverable(source)
            .clickable(source, indication = null, role = Role.Button) { onSelect(heading) }
            .padding(vertical = 4.dp),
    )
}

/**
 * A scroller that fades out at the edge it can still move toward (CSS `mask-image` on its
 * viewport), over [edge] — the fade growing in over the first [edge] of scroll, so it never pops.
 * Put it outside the scroll modifier, so the mask stays on the viewport.
 */
fun Modifier.scrollFade(scroll: ScrollState, edge: Dp): Modifier =
    graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }.drawWithContent {
        drawContent()
        val max = scroll.maxValue
        if (max <= 0 || max == Int.MAX_VALUE) return@drawWithContent
        val e = min(edge.toPx(), size.height / 2)
        if (e <= 0f) return@drawWithContent
        val above = (scroll.value / e).coerceIn(0f, 1f)
        val below = ((max - scroll.value) / e).coerceIn(0f, 1f)
        if (above > 0f) drawRect(
            Brush.verticalGradient(listOf(Color.Black.copy(alpha = above), Color.Transparent), startY = 0f, endY = e),
            size = Size(size.width, e), blendMode = BlendMode.DstOut,
        )
        if (below > 0f) drawRect(
            Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = below)), startY = size.height - e, endY = size.height),
            topLeft = Offset(0f, size.height - e), size = Size(size.width, e), blendMode = BlendMode.DstOut,
        )
    }
