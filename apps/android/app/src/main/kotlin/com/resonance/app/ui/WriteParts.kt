package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.AutoWobRectShape
import com.resonance.design.OrganicIcon
import com.resonance.design.WobRectShape
import com.resonance.design.boundaryPoints
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.design.polylinePath
import com.resonance.design.toPath
import com.resonance.design.fade
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobRect
import kotlin.math.max
import kotlin.math.min

/**
 * CardEditor's AddTagButton — the AI pill: a quiet frame in the field's line
 * (R ≤ 18, seed 67), a small plus and muted 12sp text.
 */
@Composable
fun AddTagButton(label: String, onClick: () -> Unit) {
    Row(
        Modifier
            .drawWithCache {
                val o = WobRectShape(min(size.height / density / 2.0, 18.0), 67.0).createOutline(size, layoutDirection, this)
                val ink = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round)
                onDrawBehind { drawOutline(o, Tokens.FieldBorder, style = ink) }
            }
            .plainClickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        OrganicIcon(IconName.Plus, size = 12.dp, color = Tokens.TextMuted)
        BasicText(label, style = AppFonts.body(12f, color = Tokens.TextMuted))
    }
}

/**
 * CardEditor's TagInput: a two-segment bar — the text on the left, Add on the
 * right — under one wobbly line (seed 53) with a wavy divider between, the Add
 * segment washed in the light terracotta.
 */
@Composable
fun TagInputBar(value: String, onValueChange: (String) -> Unit, placeholder: String, addLabel: String, onAdd: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    var addWidth by remember { mutableFloatStateOf(96f) }
    val scale = LocalDensity.current.density
    val canAdd = value.isNotBlank()
    val stroke = if (focused) Tokens.Terracotta else Tokens.FieldBorder
    Row(
        Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .drawWithCache {
                val w = (size.width / density).toDouble()
                val h = (size.height / density).toDouble()
                // SegmentedActionBar's wobble recipe, so the two read as one family.
                val outer = wobRect(w, h, 16.0, 53.0, min(w, h) * 0.05, WobRectOptions(
                    curve = 1.2, cornerJitter = 1.2, cornerOffset = h * 0.04, segmentsH = SegValue.Range(7, 9), segmentsV = SegValue.Range(2, 3),
                )).toPath(density)
                val pad = max(12.0, h * 0.3)
                val boundary = boundaryPoints(w - addWidth, h, 53.0 + 11, 1.6, pad)
                val region = polylinePath(boundary, density).apply {
                    lineTo(((w + pad) * density).toFloat(), ((h + pad) * density).toFloat())
                    lineTo(((w + pad) * density).toFloat(), (-pad * density).toFloat())
                    close()
                }
                val divider = polylinePath(boundary, density)
                val ink = Tokens.Ink.toPx()
                onDrawBehind {
                    clipPath(outer) {
                        drawPath(outer, Tokens.Cream)
                        drawPath(region, Tokens.TerracottaLight.copy(alpha = 0.6f))
                        drawPath(divider, stroke, style = Stroke(ink, cap = StrokeCap.Round))
                    }
                    drawPath(outer, stroke, style = Stroke(ink, join = StrokeJoin.Round))
                }
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f).padding(horizontal = Tokens.FieldPadX.dp, vertical = Tokens.FieldPadY.dp)) {
            val text = AppFonts.body(15f, lineHeight = 1.6f)
            if (value.isEmpty()) BasicText(placeholder, style = AppFonts.oblique(text.copy(color = Tokens.Placeholder)))
            BasicTextField(
                value, onValueChange,
                textStyle = text,
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (canAdd) onAdd() }),
                modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }.semantics { contentDescription = placeholder },
            )
        }
        val ink = if (canAdd) Tokens.Terracotta else Tokens.TextMuted
        Row(
            Modifier
                .fillMaxHeight()
                .onSizeChanged { addWidth = it.width / scale }
                .fade(if (canAdd) 1f else 0.7f)
                .plainClickable(role = Role.Button) { if (canAdd) onAdd() }
                .padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            OrganicIcon(IconName.Plus, size = 12.dp, color = ink)
            BasicText(addLabel, style = AppFonts.body(13f, 600, lineHeight = 1.3f, color = ink))
        }
    }
}

/** One half of the image surface (upload or illustrate): the terracotta glyph, the muted title and its fainter hint. */
@Composable
fun MediaHalf(icon: IconName, title: String, hint: String, modifier: Modifier = Modifier) {
    Column(
        modifier.padding(vertical = 22.dp, horizontal = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
    ) {
        OrganicIcon(icon, size = 26.dp, color = Tokens.Terracotta)
        BasicText(title, style = AppFonts.body(14f, 600, lineHeight = 1.4f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
        BasicText(hint, style = AppFonts.body(12f, lineHeight = 1.4f, color = Tokens.TextMuted.copy(alpha = 0.75f)).copy(textAlign = TextAlign.Center))
    }
}

/**
 * The image surface's frame (HandDrawnDashedSurface R16, seed 31, bow 0.8):
 * the field's line, terracotta while something is on its way in.
 */
fun Modifier.mediaFrame(busy: Boolean = false): Modifier = drawBehind {
    val o = AutoWobRectShape(16.0, 31.0, 0.8).createOutline(size, layoutDirection, this)
    drawOutline(o, if (busy) Tokens.Terracotta else Tokens.FieldBorder, style = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
}
