package com.resonance.design

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n

/** The shimmer's highlight: the theme's light accent, or a card's own hue inside a card. */
val LocalSkeletonHighlight = compositionLocalOf { Mixes.skeletonHighlight() }

/** CSS `ease`. */
private val Ease = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

/**
 * Skeleton.tsx: one warm placeholder block. The fill is a sand → highlight →
 * sand band four times the block's width sliding across it over 1.5s (the
 * web's 400% background from 100% to −100%); with animations removed it rests
 * as plain sand. Width comes from `modifier` (full width by default).
 */
@Composable
fun Skeleton(modifier: Modifier = Modifier, height: Dp = 14.dp, radius: Dp = 7.dp, circle: Boolean = false) {
    val highlight = LocalSkeletonHighlight.current
    val context = LocalContext.current
    val still = remember(context) { context.prefersReducedMotion() }
    val t = if (still) null else rememberInfiniteTransition(label = "skeleton").animateFloat(
        0f, 1f, infiniteRepeatable(tween(1500, easing = Ease)), label = "shimmer",
    )
    val sized = if (circle) modifier.size(height) else modifier.fillMaxWidth().height(height)
    Box(
        sized
            .clip(if (circle) CircleShape else RoundedCornerShape(radius))
            .clearAndSetSemantics { }
            .drawBehind {
                val p = t?.value ?: return@drawBehind drawRect(Mixes.SkeletonBase)
                val w = size.width
                // background-position 100% → −100% moves the 4w-wide band's left edge from −3w to 3w.
                val left = -3f * w * (1f - 2f * p)
                drawRect(
                    Brush.horizontalGradient(
                        0.25f to Mixes.SkeletonBase, 0.37f to highlight, 0.63f to Mixes.SkeletonBase,
                        startX = left, endX = left + 4f * w,
                    ),
                )
            },
    )
}

/** Six (or `count`) StoryCards in their loading dress, as the web's FeedSkeleton. */
fun androidx.compose.foundation.lazy.LazyListScope.storyCardSkeletons(count: Int = 6, firstUnderBar: Boolean = false, layout: CardListLayout = CardListLayout.Phone) {
    if (!layout.isGrid) {
        items(count) { i -> StoryCardSkeleton(i, isLast = i == count - 1, isFirst = firstUnderBar && i == 0, inset = layout.inset) }
        return
    }
    // The bordered grid's skeleton: the same outlines in the same columns, the first row clear of the bar.
    item(key = "grid-skeleton") {
        androidx.compose.foundation.layout.Row(
            Modifier.fillMaxWidth().padding(horizontal = layout.gridInset).padding(top = if (firstUnderBar) GridUnderBar else 0.dp),
            horizontalArrangement = Arrangement.spacedBy(Tokens.FeedGap.dp),
        ) {
            for (c in 0 until layout.columns) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Tokens.FeedGap.dp)) {
                    for (i in c until count step layout.columns) BorderedStoryCardSkeleton(i)
                }
            }
        }
    }
}

/**
 * Where a bordered grid's first row starts in a list that begins under the bar's wavy band:
 * 28 below the bar's pen line (design note §2), so no outline is under the bar at rest.
 */
val GridUnderBar = HeaderEdgeHeight + 28.dp - (1.4f + Tokens.Ink.value).dp

/**
 * CardDetailSkeleton.tsx on a phone: the byline, the cover, two title lines,
 * the story's first lines and a few tags, at the real page's sizes and gaps.
 */
@Composable
fun CardDetailSkeleton(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().semantics { contentDescription = L10n.Home.moreLoading }) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Skeleton(height = 44.dp, circle = true)
            Column(Modifier.weight(1f)) {
                Skeleton(Modifier.width(140.dp), height = 15.dp)
                Skeleton(Modifier.padding(top = 7.dp).width(96.dp), height = 13.dp)
            }
        }
        Skeleton(Modifier.padding(top = 28.dp, bottom = 20.dp), height = 180.dp, radius = 18.dp)
        Column(Modifier.padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Skeleton(Modifier.fillMaxWidth(0.9f), height = 38.dp)
            Skeleton(Modifier.fillMaxWidth(0.55f), height = 38.dp)
        }
        StorySkeleton()
    }
}

/**
 * The lower half of [CardDetailSkeleton]: the story's first lines and a few tags — what a card
 * page still waits for once its head is drawn from the list the card was opened in.
 */
@Composable
fun StorySkeleton(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        Column(Modifier.padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(3) { Skeleton(height = 17.dp) }
            Skeleton(Modifier.fillMaxWidth(0.65f), height = 17.dp)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(64, 84, 56).forEach { Skeleton(Modifier.width(it.dp), height = 26.dp, radius = 13.dp) }
        }
    }
}

/** Provides a card's own shimmer (`oklch(88% 0.08 hue)`) to the skeletons inside it. */
@Composable
internal fun WithSkeletonHue(hue: Double, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalSkeletonHighlight provides Mixes.skeletonHighlight(hue), content = content)
}
