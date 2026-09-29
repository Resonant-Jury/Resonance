package com.resonance.design

import android.util.LruCache
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import com.resonance.geometry.PathCommand
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobCircleOptions
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.autoCurve
import com.resonance.geometry.autoMag
import com.resonance.geometry.autoSegments
import com.resonance.geometry.wobCircle
import com.resonance.geometry.wobRect
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The web's geometry is in CSS px; on Android that is dp. Every path is built
 * in dp by the shared Kotlin port and scaled to pixels here.
 */
fun List<PathCommand>.toPath(scale: Float, dx: Float = 0f, dy: Float = 0f): Path {
    val p = Path()
    fun x(v: Double) = dx + v.toFloat() * scale
    fun y(v: Double) = dy + v.toFloat() * scale
    for (c in this) {
        when (c) {
            is PathCommand.Move -> p.moveTo(x(c.x), y(c.y))
            is PathCommand.Line -> p.lineTo(x(c.x), y(c.y))
            is PathCommand.Cubic -> p.cubicTo(x(c.x1), y(c.y1), x(c.x2), y(c.y2), x(c.x), y(c.y))
            is PathCommand.Quad -> p.quadraticTo(x(c.x1), y(c.y1), x(c.x), y(c.y))
            PathCommand.Close -> p.close()
        }
    }
    return p
}

/** Compose re-asks shapes for outlines on every size change; a feed repeats the same few sizes. */
object GeometryCache {
    private val cache = LruCache<String, List<PathCommand>>(512)
    fun get(key: String, make: () -> List<PathCommand>): List<PathCommand> =
        cache.get(key) ?: make().also { cache.put(key, it) }
}

/** wobRect with the web's automatic segment/curve/magnitude choice for the size. */
class WobRectShape(
    private val radius: Double = 22.0,
    private val seed: Double = 1.0,
    private val mag: Double? = null,
    private val options: WobRectOptions? = null,
) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val d = density.density
        val w = (size.width / d).toDouble()
        val h = (size.height / d).toDouble()
        if (w <= 0 || h <= 0) return Outline.Rectangle(Rect.Zero)
        val o = options ?: WobRectOptions(
            curve = autoCurve(w, h),
            segmentsH = SegValue.Count(autoSegments(w).toDouble()),
            segmentsV = SegValue.Count(autoSegments(h).toDouble()),
        )
        val r = min(radius, min(w, h) / 2)
        val m = mag ?: autoMag(w, h)
        val cmds = GeometryCache.get("r|$w|$h|$r|$seed|$m|$o") { wobRect(w, h, r, seed, m, o) }
        return Outline.Generic(cmds.toPath(d))
    }
}

class WobCircleShape(
    private val seed: Double = 1.0,
    private val options: WobCircleOptions = WobCircleOptions(),
) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val d = density.density
        val w = (size.width / d).toDouble()
        val h = (size.height / d).toDouble()
        val cmds = wobCircle(w / 2, h / 2, min(w, h) / 2, seed, options)
        return Outline.Generic(cmds.toPath(d))
    }
}

/**
 * A full-width wavy stroke, centred vertically. The web draws its rules as
 * `wavyLine(200|240, seed, amp, steps)` stretched across the box, so a rule
 * has the same `steps` turns at any width; x scales linearly, so drawing it at
 * the real width is the same curve. Without `steps`, one turn per ~30dp.
 */
fun wavyLinePath(widthPx: Float, heightPx: Float, density: Float, seed: Double, amp: Double, steps: Int? = null): Path {
    val w = (widthPx / density).toDouble()
    val n = steps ?: max(3, (w / 30).roundToInt())
    return com.resonance.geometry.wavyLine(w, seed, amp, n).toPath(density, 0f, heightPx / 2)
}
