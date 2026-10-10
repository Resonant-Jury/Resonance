package com.resonance.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import com.resonance.app.Session
import com.resonance.app.thoughtmap.ThoughtMapScreen
import com.resonance.design.AppFonts
import com.resonance.design.LocalWindowLayout
import com.resonance.design.Mixes
import com.resonance.design.OrganicIcon
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * What the workspace's editor pane shows: the writer's own card (the route's, `slot` [ROUTE_SLOT]),
 * or one of mine opened on the map ([fromMap]). [slot] names the writer in the pane — it stays
 * while a new card is first saved as a draft, so the writer isn't rebuilt under the person typing.
 */
internal data class PaneCard(val slot: String, val referenceCardId: String?, val cardId: String?, val story: String?, val fromMap: Boolean)

internal const val ROUTE_SLOT = "route"

/**
 * The divider between the map and the editor pane (round 5 E5; the web's WorkspaceShell), as
 * fractions of the window's width. Dragged, the editor is 32 % to 50 % of it; dragged on toward
 * the trailing edge past 32 % the pane follows the finger, and under 18 % it is in the hide zone:
 * let go there it hides, let go between 18 % and 32 % it springs back to 32 %.
 */
internal object PaneDrag {
    const val MIN = 0.32f
    const val MAX = 0.5f
    const val HIDE = 0.18f

    /** Where a drag that began at [start] leaves the pane after [dx] px (+ toward the trailing edge) across a [width] px window: never wider than [MAX]. */
    fun follow(start: Float, dx: Float, width: Float): Float =
        if (width <= 0f) start else (start - dx / width).coerceIn(0f, MAX)

    fun inHideZone(fraction: Float): Boolean = fraction < HIDE

    enum class Release { Hide, SpringBack, Stay }

    fun release(fraction: Float): Release = when {
        fraction < HIDE -> Release.Hide
        fraction < MIN -> Release.SpringBack
        else -> Release.Stay
    }

    /** The width a release leaves the pane at: hidden (0), sprung back to [MIN], or where it was let go. */
    fun settle(fraction: Float): Float = when (release(fraction)) {
        Release.Hide -> 0f
        Release.SpringBack -> MIN
        Release.Stay -> fraction.coerceAtMost(MAX)
    }

    /** A drag on the docked grip toward the leading side this far (px, of [reveal]) shows the pane again. */
    fun reveals(towardLeading: Float, reveal: Float): Boolean = towardLeading >= reveal
}

/** The pane: what it shows, whether it is open, its last width, and the width it is drawn at now (all of the window). */
@Stable
internal class PaneState(card: PaneCard?, open: Boolean, frac: Float) {
    var card by mutableStateOf(card)
    var open by mutableStateOf(open && card != null)
    /** The width the person last left it at (32 %…50 %): showing it again brings it back there. */
    var frac by mutableFloatStateOf(frac)
    /** The width it is drawn at (0: hidden), but while the grip is held. */
    val shown = Animatable(if (open && card != null) frac else 0f)
    /** The width the held grip puts it at; null while nobody holds it. */
    var drag by mutableStateOf<Float?>(null)
    /** Hiding with the system's animations off: it fades instead of sliding. */
    val fade = Animatable(1f)

    val drawn: Float get() = drag ?: shown.value
    val inHideZone: Boolean get() = drag?.let(PaneDrag::inHideZone) == true

    companion object {
        val Saver = listSaver<PaneState, Any?>(
            save = { listOf(it.card?.slot, it.card?.referenceCardId, it.card?.cardId, it.card?.story, it.card?.fromMap, it.open, it.frac) },
            restore = {
                val slot = it[0] as String?
                val card = slot?.let { s -> PaneCard(s, it[1] as String?, it[2] as String?, it[3] as String?, it[4] as Boolean? ?: false) }
                PaneState(card, it[5] as Boolean, it[6] as Float)
            },
        )
    }
}

/**
 * The writer and the thought map as one page (round 5 E5, design note §12): at the split width
 * (≥ 1200) the map on the leading side and the editor pane on the trailing side, no bar over
 * either — the map's own floating Leave is the way back whichever way it was come into (from the
 * writer it keeps the writer's rule: written work asks first). The writer ([writer], a new card, a
 * draft or a published card's edit) opens it with the pane open; the thought map ([writer] null)
 * with the pane closed. A card of mine tapped on the map opens in the pane, in place (the card
 * there saved first); another's opens its page over the workspace ([open]).
 *
 * The divider's grip is the only way to hide the pane ([PaneDrag]); hidden, the map takes the
 * whole width and the grip waits docked at the trailing edge while there is a card to show again.
 * Hiding saves the draft at once and keeps the writer as it was, composed off screen.
 *
 * Below the split nothing changes: the writer is its own page with its bar, the map its own with
 * its Leave and its cards opening the writer pushed over it — but a card the pane held as the
 * window narrowed covers the map with its bar, its back hiding it again.
 */
@Composable
internal fun Workspace(
    session: Session,
    writer: Route.Write?,
    open: (Route) -> Unit,
    leave: () -> Unit,
    onCreated: (String) -> Unit = {},
    /** The writer's own card published, or its changes dropped (its slug or id): the card's page takes the writer's place. */
    onFinished: (String) -> Unit = {},
) {
    val split = LocalWindowLayout.current.writerSplit
    val mapShown = split || writer == null
    val pane = rememberSaveable(saver = PaneState.Saver) {
        PaneState(writer?.let { PaneCard(ROUTE_SLOT, it.referenceCardId, it.cardId, it.story, fromMap = false) }, open = writer != null, frac = PaneDrag.MAX)
    }
    val handle = remember { WriterHandle() }
    val scope = rememberCoroutineScope()
    val reduced = LocalContext.current.prefersReducedMotion()
    val haptic = LocalHapticFeedback.current
    var leaving by remember { mutableStateOf(false) }

    // What the writer wrote, for the screens that show cards (the map among them) to read again.
    fun noteWritten() {
        session.takeWriterChange()?.let(session::noteCardChange)
    }

    fun leaveNow() {
        if (leaving) return
        leaving = true
        handle.releaseKeyboard()
        scope.launch {
            handle.saveNow()
            noteWritten()
            leave()
        }
    }

    // The map's Leave and, at the split, the system back: from the writer, the writer's rule.
    fun leavePage() {
        if (leaving) return
        if (writer != null && handle.holdsWork) handle.askToLeave(::leaveNow) else leaveNow()
    }

    fun show() {
        if (pane.card == null) return
        pane.open = true
        scope.launch {
            pane.fade.snapTo(1f)
            if (reduced) pane.shown.snapTo(pane.frac) else pane.shown.animateTo(pane.frac, tween(PANE_SLIDE_MILLIS, easing = EaseOut))
        }
    }

    // Saves the draft at once and keeps the writer as it is; the pane slides out (or fades, without motion).
    fun hide() {
        if (!pane.open) return
        pane.open = false
        handle.releaseKeyboard()
        scope.launch {
            handle.saveNow()
            noteWritten()
        }
        scope.launch {
            if (reduced) {
                pane.fade.animateTo(0f, tween(PANE_SLIDE_MILLIS))
                pane.shown.snapTo(0f)
                pane.fade.snapTo(1f)
            } else pane.shown.animateTo(0f, tween(PANE_SLIDE_MILLIS, easing = EaseOut))
        }
    }

    // One of my cards tapped on the map: in the pane, in place (the card there saved first).
    fun openFromMap(id: String) {
        if (pane.card?.cardId == id) return show()
        scope.launch {
            handle.saveNow()
            noteWritten()
            pane.card = PaneCard("map:$id", null, id, null, fromMap = true)
            show()
        }
    }

    // The pane's writer let go of its card (its "save and leave", its bar's back, a missing card's way back).
    fun closeCard(card: PaneCard) {
        if (card.fromMap && mapShown) hide()
        else if (!leaving) {
            leaving = true
            noteWritten()
            leave()
        }
    }

    // Published, or its changes dropped.
    fun finishCard(card: PaneCard, key: String) {
        session.noteCardChange(session.takeWriterChange() ?: Session.CardChange())
        when {
            !card.fromMap -> onFinished(key)
            mapShown -> {
                pane.open = false
                pane.card = null
                scope.launch { pane.shown.snapTo(0f) }
            }
            else -> leave()
        }
    }

    // At the split the back is the workspace's: the writer's leave, or — the map come into — the pane hidden first.
    BackHandler(enabled = split && writer != null) { leavePage() }
    BackHandler(enabled = split && writer == null && pane.open) { hide() }
    // A light tick on entering the hide zone.
    LaunchedEffect(pane) {
        snapshotFlow { pane.inHideZone }.collect { if (it) haptic.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate) }
    }

    BoxWithConstraints(Modifier.fillMaxSize().cream()) {
        val window = constraints.maxWidth.toFloat()
        val card = pane.card
        // Below the split the writer come into is the whole page; the map come into shows the pane only as it held one.
        val paneOnScreen = when {
            split -> pane.drawn > 0f
            writer != null -> true
            else -> pane.open
        }
        if (mapShown) Box(
            Modifier.layout { measurable, constraints ->
                val w = if (split) (constraints.maxWidth * (1f - pane.drawn)).roundToInt() else constraints.maxWidth
                val placeable = measurable.measure(Constraints.fixed(w.coerceAtLeast(0), constraints.maxHeight))
                layout(constraints.maxWidth, constraints.maxHeight) { placeable.place(0, 0) }
            },
        ) {
            ThoughtMapScreen(
                session, session.thoughtMap, open,
                leave = { if (split) leavePage() else leave() },
                openMine = if (split) ::openFromMap else null,
            )
        }
        if (card != null) {
            val dim by animateFloatAsState(if (pane.inHideZone) 0.5f else 1f, tween(120), label = "paneDim")
            Box(
                Modifier
                    .layout { measurable, constraints ->
                        val full = constraints.maxWidth
                        val f = pane.drawn
                        // At the split it is its width of the window, sliding out past 32 % rather than squeezing; off screen when hidden.
                        val w = if (split) (full * max(f, PaneDrag.MIN)).roundToInt() else full
                        val x = when {
                            !paneOnScreen -> full
                            split -> (full * (1f - f)).roundToInt()
                            else -> 0
                        }
                        val placeable = measurable.measure(Constraints.fixed(w, constraints.maxHeight))
                        layout(full, constraints.maxHeight) {
                            placeable.placeWithLayer(x, 0) { alpha = (if (split) dim else 1f) * pane.fade.value }
                        }
                    }
                    .then(if (paneOnScreen) Modifier else Modifier.clearAndSetSemantics { })
                    // The boundary: a hair of the fields' border on the pane's own leading edge, over what it holds.
                    .drawWithContent {
                        drawContent()
                        if (split) drawLine(Tokens.FieldBorder, Offset(0.5f, 0f), Offset(0.5f, size.height), strokeWidth = 1.dp.toPx())
                    },
            ) {
                key(card.slot) {
                    WriteScreen(
                        session, card.referenceCardId, card.cardId, card.story,
                        close = { closeCard(card) },
                        onCreated = { id ->
                            pane.card = pane.card?.takeIf { it.slot == card.slot }?.copy(cardId = id, story = null) ?: pane.card
                            if (!card.fromMap) onCreated(id)
                        },
                        pane = handle,
                        // Its own bar and back below the split; the workspace's at it.
                        bar = !split,
                    ) { key -> finishCard(card, key) }
                }
            }
        }
        if (split && card != null) {
            PaneGrip(
                pane, window, reduced,
                show = ::show,
                hide = {
                    haptic.performHapticFeedback(HapticFeedbackType.GestureEnd)
                    hide()
                },
                resize = { f ->
                    pane.frac = f.coerceIn(PaneDrag.MIN, PaneDrag.MAX)
                    scope.launch { pane.shown.snapTo(pane.frac) }
                },
            )
            if (pane.inHideZone) ReleasePill(pane)
        }
    }
}

/**
 * The divider's grip (the web's railGrip): a small inked chip on the boundary, in the middle of
 * its height — 28 × 34, a hair of the fields' border, the arrows glyph — in a 44 × 48 touch
 * target. Dragged it resizes the pane, hides it from the hide zone, and — docked at the trailing
 * edge while the pane is hidden — shows it again, as a tap there does. An adjustable control for
 * TalkBack (its value the editor's width), with hide / show as its actions.
 */
@Composable
private fun PaneGrip(pane: PaneState, window: Float, reduced: Boolean, show: () -> Unit, hide: () -> Unit, resize: (Float) -> Unit) {
    val source = remember { MutableInteractionSource() }
    val dragged by source.collectIsDraggedAsState()
    val pressed by source.collectIsPressedAsState()
    val hovered by source.collectIsHoveredAsState()
    val density = LocalDensity.current
    val reveal = with(density) { GRIP_REVEAL.toPx() }
    val dock = with(density) { (GRIP_TOUCH_W / 2).toPx() }
    var start by remember { mutableFloatStateOf(0f) }
    var moved by remember { mutableFloatStateOf(0f) }
    val open = pane.open
    val drag = rememberDraggableState { dx ->
        moved += dx
        pane.drag = if (open) PaneDrag.follow(start, moved, window)
            // Docked: the pane comes out with the finger, as far as its last width.
            else PaneDrag.follow(0f, moved, window).coerceAtMost(pane.frac)
    }
    val active = dragged || pressed || hovered
    Box(
        Modifier
            .layout { measurable, constraints ->
                val placeable = measurable.measure(Constraints())
                val f = pane.drawn
                val cx = if (f > 0f) window * (1f - f) else window - dock
                layout(constraints.maxWidth, constraints.maxHeight) {
                    placeable.place((cx - placeable.width / 2f).roundToInt(), (constraints.maxHeight - placeable.height) / 2)
                }
            }
            .size(GRIP_TOUCH_W, GRIP_TOUCH_H)
            .hoverable(source)
            .pointerHoverIcon(PointerIcon(android.view.PointerIcon.TYPE_HORIZONTAL_DOUBLE_ARROW))
            .draggable(
                drag, Orientation.Horizontal, interactionSource = source,
                onDragStarted = {
                    start = pane.shown.value
                    moved = 0f
                    pane.drag = pane.shown.value
                },
                onDragStopped = {
                    val f = pane.drag ?: return@draggable
                    pane.shown.snapTo(f)
                    pane.drag = null
                    if (open) when (PaneDrag.release(f)) {
                        PaneDrag.Release.Hide -> hide()
                        PaneDrag.Release.SpringBack -> {
                            pane.frac = PaneDrag.MIN
                            if (reduced) pane.shown.snapTo(PaneDrag.MIN)
                            else pane.shown.animateTo(PaneDrag.MIN, spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMediumLow))
                        }
                        PaneDrag.Release.Stay -> pane.frac = PaneDrag.settle(f)
                    } else if (PaneDrag.reveals(-moved, reveal)) show()
                    else if (reduced) pane.shown.snapTo(0f) else pane.shown.animateTo(0f, tween(PANE_SLIDE_MILLIS, easing = EaseOut))
                },
            )
            .clickable(source, indication = null, enabled = !open, onClickLabel = L10n.Write.openEditor) { show() }
            .semantics(mergeDescendants = true) {
                contentDescription = L10n.Write.resizeDivider
                if (open) {
                    progressBarRangeInfo = ProgressBarRangeInfo(pane.frac, PaneDrag.MIN..PaneDrag.MAX)
                    setProgress { v ->
                        resize(v)
                        true
                    }
                    customActions = listOf(CustomAccessibilityAction(L10n.Write.closeEditor) { hide(); true })
                } else {
                    customActions = listOf(CustomAccessibilityAction(L10n.Write.openEditor) { show(); true })
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(28.dp, 34.dp)
                .background(Tokens.Cream, GripShape)
                .border(1.dp, if (active) Tokens.FieldBorderHover else Tokens.FieldBorder, GripShape),
            contentAlignment = Alignment.Center,
        ) {
            OrganicIcon(IconName.ArrowsHorizontal, size = 16.dp, color = if (active) Tokens.Text else Tokens.TextMuted)
        }
    }
}

/** 「放開以收起編輯區」by the grip while it is held in the hide zone: on the map's side of it, level with it. */
@Composable
private fun ReleasePill(pane: PaneState) {
    val density = LocalDensity.current
    val gap = with(density) { (GRIP_TOUCH_W / 2 + 4.dp).toPx() }
    BasicText(
        L10n.Write.releaseToClose,
        style = AppFonts.body(13f, 600, lineHeight = 1.3f, color = Mixes.ButtonOnTonal),
        maxLines = 1,
        modifier = Modifier
            .layout { measurable, constraints ->
                val placeable = measurable.measure(Constraints())
                val cx = constraints.maxWidth * (1f - pane.drawn)
                layout(constraints.maxWidth, constraints.maxHeight) {
                    placeable.place((cx - gap - placeable.width).roundToInt(), (constraints.maxHeight - placeable.height) / 2)
                }
            }
            .background(Mixes.ButtonTonal, RoundedCornerShape(50))
            .padding(horizontal = 14.dp, vertical = 7.dp)
            .clearAndSetSemantics { },
    )
}

/** The web's grip: border-radius 11px 13px 12px 14px. */
private val GripShape = RoundedCornerShape(topStart = 11.dp, topEnd = 13.dp, bottomEnd = 12.dp, bottomStart = 14.dp)
private val GRIP_TOUCH_W = 44.dp
private val GRIP_TOUCH_H = 48.dp

/** How far the docked grip is dragged toward the map to show the pane again. */
private val GRIP_REVEAL = 16.dp

/** The pane sliding in or out. */
private const val PANE_SLIDE_MILLIS = 200

/** CSS's `ease-out`. */
private val EaseOut = CubicBezierEasing(0f, 0f, 0.58f, 1f)
