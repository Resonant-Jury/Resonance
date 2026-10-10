package com.resonance.design

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshState
import androidx.compose.material3.pulltorefresh.pullToRefresh
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * Pull to refresh, drawn with the Resonance loader rather than Material's spinner (the twin of
 * iOS's). As a list is pulled past its top it slides down, and in the gap it reveals the
 * loader's loop is drawn with the pull — trimmed from nothing to the whole loop, fading and
 * growing in — with a light tick once it reaches [threshold]. Let go there, the dashes start
 * travelling round the loop and it stays docked while [onRefresh] runs, then the list eases back
 * up; let go before, it slips back quietly.
 *
 * Material3's `pullToRefresh` reads the gesture (nested scrolling: it takes only what the list
 * leaves at its top); [SketchPull] holds its state, which eases back in [HIDE_MILLIS] rather than
 * on a spring. A screen puts [sketchPull] on the box around its list, [pulledDown] on the list
 * itself, and [SketchPullIndicator] over the list where the gap opens.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Stable
class SketchPull internal constructor(
    private val scope: CoroutineScope,
    /** How far the list is pulled to refresh, and where it docks while refreshing. */
    val threshold: Dp,
    private val thresholdPx: Float,
    private val action: () -> (suspend () -> Unit),
) {
    internal val state: PullToRefreshState = EasedPullState()

    /** The refresh asked for is running (the loader docked, its dashes travelling). */
    var refreshing by mutableStateOf(false)
        private set

    /** From a refresh's start until the list is back up: the dashes keep travelling as it eases away. */
    internal var docked by mutableStateOf(false)

    /** How far the list is drawn down, in px: the pull as it is, docked at [threshold] while refreshing. */
    val offsetPx: Float get() = state.distanceFraction * thresholdPx

    /** A refresh is running, shown or not (see [refreshInPlace]): another waits for it to end. */
    internal var running = false
        private set

    /**
     * Let go past the threshold: the refresh runs, shown for at least [MIN_REFRESH_MILLIS] so it
     * never just flickers. One that fails leaves the list as it was (the screen says what it says
     * of a failed read); the loader goes either way.
     */
    internal fun refresh() = start(shown = true)

    /**
     * The same refresh with the list left where it is, for one asked for away from the list's top
     * (the accessibility action): no gap opens and no loader docks over the stories in view.
     */
    internal fun refreshInPlace() = start(shown = false)

    private fun start(shown: Boolean) {
        if (running) return
        running = true
        if (shown) {
            refreshing = true
            docked = true
        }
        scope.launch {
            val started = System.currentTimeMillis()
            try {
                try {
                    action()()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // Nothing to add: what was on screen stays.
                }
                val left = MIN_REFRESH_MILLIS - (System.currentTimeMillis() - started)
                if (shown && left > 0) delay(left)
            } finally {
                running = false
                refreshing = false
            }
        }
    }
}

/**
 * Material's pull state, with its own timing: docking eases in, and the list goes back up in
 * [HIDE_MILLIS] with CSS's ease-out — not Material's spring, which lingers.
 *
 * Already where it is asked to go, it returns at once. Material hides the pull on every release
 * of a drag in the list (its onPreFling awaits it before the list may fling), pulled or not: a
 * tween from 0 to 0 still lasts its whole [HIDE_MILLIS], so every flick stood still that long
 * and only then flew off.
 */
@OptIn(ExperimentalMaterial3Api::class)
internal class EasedPullState : PullToRefreshState {
    private val anim = Animatable(0f)
    override val distanceFraction: Float get() = anim.value
    override val isAnimating: Boolean get() = anim.isRunning
    override suspend fun animateToThreshold() {
        if (anim.value == 1f && !anim.isRunning) return
        anim.animateTo(1f, tween(DOCK_MILLIS, easing = EaseOut))
    }
    override suspend fun animateToHidden() {
        if (anim.value == 0f && !anim.isRunning) return
        anim.animateTo(0f, tween(HIDE_MILLIS, easing = EaseOut))
    }
    override suspend fun snapTo(targetValue: Float) {
        anim.snapTo(targetValue)
    }
}

/** A [SketchPull] for one list; [onRefresh] is the refresh the screen already runs, awaited while the loader is docked. */
@Composable
fun rememberSketchPull(onRefresh: suspend () -> Unit, threshold: Dp = PullThreshold): SketchPull {
    val scope = rememberCoroutineScope()
    val action by rememberUpdatedState(onRefresh)
    val px = with(LocalDensity.current) { threshold.toPx() }
    return remember(scope, threshold, px) { SketchPull(scope, threshold, px) { action } }
}

/** Reads the pull on this box's list (put it on the box around the list, outside anything else that scrolls with it). */
@OptIn(ExperimentalMaterial3Api::class)
fun Modifier.sketchPull(pull: SketchPull, enabled: Boolean = true): Modifier =
    pullToRefresh(isRefreshing = pull.refreshing, state = pull.state, enabled = enabled, threshold = pull.threshold, onRefresh = pull::refresh)

/**
 * The pull for whoever can't pull (TalkBack, Switch Access, Voice Access): a custom accessibility
 * action named [label] on the list, which TalkBack offers among the Actions of whatever in the
 * list has its focus. At the list's top ([atTop]) it refreshes as a pull let go past the threshold
 * does — the list drawn down and the loader docked while it runs; further down the list stays
 * where it is (a docked loader would sit over the stories in view, and the reader's place would
 * move). Put it on the list the pull refreshes, with the pull's own [enabled].
 */
fun Modifier.sketchPullAction(pull: SketchPull, label: String, enabled: Boolean = true, atTop: () -> Boolean = { true }): Modifier =
    if (enabled) semantics { customActions = listOf(pull.refreshAction(label, atTop)) } else this

/** The action [sketchPullAction] offers: asked for while a refresh runs, that refresh is the answer. */
internal fun SketchPull.refreshAction(label: String, atTop: () -> Boolean = { true }) = CustomAccessibilityAction(label) {
    if (atTop()) refresh() else refreshInPlace()
    true
}

/** The list, drawn down by the pull (only its drawing moves: nothing is laid out again). */
fun Modifier.pulledDown(pull: SketchPull): Modifier = graphicsLayer { translationY = pull.offsetPx }

/**
 * The loader in the gap a pull opens under [top] (where the list starts, under the bar): centred
 * in it and clipped to it, so it surfaces as the gap opens. Pulling, its loop is drawn as far as
 * the pull has gone (whole at the threshold, where a light tick says letting go will refresh);
 * refreshing, its dashes travel — or, with animations removed, the whole loop rests.
 */
@Composable
fun BoxScope.SketchPullIndicator(
    pull: SketchPull,
    top: Dp,
    size: Dp = PullLoaderSize,
) {
    val shown by remember(pull) { derivedStateOf { pull.state.distanceFraction > 0f || pull.refreshing } }
    val haptic = LocalHapticFeedback.current
    val refreshing by rememberUpdatedState(pull.refreshing)
    // A tick on reaching the threshold while pulling (again after pulling back under it); none when it docks there.
    LaunchedEffect(pull) {
        var armed = true
        snapshotFlow { pull.state.distanceFraction >= 1f }.collect { past ->
            if (!past) armed = true
            else if (armed && !refreshing && !pull.docked) {
                armed = false
                haptic.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate)
            }
        }
    }
    // Back up after a refresh (or a new pull taking over): the next pull draws its loop again.
    LaunchedEffect(pull) {
        snapshotFlow { pull.state.distanceFraction == 0f && !pull.refreshing }.collect { up -> if (up) pull.docked = false }
    }
    if (!shown) return
    val density = LocalDensity.current
    val sizePx = with(density) { size.toPx() }
    Box(
        Modifier
            .align(Alignment.TopCenter)
            .offset(y = top)
            .fillMaxWidth()
            .height(pull.threshold * 2)
            .drawWithContent { clipRect(bottom = pull.offsetPx) { this@drawWithContent.drawContent() } },
    ) {
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .offset { IntOffset(0, ((pull.offsetPx - sizePx) / 2f).roundToInt()) }
                .size(size)
                .graphicsLayer {
                    val p = pull.state.distanceFraction.coerceIn(0f, 1f)
                    alpha = pullAlpha(p)
                    val scale = pullScale(p)
                    scaleX = scale
                    scaleY = scale
                },
        ) {
            if (pull.docked) SketchLoader(size) else SketchLoaderLoop({ pull.state.distanceFraction }, size)
        }
    }
}

/**
 * The paper of a band that starts at the bar's line (the feed's first card, design note B1), for
 * the gap a pull opens above it: put it in the list's box BEFORE the list, so it lies behind it.
 * The gap wears the band's paper, its grain running on from the band's own, so the band looks
 * taller rather than parted from the bar — for any pull, a second one while the first refresh
 * still runs too (round 5 E4): the list doesn't move for that one, and the overscroll stretch it
 * gets instead opens a little more than the docked gap, which shows this paper, never the page's
 * cream, since it runs on well past the gap, hidden under the list wherever the list draws.
 */
@Composable
fun BoxScope.SketchPullPaper(pull: SketchPull, top: Dp, paper: Color) {
    val shown by remember(pull) { derivedStateOf { pull.state.distanceFraction > 0f || pull.refreshing } }
    if (!shown) return
    Box(
        Modifier
            .align(Alignment.TopCenter)
            // From the top of the bar's wave band, behind the bar's cream, as the band's own paper runs.
            .offset(y = top - HeaderEdgeHeight)
            .fillMaxWidth()
            .height(pull.threshold * 3)
            .drawWithCache {
                val grain = Grain.brush(GrainMode.Tile, "grain-overlay", this.size, this.density, 1f)
                onDrawBehind {
                    val gap = pull.offsetPx
                    // Drawn from the band's own top (where it is now), so the grain's tiles run on from its.
                    translate(top = gap) {
                        drawRect(paper, topLeft = Offset(0f, -gap), size = this.size)
                        grain?.let { drawRect(it, topLeft = Offset(0f, -gap), size = this.size, alpha = StoryGrain.Band * 2) }
                    }
                }
            },
    )
}

/** The loader fades in over the first part of the pull (and out again as the list eases back up). */
internal fun pullAlpha(fraction: Float): Float = (fraction.coerceIn(0f, 1f) / 0.45f).coerceAtMost(1f)

/** …and grows from 70% to its size as the pull reaches the threshold. */
internal fun pullScale(fraction: Float): Float = 0.7f + 0.3f * fraction.coerceIn(0f, 1f)

/** Where a pull refreshes, and the gap the loader docks in while it does. */
val PullThreshold: Dp = 64.dp

/** The loader in that gap. */
val PullLoaderSize: Dp = 36.dp

/** The list easing back up after a refresh, or a pull let go short of it. */
internal const val HIDE_MILLIS = 250

/** Docking at the threshold once let go past it. */
private const val DOCK_MILLIS = 200

/** A refresh shows its travelling dashes at least this long, however quickly it answers. */
internal const val MIN_REFRESH_MILLIS = 600L

/** CSS's `ease-out`. */
private val EaseOut = CubicBezierEasing(0f, 0f, 0.58f, 1f)
