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

    @Test func theCutFallsBetweenCodePointsNeverInsideAnEmoji() {
        #expect(StoryProse.excerpt(String(repeating: "a", count: 95) + "😀b", max: 96) == String(repeating: "a", count: 95) + "😀…")
        #expect(StoryProse.excerpt("short", max: 96) == "short")
        #expect(plainExcerpt("**九份**的雨 https://example.com/rain", max: 80) == "九份的雨")
    }
}
