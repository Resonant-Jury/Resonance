package com.resonance.kit

import com.resonance.api.models.LinkPreview as ApiLinkPreview
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.ProseMetrics
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryLinks
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
import kotlin.test.assertNull
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

    // Standalone links (native/fixtures/story-link-cards.json, the server's and the web's own cases)

    private class LinkCase(val id: String, val markdown: String, val soleLinks: List<String>, val inline: List<String>)

    private val linkCases: List<LinkCase> = Json.parseToJsonElement(
        File(System.getProperty("repoRoot"), "native/fixtures/story-link-cards.json").readText(),
    ).jsonObject["cases"]!!.jsonArray.map { c ->
        val o = c.jsonObject
        fun list(name: String) = o[name]?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty()
        LinkCase(o["id"]!!.jsonPrimitive.content, o["markdown"]!!.jsonPrimitive.content, list("soleLinks"), list("inline"))
    }

    /** Every block of the story, in reading order: inside quotes and list items too. */
    private fun flatten(blocks: List<StoryBlock>): List<StoryBlock> = blocks.flatMap { b ->
        when (b) {
            is StoryBlock.Quote -> listOf(b) + flatten(b.children)
            is StoryBlock.ListBlock -> listOf(b) + b.items.flatMap(::flatten)
            else -> listOf(b)
        }
    }

    private fun runsOf(block: StoryBlock): List<InlineRun> = when (block) {
        is StoryBlock.Paragraph -> block.runs
        is StoryBlock.SoleLink -> block.runs
        else -> emptyList()
    }

    @Test fun everyStandaloneLinkOfTheSharedCasesIsFoundUnderTheServersKey() {
        assertTrue(linkCases.size >= 20)
        for (case in linkCases) {
            val found = flatten(StoryParser.parse(case.markdown)).filterIsInstance<StoryBlock.SoleLink>().map { it.key }
            assertEquals(case.soleLinks, found, case.id)
        }
    }

    @Test fun aLinkInsideASentenceStaysALinkInTheLine() {
        for (case in linkCases.filter { it.inline.isNotEmpty() }) {
            val blocks = flatten(StoryParser.parse(case.markdown))
            assertTrue(blocks.none { it is StoryBlock.SoleLink }, case.id)
            // Still the paragraph it was, its words all there (a link written in it stays tappable where the reader allows).
            assertTrue(blocks.any { it is StoryBlock.Paragraph }, case.id)
        }
    }

    @Test fun aStandaloneLinkKeepsItsWordsForWhenThereIsNoPreview() {
        val block = StoryParser.parse("前一段。\n\n[一篇好文章](https://blog.example.com/post/42)\n\n後一段。")[1]
        assertIs<StoryBlock.SoleLink>(block)
        assertEquals(listOf(InlineRun("一篇好文章", link = "https://blog.example.com/post/42")), runsOf(block))
        val bare = StoryParser.parse("https://example.com/rain").single()
        assertEquals(StoryBlock.SoleLink("https://example.com/rain", listOf(InlineRun("https://example.com/rain"))), bare)
    }

    @Test fun anAddressInDisguiseIsReadAsTheDottedFourABrowserReads() {
        assertEquals("127.0.0.1", StoryLinks.dottedQuad("127.1"))
        assertEquals("127.0.0.1", StoryLinks.dottedQuad("0x7f.1"))
        assertEquals("127.0.0.1", StoryLinks.dottedQuad("2130706433"))
        assertEquals("10.0.0.8", StoryLinks.dottedQuad("012.0.0.010"))
        assertEquals("1.2.3.4", StoryLinks.dottedQuad("1.2.3.4."))
        assertNull(StoryLinks.dottedQuad("256.1.1.1"))
        assertNull(StoryLinks.dottedQuad("1.2.3.4.5"))
        assertNull(StoryLinks.dottedQuad("4294967296"))
        assertNull(StoryLinks.dottedQuad("example.com"))
        assertEquals("https://127.0.0.1/x", StoryLinks.keyOf("https://127.1/x"))
        // Only the scheme's own port, and never a name before the host.
        assertNull(StoryLinks.keyOf("https://example.com:8443/"))
        assertEquals("https://example.com/", StoryLinks.keyOf("https://example.com:443/"))
        assertNull(StoryLinks.keyOf("https://user@127.1/"))
        assertNull(StoryLinks.keyOf("www.example.com"))
    }

    @Test fun thePreviewsAreFoundByTheirAddressWithAPictureOnlyFromTheProxy() {
        val origin = "http://10.0.2.2:3300"
        val previews = StoryLinks.previews(
            listOf(
                ApiLinkPreview("https://en.wikipedia.org/wiki/Jiufen", " Jiufen - Wikipedia ", null, "Wikipedia", "/api/link-image?u=a&s=b"),
                // Not a picture of ours: drawn without one.
                ApiLinkPreview("https://example.com/a", "A", "", null, "https://evil.example/x.png"),
                // No title, or no address the app opens: not drawn at all.
                ApiLinkPreview("https://example.com/b", "  ", null, null, null),
                ApiLinkPreview("ftp://example.com/c", "C", null, null, null),
            ),
            origin,
        )
        assertEquals(listOf("https://en.wikipedia.org/wiki/Jiufen", "https://example.com/a"), previews.keys.toList())
        val jiufen = previews.getValue("https://en.wikipedia.org/wiki/Jiufen")
        assertEquals("Jiufen - Wikipedia", jiufen.title)
        assertEquals("$origin/api/link-image?u=a&s=b", jiufen.imageUrl)
        assertNull(previews.getValue("https://example.com/a").imageUrl)
        assertNull(previews.getValue("https://example.com/a").description)
        assertEquals(emptyMap(), StoryLinks.previews(null, origin))
    }
}
