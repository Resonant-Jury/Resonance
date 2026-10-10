package com.resonance.kit

import com.resonance.kit.story.PlainText
import com.resonance.kit.text.Entities
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.Test

/**
 * The prose lists and previews show of a story, by the server's rules (src/lib/markdown/plainText.test.ts,
 * case for case, then summary.test.ts's excerpts): a bare address goes by the one link rule (what
 * Linkify reads as a link is left out, nothing else is), Markdown comes off, character references and
 * escapes read as the text they stand for, and the excerpt is cut between code points.
 */
class PlainTextTest {
    // withoutLinks

    @Test fun keepsTheWordsAndTheCjkPunctuationAfterAnAddressWithNoSpaceLeftBeforeThePunctuation() {
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

    // plainText

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
        assertEquals("bold and snake_case_name, light", PlainText.plainText("__bold__ and snake_case_name, _light_"))
    }

    @Test fun readsCharacterReferencesAndBackslashEscapesAsTheTextTheyStandForNeverAsSyntax() {
        // What the editor stores for text typed with <, >, & and Markdown's marks (native/fixtures/markdown-corpus.json).
        assertEquals("A -> B & C <3", PlainText.plainText("A -&gt; B &amp; C &lt;3"))
        assertEquals("<b>不是 HTML</b>", PlainText.plainText("&lt;b&gt;不是 HTML&lt;/b&gt;"))
        assertEquals("*不是粗體*，1. 不是清單，# 不是標題，a_b_c。", PlainText.plainText("\\*不是粗體\\*，1\\. 不是清單，\\# 不是標題，a_b_c。"))
        assertEquals(
            "# 開頭不是標題 1. 開頭不是清單 - 開頭不是項目 > 開頭不是引用",
            PlainText.plainText("\\# 開頭不是標題\n\n1\\. 開頭不是清單\n\n\\- 開頭不是項目\n\n&gt; 開頭不是引用"),
        )
        // Decoded once, numeric ones too; an escaped & starts no reference; a name it doesn't know stays as written.
        assertEquals("&gt; *star* 😀 &amp; &unknown;", PlainText.plainText("&amp;gt; &#42;star&#x2A; &#x1F600; \\&amp; &unknown;"))
        // A hard break is a space; an escaped bracket makes no link; a reference in a link's text is read too.
        assertEquals(
            "第一行 第二行 [not a link](x) Tom & Jerry",
            PlainText.plainText("第一行\\\n第二行 \\[not a link\\](x) [Tom &amp; Jerry](https://example.com)"),
        )
    }

    @Test fun stillLeavesOutAnAddressWhoseTextHoldsAReferenceAndItsAutolinkBrackets() {
        assertEquals("see, then done", PlainText.plainText("see https://example.com/?a=1&amp;b=2, then &lt;https://example.org&gt; done"))
    }

    @Test fun readsAnyStoryTheRulesTakeInAMomentNoRunOfBracketsOrBlankLinesIsReadAgainFromEachPlaceInIt() {
        // Each took seconds to minutes before (a quadratic pattern), in every node showing the excerpt; the web's test asks 1 s, this one 2 (a busy CI host).
        val floods = listOf("[", "![", "[a](", "[](", "\n", " \n", "-\n", "\t\n\n").map { it.repeat(200_000 / it.length) } +
            // A long run of spaces before the words in front of an address and its full stop (17 s once, on the server).
            listOf("a${" ".repeat(199_000)}b https://example.com.", "a${"\n".repeat(199_000)}b https://example.com.")
        for (story in floods) {
            val started = System.nanoTime()
            PlainText.plainText(story)
            val ms = (System.nanoTime() - started) / 1_000_000
            assertTrue(ms < 2_000, "${story.take(4).replace("\n", "\\n")} took $ms ms")
        }
        // Links, pictures, list markers and rules on their own lines read as before.
        assertEquals("a link b c", PlainText.plainText("a [link](https://x.y \"title\") b ![pic](https://x.y/p.png) c"))
        assertEquals("one two three end", PlainText.plainText("\n\n  - one\n\t* two\n\n   1. three\n\n  ---  \n\nend"))
    }

    /** What this port spells out to read as JavaScript does (PlainText's header): Java's and ICU's patterns differ. */
    @Test fun keepsTheEdgesAPortMustSpellOut() {
        // A run's bound counts UTF-16 units: 300 emoji are 600, past a link text's 500.
        val e300 = "😀".repeat(300)
        val e200 = "😀".repeat(200)
        assertEquals("[$e300](x) $e200", PlainText.plainText("[$e300](x) [$e200](x)"))
        // `\s` is every Unicode space, the BOM and the vertical tab; trim takes no other control character.
        assertEquals("a b c d e", PlainText.plainText("a\u000B b\uFEFF c\u3000d\u00A0e"))
        assertEquals("\u001Cx\u001C", PlainText.plainText("\u001Cx\u001C"))
        // A line ends at \n, \r, U+2028 and U+2029, never U+0085; a list's number is ASCII digits.
        assertEquals("a\u0085# b", PlainText.plainText("a\u0085# b"))
        assertEquals("a b c", PlainText.plainText("a\u2028# b\u2029> c"))
        assertEquals("heading quote item after", PlainText.plainText("# heading\r\n> quote\r\n- item\r\n  ---  \r\nafter"))
        assertEquals("１. full-width ٣. arabic", PlainText.plainText("１. full-width\n٣. arabic"))
        // A letter outside the BMP is a letter beside an underscore; two inside a word go one by one.
        assertEquals("𠀀_𠀀 x_𠀀 𠀀 𠀀", PlainText.plainText("𠀀_𠀀 x_𠀀 𠀀_ _𠀀"))
        assertEquals("ab snake_case init x", PlainText.plainText("a__b snake_case __init__ _x_"))
        // The private-use marks are dropped; fences go before escapes and references are read.
        assertEquals("stray and x", PlainText.plainText("stray \uE02A and \uE023 x"))
        assertEquals("\\ and ```x", PlainText.plainText("\\```code``` and &#96;&#96;&#96;x```"))
        assertEquals("`", PlainText.plainText("```&gt;``` \\```"))
        assertEquals("a](x)", PlainText.plainText("[a\\](x)](https://x.y)"))
        // A hard break after \r\n too; the server's table of names (looked up in lower case), invalid code points as U+FFFD.
        assertEquals("line next x\\ y", PlainText.plainText("line\\\r\nnext x\\\\\ny"))
        assertEquals(
            "x &divide; é § ¶ € £ y & A é &nbsp",
            PlainText.plainText("x &divide; &eacute; &sect; &para; &euro; &pound; &nbsp;y &AMP; &#X41; &Eacute; &nbsp"),
        )
        assertEquals("\uFFFD \uFFFD A \uFFFD", PlainText.plainText("&#xD800; &#1114112; &#0000065; &#x0;"))
    }

    // firstPicture

    @Test fun isTheAddressOfTheStorysFirstPictureOnTheWebAndQuickToSayThereIsNone() {
        assertEquals("https://cdn.example.com/a.avif", PlainText.firstPicture("text ![rain](https://cdn.example.com/a.avif) and ![b](https://x.y/b.png)"))
        assertNull(PlainText.firstPicture("[a link](https://x.y) ![local](/p.png) ![](ftp://x.y/p.png)"))
        // No space of any kind in the address, and its bound counts UTF-16 units (1500 emoji are 3000).
        assertEquals("https://x.y/c", PlainText.firstPicture("![a](https://x.y/a\u00A0b) ![b](https://x.y/c)"))
        assertEquals("https://x.y/c", PlainText.firstPicture("![a](https://x.y/${"😀".repeat(1500)}) ![b](https://x.y/c)"))
        val started = System.nanoTime()
        assertNull(PlainText.firstPicture("![".repeat(100_000)))
        assertNull(PlainText.firstPicture("![a](https://".repeat(15_000)))
        assertTrue((System.nanoTime() - started) / 1_000_000 < 2_000)
    }

    // excerpt

    @Test fun cutsBetweenCodePointsNeverInsideAnEmoji() {
        assertEquals("${"a".repeat(95)}😀…", PlainText.excerpt("${"a".repeat(95)}😀b"))
        assertEquals("short", PlainText.excerpt("short"))
    }

    // summary.test.ts: the excerpt the server stores beside a card, excerpt(plainText(story)).

    @Test fun leavesBareAddressesOutOfTheExcerptKeepingALinksWordsAndTheSentencesPunctuation() {
        val story = listOf(
            "收藏了很久的幾個網頁，終於回到熟悉的地方。",
            "",
            "https://en.wikipedia.org/wiki/Jiufen_(town)",
            "",
            "這篇寫的是九份：<https://www.taipei-101.com.tw/tw/> 還有 www.example.com/a_b~c。",
            "",
            "> https://developer.mozilla.org/en-US/docs/Web/HTML",
            "",
            "I [walked slowly](https://example.com/walk) — see https://example.com/x, then home (or www.example.org).",
        ).joinToString("\n")
        assertEquals(
            "收藏了很久的幾個網頁，終於回到熟悉的地方。 這篇寫的是九份： 還有。 I walked slowly — see, then home (or).",
            summary(story),
        )
    }

    @Test fun leavesOutExactlyWhatTheLinkRuleReadsAsALink() {
        assertEquals("我很喜歡，因為它很好。", summary("我很喜歡 https://example.com，因為它很好。"))
        assertEquals("他說「」很好", summary("他說「https://example.com/x」很好"))
        assertEquals("寫信到 foo@www.example.com 就好", summary("寫信到 foo@www.example.com 就好"))
    }

    @Test fun storesTheExcerptAReaderSeesArrowsAsWrittenAndNoEscapeBackslashes() {
        assertEquals("早上 -> 下午 & 晚上，*星號* 與 # 井號", summary("早上 -&gt; 下午 &amp; 晚上，\\*星號\\* 與 \\# 井號"))
    }

    private fun summary(story: String) = PlainText.excerpt(PlainText.plainText(story))

    // This app's own: the thought map's node, and what the editor writes.

    @Test fun readsTheEntitiesAndEscapesTheEditorWritesAsTheCharactersTheyStandFor() {
        assertEquals("<b>不是 HTML</b> 與 <script>x</script>", PlainText.plainText("&lt;b&gt;不是 HTML&lt;/b&gt; 與 &lt;script&gt;x&lt;/script&gt;"))
        assertEquals("*not emphasis* and [not a link](x) & 'quotes'", PlainText.plainText("\\*not emphasis\\* and \\[not a link\\](x) &amp; &#39;quotes&#x27;"))
        // Unknown names stay as written; a broken code point reads as the replacement character.
        assertEquals("&nosuch; \uFFFD", PlainText.plainText("&nosuch; &#0;"))
        assertEquals("C:\\path", PlainText.plainText("C:\\\\path"))
    }

    @Test fun aNodeShowsTheProseWithoutItsAddresses() {
        // The thought map's node: 80 code points (100 without a picture), the bare address gone.
        // As the web says them (the same inputs through lib/adapters/story's plainExcerpt).
        assertEquals("看了這篇，想起九份的雨", PlainText.plainExcerpt("看了這篇 https://en.wikipedia.org/wiki/Jiufen，想起**九份**的雨"))
        assertEquals("看了這篇 ，想起九份的雨", PlainText.plainExcerpt("看了這篇 https://en.wikipedia.org/wiki/Jiufen ，想起**九份**的雨"))
        assertEquals("我想 -> 你", PlainText.plainExcerpt("我想 -&gt; 你"))
        assertEquals("九份的雨", PlainText.plainExcerpt("**九份**的雨 https://example.com/rain"))
        assertEquals("${"字".repeat(80)}…", PlainText.plainExcerpt("字".repeat(120)))
    }

    /** The named references are the server's own table (src/lib/text/entities.ts's NAMED), name for name. */
    @Test fun knowsTheServersNamedReferencesAndNoOthers() {
        val source = File(System.getProperty("repoRoot"), "src/lib/text/entities.ts").readText()
        val table = source.substring(source.indexOf("const NAMED"), source.indexOf("};", source.indexOf("const NAMED")))
        val server = Regex("""([a-z]+): (['"])(.*?)\2""").findAll(table).associate { it.groupValues[1] to it.groupValues[3] }
        assertEquals(45, server.size)
        assertEquals(server, Entities.Named)
        assertEquals("&divide; ß", Entities.decode("&divide; &SZLIG;"))
    }
}
