package com.resonance.design

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.seedFromString

/** The regions with the web's flag art (public/flags, rasterised by scripts/apps/flags.ts). */
private val FlagArt = mapOf(
    "gb" to R.drawable.flag_gb,
    "hk" to R.drawable.flag_hk,
    "jp" to R.drawable.flag_jp,
    "kr" to R.drawable.flag_kr,
    "tw" to R.drawable.flag_tw,
    "us" to R.drawable.flag_us,
)

/** SquareFlag.tsx's faint rim, `oklch(36% 0.06 60 / 0.55)`. */
private val FlagRim = OklchColor.parse("oklch(36% 0.06 60 / 0.55)") ?: Color.Black.copy(alpha = 0.3f)

/** Whether a region has flag art (else [SquareFlag] draws nothing). */
fun hasSquareFlag(code: String): Boolean = code.lowercase() in FlagArt

/**
 * The web's SquareFlag: a square national flag cropped by the avatar's
 * hand-drawn outline — a generous corner (0.3 of the side), one assertive turn
 * a side, the corners jittered and shifted — with a faint ink rim, so flags sit
 * in the pen-sketch world instead of reading as crisp emoji. The twin of iOS's.
 */
@Composable
fun SquareFlag(code: String, size: Dp = 18.dp, seed: Double? = null) {
    val c = code.lowercase()
    val art = FlagArt[c] ?: return
    val s = size.value.toDouble()
    val shape = remember(c, s, seed) {
        WobRectShape(s * 0.3, seed ?: seedFromString(c).toDouble(), mag = s * 0.05, options = WobRectOptions(
            curve = 1.6, cornerJitter = 3.0, cornerOffset = s * 0.06, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
        ))
    }
    // The art overscans the square so an outward bulge of the wobble stays covered.
    val pad = maxOf(1.0, s * 0.06).dp
    Box(
        Modifier
            .size(size)
            .clearAndSetSemantics { }
            .drawWithContent {
                drawContent()
                drawOutline(shape.createOutline(this.size, layoutDirection, this), FlagRim, style = Stroke(Tokens.InkLight.toPx(), join = StrokeJoin.Round))
            }
            .clip(shape),
        contentAlignment = Alignment.Center,
    ) {
        Image(painterResource(art), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.requiredSize(size + pad * 2))
    }
}
