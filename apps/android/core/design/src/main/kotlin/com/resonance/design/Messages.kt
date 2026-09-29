package com.resonance.design

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.jsRound
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * MessageBubble's seedFromId: a Java-style string hash over UTF-16 units
 * (Int wrapping), folded into 1…9973. Bubbles start from 7; a shared card's
 * embed starts from 11. ("m1" → 183, "card-77" from 11 → 6326.) The twin of
 * iOS's seedFromId.
 */
fun seedFromId(id: String, start: Int = 7): Double {
    var h = start
    for (unit in id) h = h * 31 + unit.code
    return (abs(h % 9973) + 1).toDouble()
}

/**
 * MessageBubble's outline: its wobble follows its own size — radius
 * min(16, h·0.42), swing min(2.6, h·0.05), a turn per 80 across (2–6) and per
 * 52 down (1–8), bow 1.3, corner jitter 1.6, corners pulled in 4%.
 */
class MessageBubbleShape(private val seed: Double) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val d = density.density
        val w = (size.width / d).toDouble()
        val h = (size.height / d).toDouble()
        if (w <= 0 || h <= 0) return Outline.Rectangle(Rect.Zero)
        val across = min(6.0, max(2.0, jsRound(w / 80)))
        val down = min(8.0, max(1.0, jsRound(h / 52)))
        return WobRectShape(
            min(16.0, h * 0.42), seed, mag = min(2.6, h * 0.05),
            options = WobRectOptions(
                curve = 1.3, cornerJitter = 1.6, cornerOffset = min(w, h) * 0.04,
                segmentsH = SegValue.Count(across), segmentsV = SegValue.Count(down),
            ),
        ).createOutline(size, layoutDirection, density)
    }
}

/**
 * A message's bubble (MessageBubble.tsx): 14/1.65 text, padding 10×16, your
 * own on a terracotta-light wash, theirs on cream with a thin field line (1.1,
 * the web's own number). It hugs its words. A reply to a note wears a small
 * italic header (`quoteLabel`).
 */
@Composable
fun MessageBubble(text: String, mine: Boolean, seed: Double, modifier: Modifier = Modifier, quoteLabel: String? = null) {
    Column(
        modifier
            .drawWithCache {
                val o = MessageBubbleShape(seed).createOutline(size, layoutDirection, this)
                val line = Stroke(1.1.dp.toPx(), join = StrokeJoin.Round)
                onDrawBehind {
                    if (mine) {
                        drawOutline(o, Tokens.TerracottaLight, alpha = 0.62f)
                    } else {
                        drawOutline(o, Tokens.Cream)
                        drawOutline(o, Tokens.FieldBorder, style = line)
                    }
                }
            }
            .padding(vertical = 10.dp, horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (quoteLabel != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                OrganicIcon(IconName.Note, size = 13.dp, color = Tokens.TextMuted)
                BasicText(quoteLabel, style = AppFonts.oblique(AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted)))
            }
        }
        if (text.isNotEmpty()) CssText(text, AppFonts.Family.Body, 14f, lineHeight = 1.65f, fitsContent = true)
    }
}
