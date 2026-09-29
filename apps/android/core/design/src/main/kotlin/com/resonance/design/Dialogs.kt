package com.resonance.design

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
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

/** Modal.tsx's backdrop: warm, dim (oklch(20% 0.04 60 / 0.42)). */
private val Backdrop = OklchColor.parse("oklch(20% 0.04 60 / 0.42)") ?: Color.Black.copy(alpha = 0.42f)

/**
 * The web's Modal: a wobbly card — radius 26, the wobble 2.5% of its short
 * side, three or four turns across and five or six down, corners drifting 5 —
 * with grain, on the warm backdrop, and the hand-drawn × in its top corner.
 * Tapping outside or the × dismisses (unless `onDismiss` is null, like the
 * web's busy state).
 */
@Composable
fun OrganicModal(
    onDismiss: (() -> Unit)?,
    title: String,
    seed: Double = 17.0,
    closeLabel: String = L10n.Safety.Report.close,
    /** The card's widest (Modal's `maxWidth`): 460 unless a small dialog asks for less. */
    maxWidth: Dp = 460.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Dialog(onDismissRequest = { onDismiss?.invoke() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Backdrop)
                .plainClickable { onDismiss?.invoke() }
                .padding(16.dp),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.widthIn(max = maxWidth).fillMaxWidth()) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .plainClickable {}
                        .semantics { paneTitle = title }
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
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    content = content,
                )
                // Modal.module.css .closeBtn: 34 square, 22 from the top, 18 from the end, the text color at 0.55.
                if (onDismiss != null) Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 22.dp, end = 18.dp)
                        .size(34.dp)
                        .clickable(role = Role.Button, onClickLabel = closeLabel, onClick = onDismiss)
                        .semantics { contentDescription = closeLabel },
                    contentAlignment = Alignment.Center,
                ) {
                    // The web draws its × with INK in an 18-unit box; the glyph's box is 24.
                    OrganicIcon(IconName.Close, size = 18.dp, color = Tokens.Text.copy(alpha = 0.55f), strokeWidth = Tokens.Ink.value * 24f / 18f)
                }
            }
        }
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
 * then ghost cancel and the primary verb, small, at the bottom right.
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
) {
    OrganicModal(if (busy) null else onCancel, title, seed) {
        // ConfirmModal: 8 between title and body, 18 before the actions (14 + ModalActions' 4).
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            ModalTitle(title)
            ModalBody(body)
        }
        ModalActions {
            OrganicButton(cancelLabel, variant = ButtonVariant.Ghost, small = true, enabled = !busy, onClick = onCancel)
            OrganicButton(if (busy) "…" else confirmLabel, small = true, enabled = !busy, onClick = onConfirm)
        }
    }
}

/** ConfirmModal's title: Playfair 20/700. */
@Composable
fun ModalTitle(text: String) = BasicText(text, style = AppFonts.heading(20f, lineHeight = 1.3f))

/** ConfirmModal's body: 14px, 1.6, muted. */
@Composable
fun ModalBody(text: String, color: Color = Tokens.TextMuted) = BasicText(text, style = AppFonts.body(14f, lineHeight = 1.6f, color = color))

/** Actions at the bottom right, 10 apart, a little air above. */
@Composable
fun ModalActions(content: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End), verticalAlignment = Alignment.CenterVertically) {
        content()
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
 * OrganicMenu's trigger: a wobbly squircle chip (R 0.42s, one turn a side)
 * on cream with a terracotta pen (or a card's hue), the glyph at 0.53s. Also
 * the header's other round actions (share), so they read as one set. The chip
 * sits centred in a 44dp hit box.
 */
@Composable
fun OrganicMenuChip(icon: IconName, label: String, seed: Double, size: Dp = 38.dp, expanded: Boolean = false, hue: Double? = null, onClick: () -> Unit) {
    val colors = remember(hue) { MenuColors(hue) }
    val ink = if (expanded) colors.borderHover else colors.border
    Box(
        Modifier
            .size(MenuHitBox)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(size).drawWithCache {
                val s = size.value.toDouble()
                val o = WobRectShape(s * 0.42, seed, mag = s * 0.03, options = WobRectOptions(
                    curve = 1.4, cornerJitter = 2.4, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
                )).createOutline(this.size, layoutDirection, this)
                val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    drawOutline(o, colors.cream.copy(alpha = 0.9f))
                    drawOutline(o, colors.border, style = pen)
                }
            },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(icon, size = (size.value * 0.53f).roundToInt().dp, color = ink, strokeWidth = Tokens.Ink.value) }
    }
}

/** The chip's touch target. */
private val MenuHitBox = 44.dp

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
) {
    var open by remember { mutableStateOf(false) }
    val colors = remember(hue) { MenuColors(hue) }
    Box {
        OrganicMenuChip(triggerIcon, label, seed, size = triggerSize, expanded = open, hue = hue) { open = !open }
        if (open) {
            val gap = with(LocalDensity.current) { 8.dp.roundToPx() }
            // The chip is centred in its hit box: the panel hangs from the chip, not from the box.
            val inset = with(LocalDensity.current) { ((MenuHitBox - triggerSize) / 2).roundToPx() }
            Popup(
                popupPositionProvider = remember(gap, inset) { BelowTrailingEdge(gap, inset) },
                onDismissRequest = { open = false },
                properties = PopupProperties(focusable = true),
            ) {
                MenuPanel(items, seed, colors) { item ->
                    open = false
                    item.onClick()
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
private fun MenuPanel(items: List<OrganicMenuItem>, seed: Double, colors: MenuColors, onChoose: (OrganicMenuItem) -> Unit) {
    val appear = remember { Animatable(0f) }
    LaunchedEffect(Unit) { appear.animateTo(1f, tween(180, easing = CubicBezierEasing(0.2f, 0.8f, 0.3f, 1f))) }
    var pressed by remember { mutableStateOf<Int?>(null) }
    val danger = items.indexOfFirst { it.destructive }
    Column(
        Modifier
            .graphicsLayer {
                val v = appear.value
                alpha = v
                scaleX = 0.94f + 0.06f * v
                scaleY = scaleX
                translationY = -4.dp.toPx() * (1 - v)
                transformOrigin = TransformOrigin(1f, 0f)
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
                val boundaries = (1 until items.size).map { i -> rowBoundary(i * MenuRowHeight, w, seed + (i - 1) * 31 + 7, 2.0, pad) }
                val dividers = boundaries.map { dividerPath(it).toPath(density) }
                val regions = items.indices.map { rowRegion(it, items.size, boundaries, w, h, pad).toPath(density) }
                val light = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
                val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    clipPath(outline) {
                        drawPath(outline, colors.cream)
                        if (danger >= 0) drawPath(regions[danger], colors.dangerWash)
                        pressed?.let { drawPath(regions[it], if (it == danger) colors.dangerWashPressed else colors.borderHover.copy(alpha = 0.15f)) }
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
            LaunchedEffect(down) { if (down) pressed = i else if (pressed == i) pressed = null }
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
    }
}

/**
 * ToggleSwitch.tsx: a wobbly pill track (50×28) and a slightly irregular knob
 * that slides across; terracotta when on.
 */
@Composable
fun OrganicToggle(checked: Boolean, onCheckedChange: (Boolean) -> Unit, label: String, seed: Double = 9.0) {
    val knobX by animateDpAsState(if (checked) 26.dp else 4.dp, spring(dampingRatio = 0.75f, stiffness = 700f), label = "knob")
    Box(
        Modifier
            .size(50.dp, 28.dp)
            .semantics {
                contentDescription = label
                toggleableState = ToggleableState(checked)
                stateDescription = if (checked) "on" else "off"
            }
            .clickable(role = Role.Switch) { onCheckedChange(!checked) }
            .drawWithCache {
                val track = wobRect(50.0, 28.0, 14.0, seed, 1.1, WobRectOptions(
                    curve = 1.5, cornerJitter = 0.6, segmentsH = SegValue.Range(1, 2), segmentsV = SegValue.Range(3, 4),
                )).toPath(density)
                val ink = Stroke(Tokens.Ink.toPx())
                onDrawBehind {
                    drawPath(track, if (checked) Tokens.Terracotta else Tokens.ToggleOff)
                    drawPath(track, if (checked) Tokens.TerracottaDeep else Tokens.ToggleOffStroke, style = ink)
                }
            },
    ) {
        Box(
            Modifier
                .offset(x = knobX, y = 4.dp)
                .size(20.dp)
                .drawWithCache {
                    val knob = wobCircle(10.0, 10.0, 10.0, seed + 5, WobCircleOptions(segments = 8, mag = 0.5, cpJitter = 0.3)).toPath(density)
                    val line = Stroke(Tokens.InkLight.toPx())
                    onDrawBehind {
                        drawPath(knob, Tokens.Cream)
                        drawPath(knob, Tokens.TextMuted.copy(alpha = 0.4f), style = line)
                    }
                },
        )
    }
}

/** A one-button notice (an action that didn't go through), in the web's Modal. */
@Composable
fun OrganicAlert(title: String, okLabel: String, seed: Double = 71.0, onDismiss: () -> Unit) {
    OrganicModal(onDismiss, title, seed) {
        ModalTitle(title)
        ModalActions { OrganicButton(okLabel, small = true, onClick = onDismiss) }
    }
}
