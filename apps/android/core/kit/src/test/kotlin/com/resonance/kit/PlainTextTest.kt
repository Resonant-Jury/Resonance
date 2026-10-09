package com.resonance.kit

import com.resonance.kit.story.PlainText
import kotlin.test.assertEquals
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
