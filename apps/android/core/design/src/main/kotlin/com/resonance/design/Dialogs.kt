package com.resonance.design

import android.os.Build
import android.view.View
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.dismiss
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobCircleOptions
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.autoCurve
import com.resonance.geometry.autoMag
import com.resonance.geometry.autoSegments
import com.resonance.geometry.dividerPath
import com.resonance.geometry.rowBoundary
import com.resonance.geometry.rowRegion
import com.resonance.geometry.wobCircle
import com.resonance.geometry.wobRect
import com.resonance.kit.l10n.L10n
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * What a modal (and a message's long-press menu) lays over the screen: the warm ink of
 * Modal.tsx's backdrop (oklch(20% 0.04 60)), but lighter than its 0.42 — over the cream
 * page that read muddy, the paper gone grey rather than set back.
 */
val ModalScrim: Color = OklchColor.parse("oklch(20% 0.04 60 / 0.28)") ?: Color.Black.copy(alpha = 0.28f)

/**
 * The web's Modal: a wobbly card — radius 26, the wobble 2.5% of its short
 * side, three or four turns across and five or six down, corners drifting 5 —
 * with grain, over the [ModalScrim]. The scrim covers the whole screen, the
 * status and navigation bars too: the dialog's window is edge to edge and
 * dims nothing itself, so no band of another brightness is left at either end.
 *
 * There is no ×: a modal's ways out are the buttons at its foot (one with
 * nothing else there ends in a [ModalCloseButton]), a tap on the scrim, and
 * Back — none of them while `onDismiss` is null (the web's busy state). For
 * TalkBack the scrim is a button named `closeLabel`, read after the card,
 * and the card carries the same dismiss action.
 */
@Composable
fun OrganicModal(
    onDismiss: (() -> Unit)?,
    title: String,
    seed: Double = 17.0,
    /** What the scrim says it does (the modal's own cancel or close words). */
    closeLabel: String = L10n.Safety.Report.close,
    /** The card's widest (Modal's `maxWidth`): 460 unless a small dialog asks for less. */
    maxWidth: Dp = 460.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Dialog(
        onDismissRequest = { onDismiss?.invoke() },
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        EdgeToEdgeDialogWindow()
        // A dialog is a window of its own: its density starts again from the system's whole text scale.
        CappedTextScale {
        Box(Modifier.fillMaxSize()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(ModalScrim)
                    .then(
                        if (onDismiss == null) Modifier
                        else Modifier
                            .plainClickable(role = Role.Button, onClickLabel = closeLabel, onClick = onDismiss)
                            .semantics {
                                contentDescription = closeLabel
                                // After the card's own content, not before it.
                                traversalIndex = 1f
                            },
                    ),
            )
            Box(
                Modifier
                    .fillMaxSize()
                    // Clear of the bars and the cutout, and above the keyboard (a note or a report being typed), the card scrolling if it has to.
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    Modifier
                        .widthIn(max = maxWidth)
                        .fillMaxWidth()
                        // A tap on the card stays on it: only the scrim around it closes the modal.
                        .pointerInput(Unit) {}
                        .semantics {
                            paneTitle = title
                            if (onDismiss != null) dismiss(closeLabel) { onDismiss(); true }
                        }
                        .drawWithCache {
                            val w = size.width / density
                            val h = size.height / density
                            val cmds = wobRect(w.toDouble(), h.toDouble(), 26.0, seed, min(w, h) * 0.025, WobRectOptions(
                                curve = 0.6, cornerJitter = 0.9, cornerOffset = 5.0, segmentsH = SegValue.Range(3, 4), segmentsV = SegValue.Range(5, 6),
                            ))
                            val path = cmds.toPath(density)
                            val grain = Grain.brush(GrainMode.Tile, "grain-card", size, density, 0.3f)
                            val ink = Stroke(Tokens.Ink.toPx())
                            onDrawBehind {
                                drawPath(path, Tokens.CardBg)
                                grain?.let { drawPath(path, it, alpha = 0.3f) }
                                drawPath(path, Tokens.ModalBorder, style = ink)
                            }
                        }
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 28.dp, vertical = 32.dp),
                    verticalArrangement = Arrangement.spacedBy(ModalGap),
                    content = content,
                )
            }
        }
        }
    }
}

/**
 * A modal's window, made like the activity's: edge to edge (its content laid out under the bars,
 * [DialogProperties.decorFitsSystemWindows] off), dimming nothing behind it — the modal draws its
 * own scrim, over the whole screen — and the bars clear, with dark glyphs, as on the paper below.
 * A window of its own would otherwise get the platform's dim, which reaches the bars while the
 * modal's scrim stopped short of them: a grey band at the top and the bottom.
 */
@Composable
private fun EdgeToEdgeDialogWindow() {
    val view = LocalView.current
    DisposableEffect(view) {
        (view.parent as? DialogWindowProvider)?.window?.let { window ->
            window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            @Suppress("DEPRECATION")
            run {
                // Ignored from Android 15 on, where every edge-to-edge window's bars are clear.
                window.statusBarColor = android.graphics.Color.TRANSPARENT
                window.navigationBarColor = android.graphics.Color.TRANSPARENT
            }
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                window.insetsController?.setSystemBarsAppearance(light, light)
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = window.decorView.systemUiVisibility or
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
        }
        onDispose {}
    }
}

/**
 * The way out of a modal with nothing else at its foot (a list to look through, a note just
 * sent, "thanks", "that didn't go through"): its close words as a small tonal pill, centred under
 * the content (the web's ModalCloseRow / `Modal closeButton`), at least [ModalActionMinHeight]
 * tall for a finger. Where there is a choice (cancel and a verb) the two sit at the bottom right
 * instead, in [ModalActions].
 */
@Composable
fun ModalCloseButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        OrganicButton(label, Modifier.heightIn(min = ModalActionMinHeight).widthIn(min = ModalActionMinWidth), variant = ButtonVariant.Tonal, small = true, onClick = onClick)
    }
}

/**
 * `clickable` without Material's ripple — the web's links and cards have no
 * press chrome — for cards, backdrops and sheets.
 */
fun Modifier.plainClickable(role: Role? = null, onClickLabel: String? = null, onClick: () -> Unit): Modifier =
    clickable(interactionSource = null, indication = null, role = role, onClickLabel = onClickLabel, onClick = onClick)

/**
 * ConfirmModal.tsx — the one confirm layout: title and body left-aligned,
 * then cancel and the verb, small, at the bottom right ([ModalActions]): cancel
 * the tonal pill, the verb solid — red when it can't be undone (`destructive`).
 * Why the last try failed ([error]) is one danger line right above them.
 */
@Composable
fun OrganicConfirmDialog(
    title: String,
    body: String,
    cancelLabel: String,
    confirmLabel: String,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
    busy: Boolean = false,
    seed: Double = 67.0,
    /** What went wrong, under the body (a block that didn't go through); the dialog stays for another try. */
    error: String? = null,
    /** A permanent loss (delete a card, a conversation, the account): the verb in red. */
    destructive: Boolean = false,
    /** The question's own words are still on their way: its place is kept, unwritten, rather than changing under the reader. */
    titlePending: Boolean = false,
) {
    // A tap beside the card is the way out at its foot, and says so: "Keep it", not a "Close" it has no button for.
    OrganicModal(if (busy) null else onCancel, title, seed, closeLabel = cancelLabel) {
        // ConfirmModal: 8 between title and body, 18 before the actions (14 + ModalActions' 4).
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.fade(if (titlePending) 0f else 1f)) { ModalTitle(title) }
            ModalBody(body)
        }
        if (error != null) ModalError(error)
        ModalActions(
            cancelLabel, onCancel, if (busy) "…" else confirmLabel, onConfirm,
            busy = busy, destructive = destructive,
        )
    }
}

/** What a modal's column puts between its parts. */
val ModalGap = 14.dp

/** The air [ModalActions] keeps above itself unless asked for other: 18 under what comes before, as ConfirmModal. */
val ModalActionsTop = 4.dp

/** How far a dialog's error line sits above its actions (the web's Modal `.error`). */
val ModalErrorGap = 12.dp

/**
 * How much of its line box [ModalError] gives back at its foot, so that it stands [ModalErrorGap]
 * over actions that keep [ModalActionsTop] (the column's 14 and the actions' 4 would make it 18).
 * A foot that keeps less air above it ([ModalActions]' `topPadding`) must keep [ModalActionsTop]
 * while an error stands over it, or the line crowds the buttons.
 */
val ModalErrorTuck = ModalGap + ModalActionsTop - ModalErrorGap

/** A dialog's error line (the web's Modal `.error`): 13, danger red, right above its actions — [ModalErrorGap] over them, as on the web. */
@Composable
fun ModalError(text: String) = BasicText(
    text, style = AppFonts.body(13f, lineHeight = 1.5f, color = Mixes.Danger),
    modifier = Modifier.layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        val tuck = ModalErrorTuck.roundToPx()
        layout(placeable.width, placeable.height - tuck) { placeable.place(0, 0) }
    },
)

/** ConfirmModal's title: Playfair 20/700. */
@Composable
fun ModalTitle(text: String) = BasicText(text, style = AppFonts.heading(20f, lineHeight = 1.3f))

/** ConfirmModal's body: 14px, 1.6, muted. */
@Composable
fun ModalBody(text: String, color: Color = Tokens.TextMuted) = BasicText(text, style = AppFonts.body(14f, lineHeight = 1.6f, color = color))

/** A finger needs this much to land on: the small pills at a dialog's foot are about 36 tall. */
val ModalActionMinHeight = 48.dp

/** Grown that tall, a pill with a two-character label (取消, 關閉) is at least this wide, so it still reads as a pill, not a blob. */
val ModalActionMinWidth = 72.dp

/**
 * A dialog's foot when it asks for a choice (the web's ModalActions): its buttons [content] in
 * scanning order — the way out (tonal) first, the verb (solid, or danger) last — right-aligned,
 * the verb rightmost, 10 apart, each at least [ModalActionMinHeight] tall (and [ModalActionMinWidth] wide), a little air above
 * (`topPadding`; a list that ends in its own padding asks for none). A pair too wide for one row
 * (a narrow phone, long English words, a large text size) stacks instead of squeezing its labels
 * onto two lines inside the pills: the verb on top, the way out under it, both still at the right
 * ([ModalActionsLayout]).
 */
@Composable
fun ModalActions(topPadding: Dp = ModalActionsTop, content: @Composable () -> Unit) {
    Layout(content, Modifier.fillMaxWidth().padding(top = topPadding)) { measurables, constraints ->
        val gap = 10.dp.roundToPx()
        val minHeight = ModalActionMinHeight.roundToPx().coerceAtMost(constraints.maxHeight)
        val minWidth = ModalActionMinWidth.roundToPx().coerceAtMost(constraints.maxWidth)
        // Each button's width on one line, asked before it is measured.
        val natural = measurables.map { maxOf(it.maxIntrinsicWidth(Constraints.Infinity), minWidth) }
        val stacked = ModalActionsLayout.stacks(natural, gap, constraints.maxWidth)
        val placeables = measurables.map { it.measure(Constraints(minWidth = minWidth, maxWidth = constraints.maxWidth, minHeight = minHeight)) }
        val spots = ModalActionsLayout.place(placeables.map { it.width }, placeables.map { it.height }, gap, constraints.maxWidth, stacked)
        val height = spots.indices.maxOfOrNull { spots[it].y + placeables[it].height } ?: 0
        layout(constraints.maxWidth, height) { placeables.forEachIndexed { i, p -> p.place(spots[i]) } }
    }
}

/**
 * ModalActions' (cancel, verb) form, the foot most dialogs end in: [cancelLabel] tonal, then the
 * verb — solid, or danger when [destructive] — with an optional glyph ([verbIcon]); [verbEnabled]
 * false while there is nothing to act on yet. While [busy] both rest (faded, taking no tap).
 */
@Composable
fun ModalActions(
    cancelLabel: String,
    onCancel: () -> Unit,
    verbLabel: String,
    onVerb: () -> Unit,
    busy: Boolean = false,
    destructive: Boolean = false,
    verbEnabled: Boolean = true,
    verbIcon: IconName? = null,
    topPadding: Dp = ModalActionsTop,
) {
    ModalActions(topPadding) {
        OrganicButton(cancelLabel, variant = ButtonVariant.Tonal, small = true, busy = busy, onClick = onCancel)
        OrganicButton(
            verbLabel, variant = if (destructive) ButtonVariant.Danger else ButtonVariant.Solid, icon = verbIcon,
            small = true, enabled = verbEnabled, busy = busy, onClick = onVerb,
        )
    }
}

/**
 * Where [ModalActions] puts its buttons (in px), apart from Compose so it can be tested: in a row
 * at the right when they fit side by side, else stacked — the last (the verb) on top — each at
 * the right; in a row they share one centre line.
 */
object ModalActionsLayout {
    /** Whether buttons of these one-line [widths], [gap] apart, are too wide for [available]. */
    fun stacks(widths: List<Int>, gap: Int, available: Int): Boolean =
        widths.sum() + gap * (widths.size - 1).coerceAtLeast(0) > available

    fun place(widths: List<Int>, heights: List<Int>, gap: Int, available: Int, stacked: Boolean): List<IntOffset> {
        if (!stacked) {
            val rowHeight = heights.maxOrNull() ?: 0
            var x = available - (widths.sum() + gap * (widths.size - 1).coerceAtLeast(0))
            return widths.indices.map { i -> IntOffset(x, (rowHeight - heights[i]) / 2).also { x += widths[i] + gap } }
        }
        val spots = arrayOfNulls<IntOffset>(widths.size)
        var y = 0
        for (i in widths.indices.reversed()) {
            spots[i] = IntOffset(available - widths[i], y)
            y += heights[i] + gap
        }
        return spots.map { it!! }
    }
}

/** One row of an [OrganicMenu]. */
class OrganicMenuItem(val title: String, val icon: IconName, val destructive: Boolean = false, val onClick: () -> Unit)

/**
 * OrganicMenu's colors (the web's `--menu-*`): the theme terracotta, or — for
 * a card's own menu — its hue: the pen `oklch(52% 0.11 h)`, deeper `oklch(38%
 * 0.09 h)` when pressed, paper `oklch(98% 0.01 h)`, dividers `oklch(55% 0.04 h
 * / 0.4)`, and the destructive row's wash `color-mix(yellow 25%, paper)` (45% pressed).
 */
internal class MenuColors(hue: Double?) {
    val border: Color
    val borderHover: Color
    val cream: Color
    val divider: Color
    val dangerWash: Color
    val dangerWashPressed: Color

    init {
        if (hue == null) {
            border = Tokens.Terracotta
            borderHover = Tokens.TerracottaDeep
            cream = Tokens.Cream
            divider = Tokens.Terracotta.copy(alpha = 0.4f)
            dangerWash = Mixes.MenuDangerWash
            dangerWashPressed = Mixes.MenuDangerWashPressed
        } else {
            border = OklchColor.parse("oklch(52% 0.11 $hue)") ?: Tokens.Terracotta
            borderHover = OklchColor.parse("oklch(38% 0.09 $hue)") ?: Tokens.TerracottaDeep
            cream = OklchColor.parse("oklch(98% 0.01 $hue)") ?: Tokens.Cream
            divider = OklchColor.parse("oklch(55% 0.04 $hue / 0.4)") ?: Tokens.Terracotta.copy(alpha = 0.4f)
            dangerWash = mixYellow(hue, 0.25)
            dangerWashPressed = mixYellow(hue, 0.45)
        }
    }

    /** color-mix(in oklch, yellow t, the menu's paper): halfway round the shorter hue arc, as CSS interpolates. */
    private fun mixYellow(hue: Double, t: Double): Color {
        val (yl, yc, yh) = Triple(0.88, 0.10, 90.0)
        val (cl, cc) = 0.98 to 0.01
        val dh = (yh - hue + 540) % 360 - 180
        val h = ((hue + dh * t) % 360 + 360) % 360
        return OklchColor.parse("oklch(${(cl + (yl - cl) * t) * 100}% ${cc + (yc - cc) * t} $h)") ?: Mixes.MenuDangerWash
    }
}

/**
 * How a menu's trigger is drawn. In a bar (the card page's header) it is a
 * [Bare] glyph like the back arrow beside it — the bar is the frame. Over
 * content (a card's cover in the card box) it is a [Chip]: a wobbly cream
 * squircle (R 0.42s, one turn a side) with no rim, so it stays legible over a
 * picture without adding a pen line.
 */
enum class MenuTrigger { Chip, Bare }

/**
 * OrganicMenu's trigger (and the header's other actions, share): the glyph in
 * the menu's pen (or a card's hue) at 0.53 of the chip, or bare at 20dp in the
 * text ink. A press washes an organic squircle — never a rectangle.
 */
@Composable
fun OrganicMenuChip(
    icon: IconName,
    label: String,
    seed: Double,
    size: Dp = 38.dp,
    expanded: Boolean = false,
    hue: Double? = null,
    trigger: MenuTrigger = MenuTrigger.Chip,
    onClick: () -> Unit,
) {
    val colors = remember(hue) { MenuColors(hue) }
    if (trigger == MenuTrigger.Bare) {
        Box(
            Modifier
                .size(BareHitBox)
                .clickable(interactionSource = null, indication = OrganicIndication(inset = BareWashInset), role = Role.Button, onClickLabel = label, onClick = onClick)
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(icon, size = 20.dp, color = if (expanded) Tokens.Terracotta else Tokens.Text) }
        return
    }
    val ink = if (expanded) colors.borderHover else colors.border
    Box(
        Modifier
            .size(MenuHitBox)
            .clickable(interactionSource = null, indication = OrganicIndication(inset = (MenuHitBox - size) / 2), role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(size).drawWithCache {
                val s = size.value.toDouble()
                val o = WobRectShape(s * 0.42, seed, mag = s * 0.03, options = WobRectOptions(
                    curve = 1.4, cornerJitter = 2.4, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
                )).createOutline(this.size, layoutDirection, this)
                onDrawBehind { drawOutline(o, colors.cream.copy(alpha = 0.94f)) }
            },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(icon, size = (size.value * 0.53f).roundToInt().dp, color = ink, strokeWidth = Tokens.Ink.value) }
    }
}

/** The chip's touch target. */
private val MenuHitBox = 44.dp

/** How long a chosen row's panel stays, so its ink is seen. */
private const val ChooseLingerMillis = 150L

/** A bare trigger's touch target (OrganicIconButton's), and how far in its wash sits. */
private val BareHitBox = 48.dp
private val BareWashInset = 4.dp

/** OrganicMenu's rows are 42 tall. */
private const val MenuRowHeight = 42.0

/**
 * The web's OrganicMenu: the ⋯ chip, dropping a hand-drawn cream panel 8
 * under its trailing edge — terracotta pen (or a card's `hue`), wavy dividers
 * between rows, the destructive row on a yellow wash — not Material's menu.
 */
@Composable
fun OrganicMenu(
    items: List<OrganicMenuItem>,
    label: String,
    seed: Double = 7.0,
    triggerIcon: IconName = IconName.Dots,
    hue: Double? = null,
    triggerSize: Dp = 38.dp,
    trigger: MenuTrigger = MenuTrigger.Chip,
) {
    var open by remember { mutableStateOf(false) }
    var choosing by remember { mutableStateOf(false) }
    val menuScope = rememberCoroutineScope()
    val colors = remember(hue) { MenuColors(hue) }
    Box {
        OrganicMenuChip(triggerIcon, label, seed, size = triggerSize, expanded = open, hue = hue, trigger = trigger) { open = !open }
        if (open) {
            val gap = with(LocalDensity.current) { 8.dp.roundToPx() }
            // The chip (or a bare glyph's wash) is centred in its hit box: the panel hangs from it, not from the box.
            val inset = with(LocalDensity.current) {
                (if (trigger == MenuTrigger.Bare) BareWashInset else (MenuHitBox - triggerSize) / 2).roundToPx()
            }
            Popup(
                popupPositionProvider = remember(gap, inset) { BelowTrailingEdge(gap, inset) },
                onDismissRequest = { open = false },
                properties = PopupProperties(focusable = true),
            ) {
                // Like a dialog, a popup is a window of its own with the system's whole text scale.
                CappedTextScale {
                    MenuPanel(items, seed, colors) { item ->
                        if (choosing) return@MenuPanel
                        choosing = true
                        menuScope.launch {
                            // A tap is shorter than the ink's spread: the panel stays long enough to show it.
                            delay(ChooseLingerMillis)
                            open = false
                            choosing = false
                            item.onClick()
                        }
                    }
                }
            }
        }
    }
}

/** Under the chip, its trailing edge and the panel's aligned (the web's `top: 100% + 8px; right: 0`), kept on screen. */
private class BelowTrailingEdge(private val gap: Int, private val inset: Int) : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
        val x = (anchorBounds.right - inset - popupContentSize.width).coerceIn(0, max(0, windowSize.width - popupContentSize.width))
        return IntOffset(x, anchorBounds.bottom - inset + gap)
    }
}

@Composable
private fun MenuPanel(items: List<OrganicMenuItem>, seed: Double, colors: MenuColors, onChoose: (OrganicMenuItem) -> Unit) =
    MenuPanel(items, seed, colors, null, TransformOrigin(1f, 0f), onChoose)

/**
 * The panel of an [OrganicMenu] on its own, for a menu that opens somewhere other than under a ⋯
 * (the long-press menu of a message): the same hand-drawn card, wavy dividers and ink, with an
 * optional quiet [footer] line under the rows (no ink, no action), and `origin` the edge it
 * scales in from. [onChoose] gets the row pressed.
 */
@Composable
fun OrganicMenuPanel(
    items: List<OrganicMenuItem>,
    seed: Double,
    modifier: Modifier = Modifier,
    footer: String? = null,
    origin: TransformOrigin = TransformOrigin(1f, 0f),
    hue: Double? = null,
    onChoose: (OrganicMenuItem) -> Unit,
) {
    val colors = remember(hue) { MenuColors(hue) }
    MenuPanel(items, seed, colors, footer, origin, onChoose, modifier)
}

/** A menu panel's footer line is a little shorter than a row. */
private const val MenuFooterHeight = 38.0

@Composable
private fun MenuPanel(
    items: List<OrganicMenuItem>,
    seed: Double,
    colors: MenuColors,
    footer: String?,
    origin: TransformOrigin,
    onChoose: (OrganicMenuItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val appear = remember { Animatable(0f) }
    LaunchedEffect(Unit) { appear.animateTo(1f, tween(180, easing = CubicBezierEasing(0.2f, 0.8f, 0.3f, 1f))) }
    // The row being pressed, and its ink spreading from the finger (every control's press, [InkSpread]).
    var pressed by remember { mutableStateOf<Int?>(null) }
    val spread = remember { InkSpread() }
    val scope = rememberCoroutineScope()
    val rowPx = with(LocalDensity.current) { MenuRowHeight.dp.toPx() }
    val padPx = with(LocalDensity.current) { 8.dp.toPx() }
    val danger = items.indexOfFirst { it.destructive }
    Column(
        modifier
            .graphicsLayer {
                val v = appear.value
                // Faded per drawing, not through an offscreen layer: a layer is cut at the panel's box,
                // and the pen line wobbles past it — the outline would show clipped straight until opaque.
                compositingStrategy = CompositingStrategy.ModulateAlpha
                alpha = v
                scaleX = 0.94f + 0.06f * v
                scaleY = scaleX
                // It settles toward the edge it grew from.
                translationY = (if (origin.pivotFractionY >= 0.5f) 4.dp.toPx() else -4.dp.toPx()) * (1 - v)
                transformOrigin = origin
            }
            .widthIn(min = 180.dp)
            .width(IntrinsicSize.Max)
            .drawWithCache {
                val w = (size.width / density).toDouble()
                val h = (size.height / density).toDouble()
                val pad = max(10.0, h * 0.04)
                val outline = wobRect(w, h, 16.0, seed + 100, autoMag(w, h), WobRectOptions(
                    curve = autoCurve(w, h), segmentsH = SegValue.Count(autoSegments(w).toDouble()), segmentsV = SegValue.Count(autoSegments(h).toDouble()),
                )).toPath(density)
                // A footer is one more band under the rows: a divider above it, and no ink in it.
                val bands = items.size + if (footer != null) 1 else 0
                val boundaries = (1 until bands).map { i -> rowBoundary(i * MenuRowHeight, w, seed + (i - 1) * 31 + 7, 2.0, pad) }
                val dividers = boundaries.map { dividerPath(it).toPath(density) }
                val regions = items.indices.map { rowRegion(it, bands, boundaries, w, h, pad).toPath(density) }
                val light = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
                val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    clipPath(outline) {
                        drawPath(outline, colors.cream)
                        if (danger >= 0) drawPath(regions[danger], colors.dangerWash)
                        pressed?.let { with(spread) { draw(regions[it], if (it == danger) colors.dangerWashPressed else colors.borderHover.copy(alpha = 0.15f)) } }
                        dividers.forEach { drawPath(it, colors.divider, style = light) }
                    }
                    drawPath(outline, colors.border, style = pen)
                }
            }
            .padding(horizontal = 8.dp),
    ) {
        items.forEachIndexed { i, item ->
            val source = remember { MutableInteractionSource() }
            val down by source.collectIsPressedAsState()
            LaunchedEffect(source) {
                source.interactions.collect {
                    when (it) {
                        is PressInteraction.Press -> {
                            pressed = i
                            // The row's touch point, in the panel's space.
                            spread.press(scope, Offset(it.pressPosition.x + padPx, it.pressPosition.y + i * rowPx))
                        }
                        is PressInteraction.Release, is PressInteraction.Cancel -> spread.release(scope)
                    }
                }
            }
            val ink = if (down) colors.borderHover else colors.border
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(MenuRowHeight.dp)
                    .clickable(source, indication = null, role = Role.Button) { onChoose(item) }
                    .padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OrganicIcon(item.icon, size = 17.dp, color = ink, strokeWidth = Tokens.Ink.value)
                BasicText(item.title, maxLines = 1, style = AppFonts.body(14f, lineHeight = 1.3f, color = if (down) colors.borderHover else Tokens.Text))
            }
        }
        if (footer != null) {
            Box(Modifier.fillMaxWidth().height(MenuFooterHeight.dp).padding(horizontal = 8.dp), contentAlignment = Alignment.CenterStart) {
                BasicText(footer, maxLines = 1, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted))
            }
        }
    }
}

/**
 * ToggleSwitch.tsx's TOGGLE: the switch's geometry, the same numbers the web and iOS draw through
 * their wobRect / wobCircle — change all three together (native/fixtures/geometry.json carries the
 * shapes for the seeds the apps use).
 *
 * The track is a pill bowed by hand: a radius just under half the height, so each end may come out
 * a little rounder or flatter than the other, and one seeded turn in each long edge (`curve` sets
 * how far it bows, up to 2.5 in or out). The pen goes round it once, on the very path the well is
 * filled to, so paint and edge never part. The knob is a lumpier circle than a button's dot (six
 * arcs, ±1).
 */
object Toggle {
    const val W = 50.0
    const val H = 28.0
    const val RADIUS = 12.5
    const val MAG = 2.4
    val track = WobRectOptions(curve = 2.8, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(1.0), cornerJitter = 2.0, cornerOffset = 1.4)
    const val KNOB = 20.0
    const val PAD = 4.0
    const val KNOB_SEED = 5.0
    val knob = WobCircleOptions(segments = 6, mag = 1.0, cpJitter = 0.5)
    /** The buttons' grain on the well, so the switch sits in their family. */
    const val GRAIN_ALPHA = 0.38f
    /** Not to be flipped now: faded like a disabled button. */
    const val DISABLED_ALPHA = 0.45f

    fun trackPath(seed: Double) = wobRect(W, H, RADIUS, seed, MAG, track)
    /** The knob, drawn in its own 20×20 box. */
    fun knobPath(seed: Double) = wobCircle(KNOB / 2, KNOB / 2, KNOB / 2, seed + KNOB_SEED, knob)
    /** Where the knob's box sits: 4 in from the left off, 4 in from the right on. */
    fun knobX(checked: Boolean) = if (checked) W - KNOB - PAD else PAD

    /**
     * The switch's inks. Off: a pale paper well edged in a soft ink (text-muted, 5:1 on cream —
     * WCAG 1.4.11 asks 3:1 of an input's edge). On: terracotta, edged and knob-ringed in deep
     * terracotta (6.6:1 on cream), the cream knob 3.5:1 on the fill.
     */
    class Inks(val fill: Color, val ink: Color)

    fun inks(checked: Boolean) = if (checked) Inks(Tokens.Terracotta, Tokens.TerracottaDeep) else Inks(Tokens.CreamDark, Tokens.TextMuted)
}

/** The knob's slide (200ms, the web's cubic-bezier(0.2, 0.8, 0.3, 1)) and the inks' change (160ms ease). */
private val KnobEasing = CubicBezierEasing(0.2f, 0.8f, 0.3f, 1f)
private val InkEasing = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

/**
 * The row a switch stands in with its words (the web's `<label>` around a ToggleSwitch), made the
 * one control: a tap anywhere on it — the words, the hint, the switch, the air between — flips
 * it, and TalkBack meets one switch named by the row's words with its state (on / 開啟), not a
 * line of text and a nameless 50×28 target beside it. The [OrganicToggle] inside only draws.
 * Not [enabled] (its value still loading, say), a tap does nothing; the knob's slide is the
 * feedback, so no wash spreads over the row.
 */
fun Modifier.toggleRow(checked: Boolean, enabled: Boolean = true, onCheckedChange: (Boolean) -> Unit): Modifier =
    toggleable(
        value = checked, interactionSource = null, indication = null, enabled = enabled, role = Role.Switch,
        onValueChange = onCheckedChange,
    )

/**
 * ToggleSwitch.tsx: a hand-drawn pill gone round once in the light pen, on the path its well is
 * filled to, with the buttons' grain on that well, and a lumpy cream knob that slides across:
 * a soft ink off, terracotta on ([Toggle]). 50×28; the pen's swings reach a little past the box
 * (nothing clips them). The drawing only: the row it stands in, with the words it flips, is what
 * a finger and TalkBack meet ([toggleRow]). Not [enabled], it is faded like a disabled button.
 * With animations off it snaps.
 */
@Composable
fun OrganicToggle(checked: Boolean, seed: Double = 9.0, enabled: Boolean = true) {
    val still = LocalContext.current.prefersReducedMotion()
    val inks = Toggle.inks(checked)
    val knobX by animateDpAsState(Toggle.knobX(checked).dp, if (still) snap() else tween(200, easing = KnobEasing), label = "knob")
    val fill by animateColorAsState(inks.fill, if (still) snap() else tween(160, easing = InkEasing), label = "fill")
    val ink by animateColorAsState(inks.ink, if (still) snap() else tween(160, easing = InkEasing), label = "ink")
    Box(
        Modifier
            .size(Toggle.W.dp, Toggle.H.dp)
            // Faded drawing by drawing, so the pen's swings past the box aren't cut straight.
            .fade(if (enabled) 1f else Toggle.DISABLED_ALPHA)
            .drawWithCache {
                val track = Toggle.trackPath(seed).toPath(density)
                val grain = Grain.brush(GrainMode.Tile, "grain-button", size, density, Toggle.GRAIN_ALPHA)
                val pen = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    drawPath(track, fill)
                    grain?.let { drawPath(track, it, alpha = Toggle.GRAIN_ALPHA) }
                    drawPath(track, ink, style = pen)
                }
            },
    ) {
        Box(
            Modifier
                .offset(x = knobX, y = Toggle.PAD.dp)
                .size(Toggle.KNOB.dp)
                .drawWithCache {
                    val knob = Toggle.knobPath(seed).toPath(density)
                    val ring = Stroke(Tokens.InkLight.toPx(), join = StrokeJoin.Round)
                    onDrawBehind {
                        drawPath(knob, Tokens.Cream)
                        drawPath(knob, ink, style = ring)
                    }
                },
        )
    }
}

/**
 * A notice with nothing to choose (an action that didn't go through), in the web's Modal: its
 * words, then the one way out — the quiet close, centred under them ([ModalCloseButton]), in the
 * reader's language, as every one-exit modal ends.
 */
@Composable
fun OrganicAlert(title: String, seed: Double = 71.0, closeLabel: String = L10n.Native.close, onDismiss: () -> Unit) {
    OrganicModal(onDismiss, title, seed) {
        ModalTitle(title)
        ModalCloseButton(closeLabel, onDismiss)
    }
}
