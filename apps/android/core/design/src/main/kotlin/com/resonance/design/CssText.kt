package com.resonance.design

import android.graphics.Paint
import android.graphics.text.LineBreaker
import android.os.Build
import android.text.Layout
import android.text.SpannableString
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.LineHeightSpan
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import com.resonance.design.generated.Tokens
import kotlin.math.roundToInt

/**
 * CSS line boxes on Android (the twin of iOS's CSSLineBoxes).
 *
 * Browsers make every line exactly `line-height` tall and put the baseline at
 * (lineBox + ascent − descent) / 2 of the *primary* font, whatever fallback
 * font (Noto CJK) drew the glyphs. Compose's Text measures lines from the
 * fallback fonts too and will not shrink a line below the font's own height,
 * so headings come out taller and body baselines lower than on the web. This
 * span pins each line to the CSS box, on a StaticLayout that also ignores
 * fallback line spacing.
 */
class CssLineHeightSpan(private val lineBoxPx: Float, primary: Paint.FontMetrics) : LineHeightSpan {
    // primary.ascent is negative, descent positive.
    private val baseline = ((lineBoxPx + (-primary.ascent) - primary.descent) / 2f).roundToInt()
    private val box = lineBoxPx.roundToInt()

    override fun chooseHeight(text: CharSequence, start: Int, end: Int, spanstartv: Int, lineHeight: Int, fm: Paint.FontMetricsInt) {
        fm.ascent = -baseline
        fm.descent = box - baseline
        fm.top = fm.ascent
        fm.bottom = fm.descent
    }
}

object CssLayout {
    fun build(text: String, family: AppFonts.Family, sizeSp: Float, weight: Int, lineHeight: Float, widthPx: Int, density: Float, color: Color = Tokens.Text): StaticLayout {
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = AppFonts.typeface(family, weight)
            textSize = sizeSp * density
            this.color = color.toArgb()
        }
        val lineBoxPx = sizeSp * lineHeight * density
        val spanned = SpannableString(text).apply {
            setSpan(CssLineHeightSpan(lineBoxPx, paint.fontMetrics), 0, text.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
        }
        val b = StaticLayout.Builder.obtain(spanned, 0, text.length, paint, widthPx)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setIncludePad(false)
            .setUseLineSpacingFromFallbacks(false)
            .setBreakStrategy(LineBreaker.BREAK_STRATEGY_SIMPLE) // greedy, like browsers
            .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
        if (Build.VERSION.SDK_INT >= 35) b.setUseBoundsForWidth(false)
        return b.build()
    }
}

/** A paragraph laid out with CSS line boxes; reads as text to accessibility services. */
@Composable
fun CssText(text: String, family: AppFonts.Family, sizeSp: Float, weight: Int = 400, lineHeight: Float = 1.5f, color: Color = Tokens.Text, modifier: Modifier = Modifier) {
    val density = LocalDensity.current.density
    BoxWithConstraints(modifier) {
        val widthPx = constraints.maxWidth
        val layout = remember(text, family, sizeSp, weight, lineHeight, widthPx, density, color, AppFonts.useBundledCJK) {
            CssLayout.build(text, family, sizeSp, weight, lineHeight, widthPx, density, color)
        }
        Box(
            Modifier
                .width((layout.width / density).let { androidx.compose.ui.unit.Dp(it) })
                .height(androidx.compose.ui.unit.Dp(layout.height / density))
                .semantics { this.text = AnnotatedString(text) }
                .drawBehind { drawIntoCanvas { layout.draw(it.nativeCanvas) } },
        )
    }
}
