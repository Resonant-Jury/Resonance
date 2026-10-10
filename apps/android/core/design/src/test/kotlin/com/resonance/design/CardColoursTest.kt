package com.resonance.design

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import java.io.File

/**
 * Every card list colours its cards as the web does (design note B3): native/fixtures/card-colours.json,
 * written from src/lib/design/cardColours.ts — the same hue table, the same order a clash moves in, the
 * same families for every case, a page appended recolouring nothing, and no card sharing a family with
 * the three before it (so no grid of one, two or three row-major columns shares one beside or above).
 */
class CardColoursTest {
    private val fixture: JsonObject = Json.parseToJsonElement(File("../../../../native/fixtures/card-colours.json").readText()).jsonObject

    private fun hues(case: JsonObject): List<Double?> =
        case["accentHues"]!!.jsonArray.map { if (it is JsonNull) null else it.jsonPrimitive.double }

    @Test
    fun tablesMatchTheWeb() {
        assertEquals(fixture["hues"]!!.jsonArray.map { it.jsonPrimitive.double }, CardPalette.HUES)
        assertEquals(fixture["window"]!!.jsonPrimitive.int, CardPalette.WINDOW)
        assertEquals(fixture["order"]!!.jsonArray.map { row -> row.jsonArray.map { it.jsonPrimitive.int } }, CardPalette.ORDER)
    }

    @Test
    fun everyCaseColoursAsTheWebDoes() {
        val cases = fixture["cases"]!!.jsonArray.map { it.jsonObject }
        for (case in cases) {
            val id = case["id"]!!.jsonPrimitive.content
            val expected = case["palettes"]!!.jsonArray.map { it.jsonPrimitive.int }
            val got = CardPalette.palettes(hues(case))
            assertEquals(id, expected, got)
            // The window: no card wears the family of any of the three before it.
            for (i in got.indices) for (j in maxOf(0, i - CardPalette.WINDOW) until i) assertNotEquals("$id: $j and $i", got[j], got[i])
            // Pages loaded one after another: each prefix colours as the whole list does.
            case["pages"]?.jsonArray?.map { it.jsonPrimitive.int }?.let { pages ->
                var end = 0
                for (size in pages) {
                    end += size
                    assertEquals("$id: first $end", expected.take(end), CardPalette.palettes(hues(case).take(end)))
                }
            }
            // As a grid filled row by row, no row and no column repeats a family between neighbours.
            for (n in 1..3) for (i in got.indices) {
                if (i % n != 0) assertNotEquals("$id ($n columns): $i beside", got[i - 1], got[i])
                if (i >= n) assertNotEquals("$id ($n columns): $i under", got[i - n], got[i])
            }
        }
    }

    @Test
    fun aListedCardWearsItsFamily() {
        // The palette built from a family is that family's, whatever the card's own preference was.
        val family = CardPalette.palettes(listOf(55.0, 55.0))[1]
        assertEquals(family, CardPalette.of(family).index)
        assertEquals(CardPalette.HUES[family], CardPalette.of(family).hue, 0.0)
        assertEquals(CardPalette(55.0, 1).index, CardPalette.preferred(55.0, 1))
    }
}
