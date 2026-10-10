import Foundation
import Testing
@testable import Resonance

/// A thought-map node's excerpt follows the one rule the server and the web share
/// (src/lib/markdown/plainText.ts and its test, case for case): the Markdown stripped, every bare
/// address the link rules find left out — nothing else — and the cut made between code points.
@MainActor @Suite struct StoryProseTests {
    @Test func anAddressGoesTheSentencesPunctuationStays() {
        #expect(StoryProse.withoutLinks("我很喜歡 https://example.com，因為它很好。") == "我很喜歡，因為它很好。")
        #expect(StoryProse.withoutLinks("他說「https://example.com/x」很好") == "他說「」很好")
        #expect(StoryProse.withoutLinks("see https://example.com/x, then home (or www.example.org).") == "see, then home (or).")
        #expect(StoryProse.withoutLinks("看看https://example.com很棒") == "看看很棒")
    }

    @Test func whatTheLinkRulesDontReadAsALinkStays() {
        #expect(StoryProse.withoutLinks("寫信到 foo@www.example.com 就好") == "寫信到 foo@www.example.com 就好")
        #expect(StoryProse.withoutLinks("local http://localhost:3000/x and xhttps://example.com")
            == "local http://localhost:3000/x and xhttps://example.com")
    }

    @Test func anAutolinksBracketsGoWithItAndALinksOwnParentheses() {
        #expect(StoryProse.withoutLinks("九份：<https://www.taipei-101.com.tw/tw/> 還有") == "九份： 還有")
        #expect(StoryProse.withoutLinks("a <https://example.com b") == "a < b")
        #expect(StoryProse.withoutLinks("(see https://en.wikipedia.org/wiki/Jiufen_(town))") == "(see)")
    }

    @Test func markdownGoesDownToProseTheAddressesBeforeTheEmphasisMarks() {
        let md = [
            "# Title", "", "> a quote https://developer.mozilla.org/en-US/docs/Web/HTML", "",
            "- https://example.com/a_b~c*d",
            "- Some **bold** and _light_ text with a [link](https://x.y) and ![img](https://x.y/i.png).", "",
            "```js", "code(\"https://example.com\");", "```",
        ].joined(separator: "\n")
        #expect(StoryProse.plainText(md) == "Title a quote Some bold and light text with a link and .")
    }

    @Test func snakeCaseKeepsItsUnderscoresAndEmphasisAtAWordsEdgeGoes() {
        #expect(StoryProse.plainText("__bold__ and snake_case_name, _light_") == "bold and snake_case_name, light")
    }

    /// plainText.test.ts, case for case: what the editor stores for text typed with <, > and &
    /// and Markdown's own marks reads as that text, never as syntax.
    @Test func referencesAndEscapesReadAsTheTextTheyStandFor() {
        #expect(StoryProse.plainText("A -&gt; B &amp; C &lt;3") == "A -> B & C <3")
        #expect(StoryProse.plainText("&lt;b&gt;不是 HTML&lt;/b&gt;") == "<b>不是 HTML</b>")
        #expect(StoryProse.plainText("\\*不是粗體\\*，1\\. 不是清單，\\# 不是標題，a_b_c。") == "*不是粗體*，1. 不是清單，# 不是標題，a_b_c。")
        #expect(StoryProse.plainText("\\# 開頭不是標題\n\n1\\. 開頭不是清單\n\n\\- 開頭不是項目\n\n&gt; 開頭不是引用")
            == "# 開頭不是標題 1. 開頭不是清單 - 開頭不是項目 > 開頭不是引用")
        // Decoded once, numeric ones too; an escaped & starts no reference; a name it doesn't know stays as written.
        #expect(StoryProse.plainText("&amp;gt; &#42;star&#x2A; &#x1F600; \\&amp; &unknown;") == "&gt; *star* 😀 &amp; &unknown;")
        // A hard break is a space; an escaped bracket makes no link; a reference in a link's text is read too.
        #expect(StoryProse.plainText("第一行\\\n第二行 \\[not a link\\](x) [Tom &amp; Jerry](https://example.com)")
            == "第一行 第二行 [not a link](x) Tom & Jerry")
        // The excerpt the thought map shows of `->` (the Android feed's `-&gt;`).
        #expect(plainExcerpt("我想 -&gt; 你") == "我想 -> 你")
    }

    @Test func anAddressWhoseTextHoldsAReferenceIsStillLeftOut() {
        #expect(StoryProse.plainText("see https://example.com/?a=1&amp;b=2, then &lt;https://example.org&gt; done") == "see, then done")
    }

    @Test func anyStoryTheRulesTakeReadsInAMoment() {
        // Each took many seconds before (a quadratic pattern), in every node showing the excerpt; the web's test asks 1 s, this one 2 (a busy simulator).
        for unit in ["[", "![", "[a](", "[](", "\n", " \n", "-\n", "\t\n\n"] {
            let story = String(repeating: unit, count: 200_000 / unit.count)
            let started = Date()
            _ = StoryProse.plainText(story)
            #expect(Date().timeIntervalSince(started) < 2, "\(unit.debugDescription)")
        }
        // Links, pictures, list markers and rules on their own lines read as before.
        #expect(StoryProse.plainText("a [link](https://x.y \"title\") b ![pic](https://x.y/p.png) c") == "a link b c")
        #expect(StoryProse.plainText("\n\n  - one\n\t* two\n\n   1. three\n\n  ---  \n\nend") == "one two three end")
    }

    @Test func aNodesPictureIsTheStorysFirstOnTheWebAndQuickToSayThereIsNone() {
        #expect(StoryProse.firstPicture("text ![rain](https://cdn.example.com/a.avif) and ![b](https://x.y/b.png)") == "https://cdn.example.com/a.avif")
        #expect(StoryProse.firstPicture("[a link](https://x.y) ![local](/p.png) ![](ftp://x.y/p.png)") == nil)
        let started = Date()
        #expect(StoryProse.firstPicture(String(repeating: "![", count: 100_000)) == nil)
        #expect(StoryProse.firstPicture(String(repeating: "![a](https://", count: 15_000)) == nil)
        #expect(Date().timeIntervalSince(started) < 2)
    }

    @Test func theCutFallsBetweenCodePointsNeverInsideAnEmoji() {
        #expect(StoryProse.excerpt(String(repeating: "a", count: 95) + "😀b", max: 96) == String(repeating: "a", count: 95) + "😀…")
        #expect(StoryProse.excerpt("short", max: 96) == "short")
        #expect(plainExcerpt("**九份**的雨 https://example.com/rain", max: 80) == "九份的雨")
    }
}
