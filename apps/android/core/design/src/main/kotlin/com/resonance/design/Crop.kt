package com.resonance.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobCircleOptions
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wavyLine
import com.resonance.geometry.wobCircle
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Where a photo sits under the avatar's mask while it is framed (design note B7): its zoom [z]
 * (1 = the mask just covered, up to 4) and its centre's offset ([ox], [oy]) from the mask's
 * centre, in stage units (dp).
 */
@Immutable
data class CropState(val z: Double = 1.0, val ox: Double = 0.0, val oy: Double = 0.0)

/** The square of the photo, in its own pixels, that the mask shows: what becomes the avatar. */
@Immutable
data class CropRect(val x: Double, val y: Double, val side: Double)

/**
 * The crop's arithmetic (design note B7), apart from Compose so it can be tested — the same on
 * every platform. A photo [iw] × [ih] (orientation applied) under a mask [mask] wide: at zoom z it
 * is drawn at s = sMin × z, sMin = mask / min(iw, ih), so the mask is always covered; the offset
 * keeps it so (|ox| ≤ (iw·s − mask) / 2, and the same down); zooming keeps the point under its
 * anchor where it is.
 */
class AvatarCrop(val iw: Double, val ih: Double, val mask: Double) {
    private val minScale = mask / min(iw, ih)

    fun scale(z: Double): Double = minScale * z

    /** The state with its zoom in [MIN_ZOOM, MAX_ZOOM] and the photo still covering the mask. */
    fun clamp(state: CropState): CropState {
        val z = state.z.coerceIn(MIN_ZOOM, MAX_ZOOM)
        val s = scale(z)
        val maxX = max(0.0, (iw * s - mask) / 2)
        val maxY = max(0.0, (ih * s - mask) / 2)
        return CropState(z, state.ox.coerceIn(-maxX, maxX), state.oy.coerceIn(-maxY, maxY))
    }

    /** A drag of ([dx], [dy]) stage units. */
    fun pan(state: CropState, dx: Double, dy: Double): CropState = clamp(state.copy(ox = state.ox + dx, oy = state.oy + dy))

    /**
     * Zoomed to [z], the photo's point under the anchor ([ax], [ay]: from the mask's centre, in stage
     * units — the centre for the slider, the fingers' centroid for a pinch) staying there.
     */
    fun zoomTo(state: CropState, z: Double, ax: Double = 0.0, ay: Double = 0.0): CropState {
        val to = z.coerceIn(MIN_ZOOM, MAX_ZOOM)
        val k = scale(to) / scale(state.z)
        return clamp(CropState(to, ax - (ax - state.ox) * k, ay - (ay - state.oy) * k))
    }

    /** What the mask shows, in the photo's pixels. */
    fun crop(state: CropState): CropRect {
        val s = scale(state.z)
        val side = mask / s
        return CropRect(iw / 2 - state.ox / s - side / 2, ih / 2 - state.oy / s - side / 2, side)
    }

    companion object {
        const val MIN_ZOOM = 1.0
        const val MAX_ZOOM = 4.0

        /** The square the crop is drawn into: its own size, kept between 256 (what the server keeps) and 512. */
        fun outputSize(side: Double): Int = min(512, max(256, side.roundToInt()))

        /** A pointer wheel's zoom (the web's): z × e^(−deltaY × 0.002). */
        fun wheelZoom(z: Double, deltaY: Double): Double = z * exp(-deltaY * 0.002)
    }
}

/** The stage's side: a square at most 320 wide; the mask is 48 smaller, so 24 of the dimmed photo shows round it. */
fun cropStageSide(available: Dp): Dp = min(320f, available.value).dp

fun cropMask(stage: Dp): Dp = stage - 48.dp

/** The scrim over the photo outside the mask, oklch(30% 0.02 70 / 0.5). */
private val CropScrim = OklchColor.parse("oklch(30% 0.02 70 / 0.5)") ?: Tokens.Text.copy(alpha = 0.5f)

/**
 * The crop's stage (design note B7): a square of cream-dark paper in HandDrawnImage's frame (seed
 * 79, no pen line), the photo on it where [state] puts it, dimmed outside the avatar's own outline
 * — HandDrawnAvatar's recipe at the mask's size, seed 77, outlined in cream — so what shows inside
 * it is exactly the avatar to be. One finger moves the photo, two pinch it about their centroid.
 * One element for TalkBack, named [label]: the zoom slider beside it does the rest.
 */
@Composable
fun AvatarCropStage(
    photo: ImageBitmap,
    side: Dp,
    state: CropState,
    onState: (CropState) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
) {
    val mask = cropMask(side)
    val model = remember(photo, mask) { AvatarCrop(photo.width.toDouble(), photo.height.toDouble(), mask.value.toDouble()) }
    val current by rememberUpdatedState(state)
    val emit by rememberUpdatedState(onState)
    val frame = remember { AutoWobRectShape(16.0, 79.0, 0.8) }
    val m = mask.value.toDouble()
    val avatar = remember(m) {
        WobRectShape(m * 0.4, 77.0, mag = m * 0.022, options = WobRectOptions(
            curve = 1.3, cornerJitter = 3.2, cornerOffset = m * 0.06, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
        ))
    }
    Box(
        modifier
            .size(side)
            .semantics { contentDescription = label }
            .pointerInput(model) {
                detectTransformGestures { centroid, pan, zoom, _ ->
                    var next = current
                    if (zoom != 1f) {
                        // The fingers' centroid, from the mask's centre, in stage units.
                        val ax = (centroid.x - size.width / 2f) / density
                        val ay = (centroid.y - size.height / 2f) / density
                        next = model.zoomTo(next, next.z * zoom, ax.toDouble(), ay.toDouble())
                    }
                    next = model.pan(next, (pan.x / density).toDouble(), (pan.y / density).toDouble())
                    if (next != current) emit(next)
                }
            }
            .drawWithCache {
                val paper = frame.createOutline(size, layoutDirection, this)
                val paperPath = Path().apply { addOutline(paper) }
                val maskPx = mask.toPx()
                val inset = (size.width - maskPx) / 2f
                val ring = avatar.createOutline(Size(maskPx, maskPx), layoutDirection, this)
                val ringPath = Path().apply { addOutline(ring); translate(Offset(inset, inset)) }
                val pen = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round)
                onDrawBehind {
                    clipPath(paperPath) {
                        drawRect(Tokens.CreamDark)
                        val s = model.scale(current.z).toFloat() * density
                        val w = photo.width * s
                        val h = photo.height * s
                        val left = size.width / 2f + current.ox.toFloat() * density - w / 2f
                        val top = size.height / 2f + current.oy.toFloat() * density - h / 2f
                        drawImage(
                            photo,
                            dstOffset = IntOffset(left.roundToInt(), top.roundToInt()),
                            dstSize = IntSize(w.roundToInt(), h.roundToInt()),
                            filterQuality = FilterQuality.Medium,
                        )
                        clipPath(ringPath, ClipOp.Difference) { drawRect(CropScrim) }
                    }
                    drawPath(ringPath, Tokens.Cream.copy(alpha = 0.9f), style = pen)
                }
            },
    )
}

/**
 * The web's OrganicSlider: a thick wavy stroke for the track (7, oklch(84% 0.022 75)), the same
 * stroke in terracotta up to the value, and a lopsided cream knob (r 11) on a terracotta rim. Drag
 * or tap it; TalkBack adjusts it ([label], its range and value).
 */
@Composable
fun OrganicSlider(
    value: Float,
    onChange: (Float) -> Unit,
    range: ClosedFloatingPointRange<Float>,
    label: String,
    modifier: Modifier = Modifier,
    step: Float = 0f,
    seed: Double = 5.0,
) {
    val emit by rememberUpdatedState(onChange)
    val knobR = 11.dp
    fun valueAt(x: Float, width: Float, density: Float): Float {
        val pad = (knobR.value + 1f) * density
        val usable = max(1f, width - pad * 2)
        val raw = range.start + ((x - pad) / usable).coerceIn(0f, 1f) * (range.endInclusive - range.start)
        return if (step > 0f) ((raw - range.start) / step).roundToInt() * step + range.start else raw
    }
    Canvas(
        modifier
            .fillMaxWidth()
            .height(knobR * 2 + 4.dp)
            .semantics {
                contentDescription = label
                progressBarRangeInfo = ProgressBarRangeInfo(value, range)
                setProgress { v -> emit(v.coerceIn(range.start, range.endInclusive)); true }
            }
            .pointerInput(range, step) {
                detectTapGestures { emit(valueAt(it.x, size.width.toFloat(), density)) }
            }
            .pointerInput(range, step) {
                detectHorizontalDragGestures { change, _ -> emit(valueAt(change.position.x, size.width.toFloat(), density)) }
            },
    ) {
        val d = density
        val w = size.width / d
        val cy = size.height / 2f
        val pad = knobR.value + 1f
        val frac = if (range.endInclusive > range.start) ((value - range.start) / (range.endInclusive - range.start)).coerceIn(0f, 1f) else 0f
        val thumbX = (pad + frac * max(0f, w - pad * 2)) * d
        val capPad = 7f / 2 + 1
        val barLen = max(0f, w - capPad * 2)
        if (barLen > 0f) {
            val bar = wavyLine(barLen.toDouble(), seed, 2.6, max(4, (barLen / 38f).roundToInt())).toPath(d, capPad * d, cy)
            val track = Stroke(7.dp.toPx(), cap = StrokeCap.Round)
            drawPath(bar, SliderTrack, style = track)
            clipRect(right = thumbX) { drawPath(bar, Tokens.Terracotta, style = track) }
        }
        val knob = wobCircle(knobR.value.toDouble(), knobR.value.toDouble(), knobR.value.toDouble(), seed + 5, WobCircleOptions(segments = 9, mag = 0.7, cpJitter = 0.4)).toPath(d)
        translate(left = thumbX - knobR.toPx(), top = cy - knobR.toPx()) {
            drawPath(knob, Tokens.Cream)
            drawPath(knob, Tokens.Terracotta, style = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round))
        }
    }
}

/** The slider's track, oklch(84% 0.022 75). */
private val SliderTrack = OklchColor.parse("oklch(84% 0.022 75)") ?: Tokens.CreamDark
