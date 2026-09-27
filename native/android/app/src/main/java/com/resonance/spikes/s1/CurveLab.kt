package com.resonance.spikes.s1

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.resonance.geometry.PathCommand
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobRect
import com.resonance.spikes.design.toPath
import com.resonance.spikes.generated.Tokens
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.min

/**
 * S1 Curve Lab — the web's own path (from the golden fixtures, i.e. what the
 * TypeScript produced) in red under the Kotlin port's path in ink. If the
 * port is right, no red shows. (The JVM tests check every case numerically.)
 */
private data class Case(val title: String, val web: String, val native: List<PathCommand>, val w: Float, val h: Float)

@Composable
fun CurveLab() {
    val context = LocalContext.current
    val cases = remember {
        val json = Json.parseToJsonElement(context.assets.open("geometry.json").bufferedReader().readText()).jsonObject
        json.getValue("wobRect").jsonArray.take(5).mapIndexed { i, c ->
            val a = c.jsonObject.getValue("args").jsonArray
            val o = a[5] as? JsonObject
            fun num(k: String) = (o?.get(k) as? JsonPrimitive)?.double
            fun seg(k: String): SegValue? = when (val v = o?.get(k)) {
                null, JsonNull -> null
                is JsonArray -> SegValue.Range(v[0].jsonPrimitive.double.toInt(), v[1].jsonPrimitive.double.toInt())
                else -> SegValue.Count(v.jsonPrimitive.double)
            }
            val w = a[0].jsonPrimitive.double
            val h = a[1].jsonPrimitive.double
            val mag = (a[4] as? JsonPrimitive)?.takeUnless { it is JsonNull }?.double
            val native = wobRect(w, h, a[2].jsonPrimitive.double, a[3].jsonPrimitive.double, mag,
                WobRectOptions(num("curve"), num("cornerJitter"), num("cornerOffset"), seg("segmentsH"), seg("segmentsV")))
            Case("wobRect #$i ${w.toInt()}×${h.toInt()}", c.jsonObject.getValue("out").jsonPrimitive.content, native,
                min(w, 340.0).toFloat(), min(h, 240.0).toFloat())
        }
    }
    LazyColumn(
        Modifier.fillMaxSize().background(Tokens.Cream).safeDrawingPadding().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item { Text("Red = web (TypeScript) · Ink = Kotlin port", color = Tokens.TextMuted) }
        items(cases) { c ->
            Text(c.title)
            Canvas(Modifier.padding(8.dp).size(c.w.dp, c.h.dp)) {
                val web = PathParser().parsePathString(c.web).toPath()
                scale(density, density, pivot = androidx.compose.ui.geometry.Offset.Zero) {
                    drawPath(web, Color.Red, style = Stroke(4f))
                }
                drawPath(c.native.toPath(density), Tokens.Text, style = Stroke(1.8f * density))
            }
        }
    }
}
