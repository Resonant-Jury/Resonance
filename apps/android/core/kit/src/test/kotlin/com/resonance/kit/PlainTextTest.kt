package com.resonance.kit

import com.resonance.kit.story.PlainText
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.Test

/**
 * The prose a thought-map node shows of a story, by the web's rules (src/lib/markdown/plainText.test.ts,
 * case for case): a bare address goes by the one link rule (what Linkify reads as a link is left out,
 * nothing else is), Markdown comes off, and the excerpt is cut between code points.
 */
class PlainTextTest {
    @Test fun keepsTheWordsAndTheCjkPunctuationAfterAnAddressWithNoSpaceLeftBeforeIt() {
        assertEquals("我很喜歡，因為它很好。", PlainText.withoutLinks("我很喜歡 https://example.com，因為它很好。"))
        assertEquals("他說「」很好", PlainText.withoutLinks("他說「https://example.com/x」很好"))
        assertEquals("see, then home (or).", PlainText.withoutLinks("see https://example.com/x, then home (or www.example.org)."))
        assertEquals("看看很棒", PlainText.withoutLinks("看看https://example.com很棒"))
    }

    @Test fun leavesAloneWhatTheLinkRuleDoesNotReadAsALink() {
        assertEquals("寫信到 foo@www.example.com 就好", PlainText.withoutLinks("寫信到 foo@www.example.com 就好"))
        assertEquals(
            "local http://localhost:3000/x and xhttps://example.com",
            PlainText.withoutLinks("local http://localhost:3000/x and xhttps://example.com"),
        )
    }

    @Test fun takesAnAutolinksAngleBracketsWithItAndALinksOwnBalancedParentheses() {
        assertEquals("九份： 還有", PlainText.withoutLinks("九份：<https://www.taipei-101.com.tw/tw/> 還有"))
        assertEquals("a < b", PlainText.withoutLinks("a <https://example.com b"))
        assertEquals("(see)", PlainText.withoutLinks("(see https://en.wikipedia.org/wiki/Jiufen_(town))"))
    }

    @Test fun stripsMarkdownDownToProseAndLeavesTheAddressesOutBeforeTheEmphasisMarksGo() {
        val md = listOf(
            "# Title",
            "",
            "> a quote https://developer.mozilla.org/en-US/docs/Web/HTML",
            "",
            "- https://example.com/a_b~c*d",
            "- Some **bold** and _light_ text with a [link](https://x.y) and ![img](https://x.y/i.png).",
            "",
            "```js",
            "code(\"https://example.com\");",
            "```",
        ).joinToString("\n")
        assertEquals("Title a quote Some bold and light text with a link and .", PlainText.plainText(md))
    }

    @Test fun readsTheEntitiesAndEscapesTheEditorWritesAsTheCharactersTheyStandFor() {
        // A story written with "->" is stored "-&gt;" (the excerpt once showed the entity itself).
        assertEquals("A -> B", PlainText.plainText("A -&gt; B"))
        assertEquals("<b>不是 HTML</b> 與 <script>x</script>", PlainText.plainText("&lt;b&gt;不是 HTML&lt;/b&gt; 與 &lt;script&gt;x&lt;/script&gt;"))
        // What only looks like syntax stays the writer's characters, never stripped as a heading, list or quote.
        assertEquals(
            "# 開頭不是標題 1. 開頭不是清單 - 開頭不是項目 > 開頭不是引用",
            PlainText.plainText("\\# 開頭不是標題\n\n1\\. 開頭不是清單\n\n\\- 開頭不是項目\n\n&gt; 開頭不是引用"),
        )
        assertEquals("*not emphasis* and [not a link](x) & 'quotes'", PlainText.plainText("\\*not emphasis\\* and \\[not a link\\](x) &amp; &#39;quotes&#x27;"))
        // Unknown names stay as written; a broken code point reads as the replacement character.
        assertEquals("&nosuch; \uFFFD", PlainText.plainText("&nosuch; &#0;"))
        assertEquals("C:\\path", PlainText.plainText("C:\\\\path"))
    }

    @Test fun readsAnyStoryTheRulesTakeInAMoment() {
        // Each took many seconds before (a quadratic pattern), in every node showing the excerpt; the web's test asks 1 s, this one 2 (a busy CI host).
        for (unit in listOf("[", "![", "[a](", "[](", "\n", " \n", "-\n", "\t\n\n")) {
            val story = unit.repeat(200_000 / unit.length)
            val started = System.nanoTime()
            PlainText.plainText(story)
            val ms = (System.nanoTime() - started) / 1_000_000
            assertTrue(ms < 2_000, "${unit.replace("\n", "\\n")} took $ms ms")
        }
        // Links, pictures, list markers and rules on their own lines read as before.
        assertEquals("a link b c", PlainText.plainText("a [link](https://x.y \"title\") b ![pic](https://x.y/p.png) c"))
        assertEquals("one two three end", PlainText.plainText("\n\n  - one\n\t* two\n\n   1. three\n\n  ---  \n\nend"))
    }

    @Test fun aNodesPictureIsTheStorysFirstOnTheWebAndQuickToSayThereIsNone() {
        assertEquals("https://cdn.example.com/a.avif", PlainText.firstPicture("text ![rain](https://cdn.example.com/a.avif) and ![b](https://x.y/b.png)"))
        assertNull(PlainText.firstPicture("[a link](https://x.y) ![local](/p.png) ![](ftp://x.y/p.png)"))
        val started = System.nanoTime()
        assertNull(PlainText.firstPicture("![".repeat(100_000)))
        assertNull(PlainText.firstPicture("![a](https://".repeat(15_000)))
        assertTrue((System.nanoTime() - started) / 1_000_000 < 2_000)
    }

    @Test fun cutsBetweenCodePointsNeverInsideAnEmoji() {
        assertEquals("${"a".repeat(95)}😀…", PlainText.excerpt("${"a".repeat(95)}😀b"))
        assertEquals("short", PlainText.excerpt("short"))
    }

    @Test fun aNodeShowsTheProseWithoutItsAddresses() {
        // The thought map's node: 80 code points (100 without a picture), the bare address gone.
        // As the web says them (the same inputs through lib/adapters/story's plainExcerpt).
        assertEquals("看了這篇，想起九份的雨", PlainText.plainExcerpt("看了這篇 https://en.wikipedia.org/wiki/Jiufen，想起**九份**的雨"))
        assertEquals("看了這篇 ，想起九份的雨", PlainText.plainExcerpt("看了這篇 https://en.wikipedia.org/wiki/Jiufen ，想起**九份**的雨"))
        assertEquals("${"字".repeat(80)}…", PlainText.plainExcerpt("字".repeat(120)))
    }
}
