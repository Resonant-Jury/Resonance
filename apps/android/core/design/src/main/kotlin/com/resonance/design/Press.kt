package com.resonance.design

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipPath
import kotlinx.coroutines.CoroutineScope
import kotlin.math.hypot
import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

/**
 * Press feedback in the hand-drawn language — the one every control shares
 * (buttons, bare glyphs, tabs, menu rows): ink spreading from where the finger
 * lands, like the web's hover brush, cut to a wobbly outline of the control —
 * never Material's rectangle, which spills past the pen line of a round chip
 * or a bare glyph. The spread runs its course even on a quick tap, then fades.
 *
 * Provided app-wide as `LocalIndication`, so a plain `clickable` gets it
 * (each press a fresh wobble); a control narrows it with `inset` (a glyph
 * centred in a 48dp hit box washes a 40dp squircle), gives it its own `shape`
 * (a button's pill), or colours it (`OnFill` over a terracotta face).
 */
class OrganicIndication(
    private val color: Color = Wash,
    private val inset: Dp = 0.dp,
    private val shape: Shape? = null,
) : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode = OrganicPressNode(interactionSource, color, inset, shape)

    override fun equals(other: Any?) = other is OrganicIndication && other.color == color && other.inset == inset && other.shape == shape
    override fun hashCode() = (31 * color.hashCode() + inset.hashCode()) * 31 + (shape?.hashCode() ?: 0)

    companion object {
        /** The web's hover wash, terracotta at 14%. */
        val Wash = Tokens.Terracotta.copy(alpha = 0.14f)
        /** Over a filled terracotta face: the pressed shade the web's primary button darkens to. */
        val OnFill = Color.Black.copy(alpha = 0.14f)
        /** How long the ink takes to reach the far edge, and to lift. */
        const val SpreadMillis = 300
        const val FadeMillis = 220
        val SpreadEasing = CubicBezierEasing(0.2f, 0.8f, 0.3f, 1f)
    }
}

/**
 * The wash's outline for a box: small or squarish controls get the avatar's
 * lopsided squircle (one turn a side); long ones (rows, text buttons) a pill of
 * the button's calm wobble.
 */
fun organicWashOutline(size: Size, density: androidx.compose.ui.unit.Density, seed: Double): Outline {
    val d = density.density
    val w = size.width / d
    val h = size.height / d
    val short = min(w, h).toDouble()
    val shape = if (max(w, h) / min(w, h) < 1.6f) {
        WobRectShape(short * 0.42, seed, mag = short * 0.03, options = WobRectOptions(
            curve = 1.4, cornerJitter = 2.4, cornerOffset = short * 0.05, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
        ))
    } else {
        WobRectShape(min(16.0, short / 2), seed, mag = short * 0.05, options = WobRectOptions(
            curve = 1.3, cornerJitter = 1.3, cornerOffset = short * 0.04, segmentsH = SegValue.Range(2, 3), segmentsV = SegValue.Count(1.0),
        ))
    }
    return shape.createOutline(size, LayoutDirection.Ltr, density)
}

/**
 * One ink spread: where it started, how far it has run (0…1 of the distance to
 * the far corner) and how much of it is still on the paper. Menu rows and the
 * indication both drive one.
 */
class InkSpread {
    val reach = Animatable(0f)
    val ink = Animatable(0f)
    var origin by mutableStateOf(Offset.Unspecified)
        private set
    private var spreading: Job? = null
    private var down = 0

    fun press(scope: CoroutineScope, at: Offset) {
        down++
        origin = at
        spreading?.cancel()
        spreading = scope.launch {
            ink.snapTo(1f)
            reach.snapTo(0f)
            reach.animateTo(1f, tween(OrganicIndication.SpreadMillis, easing = OrganicIndication.SpreadEasing))
        }
    }

    fun release(scope: CoroutineScope) {
        down = max(0, down - 1)
        if (down > 0) return
        val pending = spreading
        scope.launch {
            // A quick tap still shows the whole spread before it lifts — unless the finger is down again by then.
            pending?.join()
            if (down > 0) return@launch
            ink.animateTo(0f, tween(OrganicIndication.FadeMillis))
        }
    }

    /** The spread inside `clip`, in `color`. */
    fun DrawScope.draw(clip: Path, color: Color) {
        val a = ink.value
        if (a <= 0f) return
        val c = if (origin.isSpecified) origin else center
        val far = hypot(max(c.x, size.width - c.x), max(c.y, size.height - c.y)) + 4.dp.toPx()
        clipPath(clip) { drawCircle(color, far * reach.value, c, alpha = a) }
    }
}

private class OrganicPressNode(
    private val source: InteractionSource,
    private val color: Color,
    private val inset: Dp,
    private val shape: Shape?,
) : Modifier.Node(), DrawModifierNode {
    private val spread = InkSpread()
    private var seed = 1.0
    private var cached: Pair<Pair<Size, Double>, Path>? = null

    override fun onAttach() {
        coroutineScope.launch {
            source.interactions.collect { i ->
                when (i) {
                    is PressInteraction.Press -> {
                        if (shape == null) seed = Random.nextInt(1, 9973).toDouble()
                        spread.press(coroutineScope, i.pressPosition)
                    }
                    is PressInteraction.Release, is PressInteraction.Cancel -> spread.release(coroutineScope)
                }
                invalidateDraw()
            }
        }
    }

    override fun ContentDrawScope.draw() {
        if (spread.ink.value > 0f) {
            val pad = inset.toPx()
            val box = Size(size.width - 2 * pad, size.height - 2 * pad)
            if (box.width > 0 && box.height > 0) {
                val key = box to seed
                val path = cached?.takeIf { it.first == key }?.second ?: run {
                    val outline = shape?.createOutline(box, layoutDirection, this) ?: organicWashOutline(box, this, seed)
                    Path().apply { addOutline(outline); translate(Offset(pad, pad)) }.also { cached = key to it }
                }
                with(spread) { draw(path, color) }
            }
        }
        drawContent()
    }
}
