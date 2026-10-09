package com.resonance.design

import com.resonance.design.generated.Tokens
import com.resonance.geometry.PathCommand
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.abs

/**
 * The switch draws the web's shapes (ToggleSwitch.tsx's TOGGLE / toggleShapes): its track (filled
 * and inked on that one path) and its knob come out as the web drew them for the seeds the app uses —
 * native/fixtures/geometry.json, generated from the TypeScript — and it inks off and on as the web does.
 */
class ToggleTest {
    private val fixtures: JsonObject = Json.parseToJsonElement(File("../../../../native/fixtures/geometry.json").readText()).jsonObject

    /** The web's path for the case whose leading arguments are [args] and whose options include [options]. */
    private fun webPath(family: String, vararg args: Double, options: Map<String, Double>): String? =
        fixtures[family]!!.jsonArray.map { it.jsonObject }.firstOrNull { case ->
            val given = case["args"]!!.jsonArray
            val opts = given.getOrNull(args.size + if (family == "wobRect") 1 else 0) as? JsonObject
            args.indices.all { i -> (given[i] as? JsonPrimitive)?.let { abs(it.double - args[i]) < 1e-9 } == true } &&
                options.all { (k, v) -> (opts?.get(k) as? JsonPrimitive)?.let { abs(it.double - v) < 1e-9 } == true }
        }?.get("out")?.jsonPrimitive?.content

    private fun assertSameShape(web: String?, native: List<PathCommand>, label: String) {
        assertNotNull("$label: no fixture case", web)
        val numbers = Regex("-?\\d+(?:\\.\\d+)?(?:e-?\\d+)?").findAll(web!!).map { it.value.toDouble() }.toList()
        val letters = web.filter { it in "MLCQZ" }.toList()
        assertEquals("$label: commands", letters, native.map { it.letter })
        val got = native.flatMap { it.numbers.toList() }
        assertEquals("$label: coordinates", numbers.size, got.size)
        got.zip(numbers).forEach { (a, b) -> assertTrue("$label: $a vs $b", abs(a - b) <= 0.005) }
    }

    @Test fun theTrackAndTheKnobAreTheWebsForEverySeedTheAppUses() {
        // publish 57, report 91, the notification switches 83 and 89, the default 9.
        for (seed in listOf(9.0, 57.0, 83.0, 89.0, 91.0)) {
            val track = mapOf("curve" to 2.8, "cornerJitter" to 2.0, "cornerOffset" to 1.4)
            assertSameShape(webPath("wobRect", 50.0, 28.0, 12.5, seed, options = track), Toggle.trackPath(seed), "track $seed")
            val knob = mapOf("segments" to 6.0, "mag" to 1.0, "cpJitter" to 0.5)
            assertSameShape(webPath("wobCircle", 10.0, 10.0, 10.0, seed + 5, options = knob), Toggle.knobPath(seed), "knob $seed")
        }
    }

    @Test fun theKnobRestsFourInFromWhicheverEndItIsAt() {
        assertEquals(4.0, Toggle.knobX(checked = false), 0.0)
        assertEquals(26.0, Toggle.knobX(checked = true), 0.0)
    }

    @Test fun offIsASoftInkOnPaperAndOnIsDeepTerracottaOnTerracotta() {
        val off = Toggle.inks(checked = false)
        assertEquals(Tokens.CreamDark, off.fill)
        assertEquals(Tokens.TextMuted, off.ink)
        val on = Toggle.inks(checked = true)
        assertEquals(Tokens.Terracotta, on.fill)
        assertEquals(Tokens.TerracottaDeep, on.ink)
    }

    @Test fun disabledFadesLikeADisabledButton() {
        assertEquals(0.45f, Toggle.DISABLED_ALPHA, 0f)
    }
}
