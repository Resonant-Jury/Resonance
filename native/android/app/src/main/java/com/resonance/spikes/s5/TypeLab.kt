package com.resonance.spikes.s5

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.spikes.design.AppFonts
import com.resonance.spikes.design.CssLayout
import com.resonance.spikes.design.CssText
import com.resonance.spikes.generated.Tokens
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * S5 on Android — the same samples, fonts and widths as native/typelab and
 * the iOS TypeLab. Measures line breaks, line boxes and baselines with
 * TextMeasurer (dp) and prints them as S5RESULT for comparison with Chrome.
 */
data class TypeSample(val id: String, val text: String, val heading: Boolean, val size: Float, val weight: Int, val lineHeight: Float, val width: Float) {
    fun style(): TextStyle =
        if (heading) AppFonts.heading(size, weight, lineHeight) else AppFonts.body(size, weight, lineHeight)

    companion object {
        val all = listOf(
            TypeSample("title", "一場雨後的散步 After the Rain", true, 28f, 700, 1.25f, 335f),
            TypeSample("body", "雨停的時候，巷口的積水映出整排路燈。I remembered walking home through puddles like this — 小時候也是這樣踩著水窪回家，鞋子濕了也不在意。", false, 16f, 400, 1.7f, 335f),
            TypeSample("excerpt", "水溫太高，粉也磨得太細，但那是第一次覺得早晨是屬於自己的。「慢一點也沒關係。」她說。", false, 14f, 400, 1.65f, 280f),
            TypeSample("cardTitle", "The quiet after moving out 搬家後的安靜", true, 18f, 700, 1.3f, 260f),
        )
    }
}

@Serializable
data class TypeMeasurement(val id: String, val platform: String, val bundledCJK: Boolean, val lines: List<Line>, val height: Float) {
    @Serializable
    data class Line(val start: Int, val text: String, val top: Float, val height: Float, val baseline: Float)
}

fun measure(m: TextMeasurer, s: TypeSample, density: Density): TypeMeasurement {
    val d = density.density
    val r = m.measure(s.text, s.style(), constraints = Constraints(maxWidth = (s.width * d).toInt()), density = density)
    val lines = (0 until r.lineCount).map { i ->
        val top = r.getLineTop(i)
        TypeMeasurement.Line(
            start = r.getLineStart(i),
            text = s.text.substring(r.getLineStart(i), r.getLineEnd(i)),
            top = top / d,
            height = (r.getLineBottom(i) - top) / d,
            baseline = (r.getLineBaseline(i) - top) / d,
        )
    }
    return TypeMeasurement(s.id, "android", AppFonts.useBundledCJK, lines, r.size.height / d)
}

/** The same measurement on the CSS-line-box StaticLayout (design/CssText.kt). */
fun measureCss(s: TypeSample, density: Density): TypeMeasurement {
    val d = density.density
    val family = if (s.heading) AppFonts.Family.Heading else AppFonts.Family.Body
    val l = CssLayout.build(s.text, family, s.size, s.weight, s.lineHeight, (s.width * d).toInt(), d)
    val lines = (0 until l.lineCount).map { i ->
        val top = l.getLineTop(i).toFloat()
        TypeMeasurement.Line(
            start = l.getLineStart(i),
            text = s.text.substring(l.getLineStart(i), l.getLineEnd(i)),
            top = top / d,
            height = (l.getLineBottom(i) - top) / d,
            baseline = (l.getLineBaseline(i) - top) / d,
        )
    }
    return TypeMeasurement(s.id, "android-css", AppFonts.useBundledCJK, lines, l.height / d)
}

@Composable
fun TypeLab(autorun: Boolean) {
    var bundled by remember { mutableStateOf(true) }
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current

    LaunchedEffect(autorun) {
        if (!autorun) return@LaunchedEffect
        for (b in listOf(true, false)) {
            AppFonts.useBundledCJK = b
            for (s in TypeSample.all) {
                Log.i("S5", "S5RESULT " + Json.encodeToString(TypeMeasurement.serializer(), measure(measurer, s, density)))
                Log.i("S5", "S5RESULT " + Json.encodeToString(TypeMeasurement.serializer(), measureCss(s, density)))
            }
        }
        AppFonts.useBundledCJK = true
        // Diagnostics: a Latin-only heading, and the font metrics Android reports.
        val latin = TypeSample("latinHeading", "After the Rain, and the Quiet", true, 28f, 700, 1.25f, 335f)
        Log.i("S5", "S5DEBUG " + Json.encodeToString(TypeMeasurement.serializer(), measure(measurer, latin, density)))
        val hw = measurer.measure("雨停的時候", AppFonts.style(AppFonts.Family.Handwritten, 22f), density = density)
        Log.i("S5", "S5DEBUG handwritten size=${hw.size} lines=${hw.lineCount}")
        for ((fam, w) in listOf(AppFonts.Family.Heading to 700, AppFonts.Family.Body to 400, AppFonts.Family.Handwritten to 400)) {
            val p = android.graphics.Paint().apply { textSize = 100f; typeface = AppFonts.typeface(fam, w) }
            val fm = p.fontMetrics
            Log.i("S5", "S5DEBUG metrics $fam composite ascent=${fm.ascent} descent=${fm.descent} top=${fm.top} bottom=${fm.bottom} width=${p.measureText("雨停的時候")}")
        }
        Log.i("S5", "S5FONTREG ms=%.1f".format(AppFonts.registrationMs))
    }

    Column(
        Modifier.fillMaxSize().background(Tokens.Cream).safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Bundled Noto TC (off = system Noto CJK)", Modifier.weight(1f))
            Switch(bundled, { bundled = it; AppFonts.useBundledCJK = it })
        }
        Text("Font setup: %.0f ms".format(AppFonts.registrationMs), color = Tokens.TextMuted)
        key(bundled) {
            TypeSample.all.forEach { s ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${s.id} · ${s.size.toInt()}sp · line-height ${s.lineHeight}", color = Tokens.TextMuted)
                    val m = remember(s) { measureCss(s, density) }
                    Box(
                        Modifier.width(s.width.dp).drawWithContent {
                            drawContent()
                            // Red ticks at each measured line top — compare with the web page's.
                            m.lines.forEach { l ->
                                val y = l.top * density.density
                                drawLine(Color.Red.copy(alpha = 0.35f), Offset(-8.dp.toPx(), y), Offset(-2.dp.toPx(), y), 1.dp.toPx())
                            }
                        },
                    ) {
                        CssText(s.text, if (s.heading) AppFonts.Family.Heading else AppFonts.Family.Body, s.size, s.weight, s.lineHeight)
                    }
                }
            }
            Text("Handwritten (陳宇落雁):", color = Tokens.TextMuted)
            BasicText("雨停的時候，巷口的積水映出整排路燈。", style = AppFonts.style(AppFonts.Family.Handwritten, 22f))
        }
    }
}
