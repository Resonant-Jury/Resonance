package com.resonance.design

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobCircleOptions
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobCircle
import com.resonance.geometry.wobRect
import kotlin.math.min

/** Modal.tsx's backdrop: warm, dim (oklch(20% 0.04 60 / 0.42)). */
private val Backdrop = OklchColor.parse("oklch(20% 0.04 60 / 0.42)") ?: Color.Black.copy(alpha = 0.42f)

/**
 * The web's Modal: a wobbly card — radius 26, the wobble 2.5% of its short
 * side, three or four turns across and five or six down, corners drifting 5 —
 * with grain, on the warm backdrop. Tapping outside dismisses (unless
 * `onDismiss` is null, like the web's busy state).
 */
@Composable
fun OrganicModal(onDismiss: (() -> Unit)?, title: String, seed: Double = 17.0, content: @Composable ColumnScope.() -> Unit) {
    Dialog(onDismissRequest = { onDismiss?.invoke() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Backdrop)
                .quietClickable { onDismiss?.invoke() }
                .padding(16.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                Modifier
                    .widthIn(max = 460.dp)
                    .fillMaxWidth()
                    .quietClickable {}
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
        }
    }
}

/** `clickable` without ripple or focus chrome, for backdrops and sheets. */
private fun Modifier.quietClickable(onClick: () -> Unit): Modifier =
    clickable(interactionSource = MutableInteractionSource(), indication = null, onClick = onClick)

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
        ModalTitle(title)
        ModalBody(body)
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
 * The web's OrganicMenu: a small wobbly card of rows (glyph + label), not
 * Material's menu. Anchored under its trigger's trailing edge.
 */
@Composable
fun OrganicMenu(expanded: Boolean, onDismiss: () -> Unit, items: List<OrganicMenuItem>, seed: Double = 97.0) {
    if (!expanded) return
    Popup(alignment = Alignment.TopEnd, offset = IntOffset(0, 120), onDismissRequest = onDismiss, properties = PopupProperties(focusable = true)) {
        Column(
            Modifier
                .padding(end = 12.dp)
                .widthIn(min = 200.dp, max = 280.dp)
                .organicSurface(Tokens.CardBg, Tokens.ModalBorder, radius = 18.0, seed = seed, grainOpacity = 0.25f)
                .padding(vertical = 6.dp),
        ) {
            items.forEach { item ->
                val color = if (item.destructive) Tokens.Terracotta else Tokens.Text
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clickable(role = Role.Button) { onDismiss(); item.onClick() }
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OrganicIcon(item.icon, size = 18.dp, color = color, strokeWidth = Tokens.Ink.value)
                    BasicText(item.title, style = AppFonts.body(15f, if (item.destructive) 600 else 400, color = color))
                }
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
