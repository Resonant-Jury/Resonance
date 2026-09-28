package com.resonance.kit

import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.ProseMetrics
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryParser
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.math.roundToInt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** The reader's block rules against native/fixtures/markdown-corpus.json (same cases as iOS). */
class StoryParserTest {
    private val corpus: Map<String, String> = Json.parseToJsonElement(
        File(System.getProperty("repoRoot"), "native/fixtures/markdown-corpus.json").readText(),
    ).jsonObject["cases"]!!.jsonArray.associate {
        it.jsonObject["id"]!!.jsonPrimitive.content to it.jsonObject["canonical"]!!.jsonPrimitive.content
    }

    private fun blocks(id: String) = StoryParser.parse(corpus.getValue(id))
    private fun text(block: StoryBlock) = (block as StoryBlock.Paragraph).runs.joinToString("") { it.text }

    @Test fun aLoneCardLinkIsAnEmbeddedCard() {
        val b = blocks("card-embed")
        assertEquals(3, b.size)
        assertEquals(StoryBlock.CardEmbed("/card/a-walk-after-the-rain", "一場雨後的散步"), b[1])
    }

    @Test fun aCardLinkInsideASentenceStaysALink() {
        val p = blocks("card-link-mid-sentence").first() as StoryBlock.Paragraph
        assertEquals("見 一場雨後的散步 這張卡片。", p.runs.joinToString("") { it.text })
        assertTrue(p.runs.any { it.link == "/card/a-walk-after-the-rain" && it.text == "一場雨後的散步" })
    }

    @Test fun aLonePhotoIsAnImageBlock() {
        assertEquals(StoryBlock.Image("https://cdn.example.com/image/u1/rain.avif", "巷口的積水"), blocks("image-block")[1])
        assertEquals(StoryBlock.Image("https://cdn.example.com/x.avif", "alt"), blocks("image-then-text-no-gap").first())
    }

    @Test fun theBlankMarkerIsExtraSpace() {
        assertEquals(listOf(false, true, false), blocks("blank-paragraph").map { it == StoryBlock.Blank })
    }

    @Test fun headingsQuotesListsRulesAndCode() {
        assertEquals(3, (blocks("headings")[2] as StoryBlock.Heading).level)
        assertEquals(2, (blocks("blockquote").first() as StoryBlock.Quote).children.size)
        val lists = blocks("lists")
        assertEquals(false to 2, (lists[0] as StoryBlock.ListBlock).let { it.ordered to it.items.size })
        assertEquals(Triple(true, 1, 2), (lists[1] as StoryBlock.ListBlock).let { Triple(it.ordered, it.start, it.items.size) })
        assertEquals(StoryBlock.Rule, blocks("rule")[1])
        assertEquals(listOf<StoryBlock>(StoryBlock.CodeBlock("const a = 1;")), blocks("code-block"))
    }

    @Test fun inlineMarksAndBreaks() {
        val runs = (blocks("inline-marks").first() as StoryBlock.Paragraph).runs
        assertTrue(runs.contains(InlineRun("粗體", bold = true)))
        assertTrue(runs.contains(InlineRun("斜體", italic = true)))
        assertTrue(runs.contains(InlineRun("刪除線", strikethrough = true)))
        assertTrue(runs.any { it.text == "code" && it.code })
        assertEquals("第一行\n第二行", text(blocks("hard-break")[0]))
    }

    @Test fun escapedSyntaxAndHtmlStayText() {
        assertEquals("*不是粗體*，1. 不是清單，# 不是標題，a_b_c。", text(blocks("escapes")[0]))
        assertEquals("<b>不是 HTML</b> 與 <script>x</script>", text(blocks("html-is-text")[0]))
    }

    @Test fun proseMarginsCollapseLikeCss() {
        val gaps = ProseMetrics.gaps(listOf(StoryBlock.Paragraph(emptyList()), StoryBlock.Heading(2, emptyList()), StoryBlock.Paragraph(emptyList()), StoryBlock.Blank, StoryBlock.Paragraph(emptyList())))
        assertEquals(listOf(0.0, 35.2, 13.2, 18.7, 0.0), gaps.map { (it * 10).roundToInt() / 10.0 })
        assertIs<StoryBlock.Blank>(blocks("blank-paragraph")[1])
    }
}
