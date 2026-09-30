package com.resonance.geometry

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Every case in native/fixtures/geometry.json (generated from the TypeScript
 * in src/lib/design) must come out of the Kotlin port with the same commands
 * and every coordinate within `tolerance` — the web rounds to 0.01, so ±0.005
 * is exact parity.
 */
class FixtureParityTest {
    private val root: JsonObject = Json.parseToJsonElement(
        File("../../fixtures/geometry.json").readText(),
    ).jsonObject
    private val tolerance = root["tolerance"]!!.jsonPrimitive.double

    private fun cases(family: String) = root[family]!!.jsonArray.map {
        it.jsonObject["args"]!!.jsonArray to it.jsonObject["out"]!!
    }

    private val JsonElement.num get() = jsonPrimitive.double
    private val JsonElement?.optNum: Double?
        get() = if (this == null || this is JsonNull) null else jsonPrimitive.double
    private val JsonElement.obj: JsonObject? get() = this as? JsonObject

    private fun segValue(v: JsonElement?): SegValue? = when (v) {
        null, is JsonNull -> null
        is JsonArray -> SegValue.Range(v[0].jsonPrimitive.int, v[1].jsonPrimitive.int)
        else -> SegValue.Count(v.num)
    }

    /** Tokenise SVG path data the web produced into command letters + numbers. */
    private fun parseSvg(d: String): Pair<List<Char>, List<Double>> {
        val letters = mutableListOf<Char>()
        val numbers = mutableListOf<Double>()
        val token = StringBuilder()
        fun flush() {
            if (token.isNotEmpty()) { numbers += token.toString().toDouble(); token.clear() }
        }
        for (ch in d) when {
            ch in "MLCQZ" -> { flush(); letters += ch }
            ch == ' ' || ch == ',' -> flush()
            else -> token.append(ch)
        }
        flush()
        return letters to numbers
    }

    private class Worst { var value = 0.0 }

    private fun expectSame(native: List<PathCommand>, web: String, label: String, worst: Worst) {
        val (letters, numbers) = parseSvg(web)
        assertEquals(letters, native.map { it.letter }, "$label: command sequence")
        val got = native.flatMap { it.numbers.toList() }
        assertEquals(numbers.size, got.size, "$label: coordinate count")
        val err = got.zip(numbers).maxOfOrNull { (a, b) -> abs(a - b) } ?: 0.0
        worst.value = maxOf(worst.value, err)
        assertTrue(err <= tolerance, "$label: max deviation $err")
    }

    private fun expectClose(a: Double, b: Double, label: String, worst: Worst, tol: Double = tolerance) {
        val err = abs(a - b)
        worst.value = maxOf(worst.value, err)
        assertTrue(err <= tol, "$label: $a vs $b")
    }

    @Test fun prngSequencesAreIdentical() {
        for ((args, out) in cases("prng")) {
            val r = Prng(args[0].num)
            val expected = out.jsonArray.map { it.num }
            // Same IEEE-754 operations in the same order → bit-identical.
            assertEquals(expected, expected.map { r.next() }, "seed ${args[0]}")
        }
    }

    @Test fun seedFromStringMatchesUtf16AndInt32Wrap() {
        for ((args, out) in cases("seedFromString")) {
            assertEquals(out.jsonPrimitive.int, seedFromString(args[0].jsonPrimitive.content), "“${args[0]}”")
        }
    }

    @Test fun jsRound2FollowsToFixed() {
        // Values checked against (n).toFixed(2) in V8. True ties (odd/8) go away
        // from zero; 0.355 / 0.705 / 1.755 are just *below* the tie, where the
        // naive Math.round(n * 100) / 100 rounds up and toFixed doesn't.
        assertEquals(0.13, jsRound2(0.125))
        assertEquals(-0.13, jsRound2(-0.125))
        assertEquals(1.0, jsRound2(1.005))
        assertEquals(92.78, jsRound2(0.75 * 123.7))
        assertEquals(0.35, jsRound2(0.355))
        assertEquals(0.70, jsRound2(0.705))
        assertEquals(1.75, jsRound2(1.755))
    }

    @Test fun autoDefaults() {
        val worst = Worst()
        for ((args, out) in cases("wobAuto")) {
            val w = args[0].num
            val h = args[1].num
            val o = out.jsonObject
            assertEquals(o["segments"]!!.jsonPrimitive.int, autoSegments(w))
            expectClose(autoMag(w, h), o["mag"]!!.num, "autoMag", worst, 1e-12)
            expectClose(autoCurve(w, h), o["curve"]!!.num, "autoCurve", worst, 1e-12)
        }
    }

    @Test fun wobRectParity() {
        val worst = Worst()
        cases("wobRect").forEachIndexed { i, (a, out) ->
            val o = a[5].obj
            val options = WobRectOptions(
                curve = o?.get("curve").optNum,
                cornerJitter = o?.get("cornerJitter").optNum,
                cornerOffset = o?.get("cornerOffset").optNum,
                segmentsH = segValue(o?.get("segmentsH")),
                segmentsV = segValue(o?.get("segmentsV")),
            )
            val native = wobRect(a[0].num, a[1].num, a[2].num, a[3].num, a[4].optNum, options)
            expectSame(native, out.jsonPrimitive.content, "wobRect #$i", worst)
        }
        println("wobRect max deviation: ${worst.value}")
    }

    @Test fun wobCircleAndLoopParity() {
        val worst = Worst()
        cases("wobCircle").forEachIndexed { i, (a, out) ->
            val o = a[4].obj
            val options = WobCircleOptions(o?.get("segments").optNum?.toInt(), o?.get("mag").optNum, o?.get("cpJitter").optNum)
            expectSame(wobCircle(a[0].num, a[1].num, a[2].num, a[3].num, options), out.jsonPrimitive.content, "wobCircle #$i", worst)
        }
        cases("wobLoop").forEachIndexed { i, (a, out) ->
            val o = a[5].obj
            val options = WobLoopOptions(
                o?.get("segments").optNum?.toInt(), o?.get("mag").optNum, o?.get("cpJitter").optNum, o?.get("blend").optNum,
            )
            expectSame(wobLoop(a[0].num, a[1].num, a[2].num, a[3].num, a[4].num, options), out.jsonPrimitive.content, "wobLoop #$i", worst)
        }
        println("wobCircle/wobLoop max deviation: ${worst.value}")
    }

    @Test fun wobTabRectParity() {
        val worst = Worst()
        cases("wobTabRect").forEachIndexed { i, (a, out) ->
            val o = a[6].obj
            val options = WobTabRectOptions(o?.get("R").optNum, o?.get("tabR").optNum, o?.get("mag").optNum, o?.get("curve").optNum)
            val native = wobTabRect(a[0].num, a[1].num, a[2].num, a[3].num, a[4].num, a[5].num, options)
            expectSame(native, out.jsonPrimitive.content, "wobTabRect #$i", worst)
        }
        println("wobTabRect max deviation: ${worst.value}")
    }

    @Test fun wavyPathsParity() {
        val worst = Worst()
        cases("wavyLine").forEachIndexed { i, (a, out) ->
            expectSame(wavyLine(a[0].num, a[1].num, a[2].num, a[3].num.toInt()), out.jsonPrimitive.content, "wavyLine #$i", worst)
        }
        cases("penWave").forEachIndexed { i, (a, out) ->
            expectSame(penWave(a[0].num, a[1].num, a[2].num, a[3].num), out.jsonPrimitive.content, "penWave #$i", worst)
        }
        cases("wavyVertical").forEachIndexed { i, (a, out) ->
            expectSame(wavyVertical(a[0].num, a[1].num, a[2].num, a[3].num.toInt()), out.jsonPrimitive.content, "wavyVertical #$i", worst)
        }
        cases("wavyPoints").forEachIndexed { i, (a, out) ->
            val pts = wavyPoints(a[0].num, a[1].num, a[2].num, a[3].num, a[4].num.toInt())
            val expected = out.jsonObject["points"]!!.jsonArray.map { Pt(it.jsonArray[0].num, it.jsonArray[1].num) }
            assertEquals(expected.size, pts.size)
            pts.zip(expected).forEach { (p, e) ->
                expectClose(p.x, e.x, "wavyPoints #$i.x", worst, 1e-9)
                expectClose(p.y, e.y, "wavyPoints #$i.y", worst, 1e-9)
            }
            expectSame(pointsToBezier(pts), out.jsonObject["bezier"]!!.jsonPrimitive.content, "pointsToBezier #$i", worst)
        }
        println("wavy paths max deviation: ${worst.value}")
    }

    @Test fun thoughtMapEdgesParity() {
        val worst = Worst()
        fun rect(v: JsonElement) = v.jsonObject.let { Rect(it["x"]!!.num, it["y"]!!.num, it["w"]!!.num, it["h"]!!.num) }
        fun anchor(v: JsonElement) = v.jsonObject.let { EdgeAnchor(it["x"]!!.num, it["y"]!!.num, it["nx"]!!.num, it["ny"]!!.num) }
        cases("rectAnchor").forEachIndexed { i, (a, out) ->
            val t = a[1].jsonObject
            val got = rectAnchor(rect(a[0]), Pt(t["x"]!!.num, t["y"]!!.num))
            val e = anchor(out)
            listOf(got.x to e.x, got.y to e.y, got.nx to e.nx, got.ny to e.ny).forEach { (x, y) ->
                expectClose(x, y, "rectAnchor #$i", worst, 1e-9)
            }
        }
        cases("organicEdgePath").forEachIndexed { i, (a, out) ->
            val g = organicEdgePath(rect(a[0]), rect(a[1]), a[2].num)
            val o = out.jsonObject
            expectSame(g.path, o["d"]!!.jsonPrimitive.content, "organicEdgePath #$i", worst)
            val mid = o["mid"]!!.jsonObject
            expectClose(g.mid.x, mid["x"]!!.num, "edge mid.x #$i", worst)
            expectClose(g.mid.y, mid["y"]!!.num, "edge mid.y #$i", worst)
            expectClose(g.endAngle, o["endAngle"]!!.num, "edge angle #$i", worst, 1e-9)
            assertEquals(anchor(o["start"]!!), g.start)
        }
        cases("arrowHeadPath").forEachIndexed { i, (a, out) ->
            val tip = a[0].jsonObject
            val native = arrowHeadPath(Pt(tip["x"]!!.num, tip["y"]!!.num), a[1].num, a[2].num, a[3].num)
            expectSame(native, out.jsonPrimitive.content, "arrowHead #$i", worst)
        }
        println("thought-map edges max deviation: ${worst.value}")
    }

    @Test fun organicMenuRowsParity() {
        val worst = Worst()
        cases("rowMenu").forEachIndexed { i, (a, out) ->
            val w = a[0].num
            val h = a[1].num
            val count = a[2].num.toInt()
            val rowH = a[3].num
            val pad = a[4].num
            val amp = a[5].num
            val seed = a[6].num
            val boundaries = (0 until maxOf(0, count - 1)).map { k ->
                rowBoundary(rowH * (k + 1), w, seed + k * 7, amp, pad)
            }
            val o = out.jsonObject
            o["boundaries"]!!.jsonArray.forEachIndexed { k, e ->
                boundaries[k].zip(e.jsonArray).forEach { (p, q) ->
                    expectClose(p.x, q.jsonArray[0].num, "rowBoundary #$i.$k", worst, 1e-9)
                    expectClose(p.y, q.jsonArray[1].num, "rowBoundary #$i.$k", worst, 1e-9)
                }
            }
            o["dividers"]!!.jsonArray.forEachIndexed { k, d ->
                expectSame(dividerPath(boundaries[k]), d.jsonPrimitive.content, "divider #$i.$k", worst)
            }
            o["regions"]!!.jsonArray.forEachIndexed { k, d ->
                expectSame(rowRegion(k, count, boundaries, w, h, pad), d.jsonPrimitive.content, "region #$i.$k", worst)
            }
        }
        println("organic menu rows max deviation: ${worst.value}")
    }

    @Suppress("unused")
    private val JsonPrimitive.isNum get() = !isString
}
