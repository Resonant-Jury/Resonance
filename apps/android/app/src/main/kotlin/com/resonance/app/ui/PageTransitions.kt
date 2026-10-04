package com.resonance.app.ui

import androidx.activity.BackEventCompat
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.navigation3.scene.Scene
import androidx.navigation3.ui.LocalNavAnimatedContentScope
import com.resonance.design.cream

/*
 * How pages arrive and leave: Material 3's page motion, with the predictive back the system plays
 * between activities on new Android. NavDisplay still decides which transition runs and sequences
 * it (seeks the predictive one with the finger, finishes or reverses it on release, keeps the
 * leaving page composed until it is done, and draws the page that is opening or being dismissed
 * above the other). A ContentTransform cannot say a scrim or rounded corners, nor "follow the
 * finger, then fade where it was let go", so the specs below are empty transforms that only name
 * the move, and each page draws its own part of it in [PageFrame] from how far its transition has
 * got.
 */

/** The kinds of move, each with how long it takes. */
internal enum class PageMove(val millis: Int) {
    /** A page opened over the current one (and a page replacing the one that closed). */
    Push(350),

    /** Back from the arrow, the 3-button key or code. */
    Pop(300),

    /**
     * Back by edge swipe. NavDisplay seeks the move with the finger — the page shrinks over its
     * first third, which is what the finger moves — and, once let go, plays what is left of it in
     * time: (1 − how far the finger got) × this. So it is short, and what the page does in that
     * time is not the rest of the swipe but [releasedPose]: back at once, as the system's own back
     * between apps is.
     */
    Predictive(150),

    /** The other tab's page replacing this one. */
    Tabs(150),
}

internal enum class PageRole { Resting, Entering, Exiting }

/** Where a page is, and how it looks, part of the way through a move. Distances are in px. */
internal data class PagePose(
    val translationX: Float = 0f,
    val scale: Float = 1f,
    val corner: Float = 0f,
    val alpha: Float = 1f,
    /** How dark a black layer between this page and the one below it is (0 draws nothing). */
    val scrim: Float = 0f,
)

internal object PageMotionSpec {
    const val SCRIM = 0.35f

    /** The page below drifts this far (of the width) toward the start side as another opens over it. */
    const val PARALLAX = 0.25f

    /** Predictive back: the page shrinks to this, over the first [PREDICTIVE_SHRINK] of the move, and rounds to [CORNER_DP]. */
    const val PREDICTIVE_SCALE = 0.9f
    const val PREDICTIVE_SHRINK = 1f / 3f
    // At 0.9 a 411 dp phone's page is inset about 20 dp a side; 12 keeps it about 8 dp clear of the edge.
    const val SHIFT_DP = 12f
    const val CORNER_DP = 28f

    /** Let go, the page drifts on this far the way the finger went as it fades, and shrinks by [RELEASE_SHRINK] more (never back toward rest). */
    const val RELEASE_DRIFT_DP = 8f
    const val RELEASE_SHRINK = 0.02f

    val Emphasized = CubicBezierEasing(0.2f, 0f, 0f, 1f)
    val EmphasizedDecelerate = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)
    val EmphasizedAccelerate = CubicBezierEasing(0.3f, 0f, 0.8f, 0.15f)
}

/**
 * The pose of a page [f] of the way (0..1) through [move]. [end] is +1 where the end side is on the
 * right (left-to-right layouts) and -1 where it is on the left; [finger] is +1 when a back swipe
 * moves to the right (from the left edge) and -1 when it moves to the left. Those are different on
 * purpose: opening and closing a page follow the reading direction, but a swipe goes where the
 * finger goes.
 */
internal fun pagePose(
    move: PageMove,
    role: PageRole,
    f: Float,
    width: Float,
    end: Float,
    finger: Float,
    shift: Float,
    corner: Float,
): PagePose {
    if (role == PageRole.Resting) return PagePose()
    val entering = role == PageRole.Entering
    return when (move) {
        PageMove.Push -> {
            val e = PageMotionSpec.EmphasizedDecelerate.transform(f)
            // The page opening comes in from the end side over a scrim that darkens the one below; the
            // one below drifts toward the start side. The scrim is the opening page's, drawn behind it.
            if (entering) PagePose(translationX = end * width * (1f - e), scrim = PageMotionSpec.SCRIM * e)
            else PagePose(translationX = -end * width * PageMotionSpec.PARALLAX * e)
        }
        PageMove.Pop -> {
            val e = PageMotionSpec.Emphasized.transform(f)
            if (entering) PagePose(translationX = -end * width * PageMotionSpec.PARALLAX * (1f - e))
            else PagePose(translationX = end * width * e, scrim = PageMotionSpec.SCRIM * (1f - e))
        }
        PageMove.Predictive -> {
            if (entering) return PagePose()
            val shrink = PageMotionSpec.Emphasized.transform((f / PageMotionSpec.PREDICTIVE_SHRINK).coerceIn(0f, 1f))
            val leave = PageMotionSpec.EmphasizedAccelerate.transform(
                ((f - PageMotionSpec.PREDICTIVE_SHRINK) / (1f - PageMotionSpec.PREDICTIVE_SHRINK)).coerceIn(0f, 1f),
            )
            PagePose(
                // The small shift, then (once let go) off the screen: width is more than enough with the page at 0.9.
                translationX = finger * (shift * shrink + width * leave),
                scale = 1f - (1f - PageMotionSpec.PREDICTIVE_SCALE) * shrink,
                corner = corner * shrink,
                scrim = PageMotionSpec.SCRIM * (1f - f),
            )
        }
        // The new tab fades in over the old one, which stays whole until it is covered: two pages
        // fading at once would let the cream behind them show through mid-way.
        PageMove.Tabs -> PagePose(alpha = if (entering) f else 1f)
    }
}

/**
 * A page let go of mid-swipe, and going ([releasing]): it stays as the finger left it ([drag], the
 * swipe's pose at that moment) and fades, most of the way in the first few frames, with the scrim
 * under it clearing as it goes — so the page beneath is there at once, as when the system goes back
 * between apps. On the way it drifts on a little ([drift] px) the way the finger went ([finger])
 * and shrinks a touch, so it reads as carried on, not stopped. [t] is how far the rest of the move
 * has got (0..1); at 0 the page is exactly as it was let go.
 */
internal fun releasedPose(drag: PagePose, t: Float, finger: Float, drift: Float): PagePose {
    val k = LinearOutSlowInEasing.transform(t.coerceIn(0f, 1f))
    return drag.copy(
        translationX = drag.translationX + finger * drift * k,
        scale = drag.scale - PageMotionSpec.RELEASE_SHRINK * k,
        alpha = drag.alpha * (1f - k),
        scrim = drag.scrim * (1f - k),
    )
}

/**
 * Whether a page is being let go of: it was leaving by a back swipe and the swipe went through, so
 * its route is no longer on its stack ([onStack]). A swipe called off leaves it there (and it goes
 * back as the finger brings it), and a back by the arrow or the key is a [PageMove.Pop].
 */
internal fun releasing(move: PageMove, role: PageRole, onStack: Boolean): Boolean =
    move == PageMove.Predictive && role == PageRole.Exiting && !onStack

/**
 * Which move is starting, taken from the spec NavDisplay picks rather than worked out again from the
 * back stack and the gesture: [push] when the stack grew or a page replaced another, [pop] when it
 * shrank without a gesture, [predictivePop] while an edge swipe seeks the pop (the release finishes
 * that same transition) with the edge it began at. Switching tabs swaps the whole list of entries,
 * which NavDisplay takes for a push, so [push] tells it by the two pages being on different tabs.
 *
 * What a spec writes is only good for the moment a move begins: NavDisplay runs the specs more than
 * once, and not at all for the new direction when a back arrives while the page it goes back to is
 * still leaving (a push cut short). [PageFrame] therefore reads it once, when its page starts a move,
 * and keeps it until the page is settled again.
 */
internal class PageMotion {
    var move: PageMove = PageMove.Push
        private set
    var edge: Int = BackEventCompat.EDGE_LEFT
        private set

    private val still = EnterTransition.None togetherWith ExitTransition.None

    val push: AnimatedContentTransitionScope<Scene<Route>>.() -> ContentTransform = {
        move = if (initialState.tab != targetState.tab) PageMove.Tabs else PageMove.Push
        still
    }

    val pop: AnimatedContentTransitionScope<Scene<Route>>.() -> ContentTransform = {
        move = PageMove.Pop
        still
    }

    val predictivePop: AnimatedContentTransitionScope<Scene<Route>>.(Int) -> ContentTransform = { swipeEdge ->
        move = PageMove.Predictive
        edge = swipeEdge
        still
    }

    private val Scene<Route>.tab: Tab? get() = entries.lastOrNull()?.metadata?.get(TAB_METADATA) as? Tab

    companion object {
        /** The key under which an entry's metadata names the tab whose stack it is on. */
        const val TAB_METADATA = "resonance.tab"
    }
}

/** What a page is doing in the move it is part of, fixed when the move starts. */
private class PagePart(val move: PageMove, val edge: Int, val role: PageRole)

private class PartHolder {
    var part: PagePart? = null

    /** How far the swipe had got when it was let go ([releasing]); the page is drawn from that pose until it is gone. */
    var releasedAt: Float? = null
}

/**
 * Draws a page in its move: the page itself (shifted, scaled, rounded) and, behind it, the scrim.
 * A scrim drawn behind the page on top (the one opening, or the one being dismissed) darkens only
 * what is below it, whichever way the move goes; the page below draws none.
 *
 * How far the move has got is a linear 0..1 animation on the page's own enter/exit transition,
 * which NavDisplay seeks with a back swipe and runs by itself otherwise; [pagePose] shapes it.
 *
 * The part a page plays (which move, entering or leaving) is taken when it stops being settled and
 * kept until it settles again. Going by the transition's states instead would turn a page that was
 * opening into one that is leaving the moment a back cuts the push short, and it would jump; kept,
 * the same animation just runs backwards.
 *
 * A swipe let go of is told by the page's own route leaving its stack ([onStack]: that route, by
 * identity, still at the page's place), which NavDisplay does on the release that goes through and
 * not on one called off. Both are read while drawing, so the release changes how the page is drawn
 * from the next frame, without composing it again.
 */
@Composable
internal fun PageFrame(motion: PageMotion, onStack: () -> Boolean, content: @Composable () -> Unit) {
    val transition = LocalNavAnimatedContentScope.current.transition
    val held = remember { PartHolder() }
    val progress = transition.animateFloat(
        transitionSpec = { tween((held.part?.move ?: motion.move).millis, easing = LinearEasing) },
        label = "page",
    ) { if (it == EnterExitState.Visible) 1f else 0f }
    val settled by remember(transition) {
        derivedStateOf { transition.targetState == EnterExitState.Visible && progress.value >= SETTLED }
    }
    if (settled) {
        held.part = null
        held.releasedAt = null
    } else if (held.part == null) {
        val role = if (transition.targetState == EnterExitState.PostExit) PageRole.Exiting else PageRole.Entering
        held.part = PagePart(motion.move, motion.edge, role)
    }
    val part = held.part
    val move = part?.move ?: PageMove.Push
    val role = part?.role ?: PageRole.Resting
    val end = if (LocalLayoutDirection.current == LayoutDirection.Rtl) -1f else 1f
    val finger = if (part?.edge == BackEventCompat.EDGE_RIGHT) -1f else 1f

    // The page's pose now (read while drawing): the move [f] of the way through — or, let go of, the
    // pose it was let go in, fading. The scrim's pass needs no shift or corner.
    fun pose(width: Float, shift: Float, corner: Float, drift: Float): PagePose {
        val f = if (role == PageRole.Exiting) 1f - progress.value else progress.value
        if (!releasing(move, role, onStack())) return pagePose(move, role, f, width, end, finger, shift, corner)
        val at = held.releasedAt ?: f.also { held.releasedAt = it }
        val t = if (at >= 1f) 1f else (f - at) / (1f - at)
        return releasedPose(pagePose(move, role, at, width, end, finger, shift, corner), t, finger, drift)
    }

    Box(
        Modifier.fillMaxSize().drawBehind {
            val scrim = pose(size.width, 0f, 0f, 0f).scrim
            if (scrim > 0f) drawRect(Color.Black, alpha = scrim)
        },
    ) {
        Box(
            Modifier.fillMaxSize()
                .graphicsLayer {
                    val pose = pose(
                        size.width,
                        PageMotionSpec.SHIFT_DP.dp.toPx(),
                        PageMotionSpec.CORNER_DP.dp.toPx(),
                        PageMotionSpec.RELEASE_DRIFT_DP.dp.toPx(),
                    )
                    translationX = pose.translationX
                    scaleX = pose.scale
                    scaleY = pose.scale
                    alpha = pose.alpha
                    clip = pose.corner > 0f
                    if (clip) shape = RoundedCornerShape(pose.corner)
                }
                .cream(),
        ) { content() }
    }
}

/** A page this far through its animation, and on its way to showing, is at rest. */
private const val SETTLED = 0.999f
