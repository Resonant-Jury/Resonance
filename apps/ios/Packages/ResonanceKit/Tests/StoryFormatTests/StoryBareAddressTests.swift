import Foundation
import ResonanceKit
import StoryFormat
import Testing

/// A web address written bare in a story's words is a link, as the web's reader (GFM) makes one —
/// where the link rules (ChatLinks, the server's own) find one, and nowhere else.
@Suite struct StoryBareAddressTests {
    func linked(_ markdown: String) -> [StoryBlock] {
        StoryBlock.linkingAddresses(StoryParser.parse(markdown)) { text in
            ChatLinks.links(in: text).map { (range: $0.range, url: $0.url.absoluteString) }
        }
    }

    func runs(_ block: StoryBlock?) -> [InlineRun] {
        switch block {
        case let .paragraph(runs)?, let .soleLink(_, _, runs)?, let .heading(_, runs)?: runs
        default: []
        }
    }

    @Test func anAddressAloneWithoutItsPagesCardIsALink() {
        let blocks = linked("https://no-such-host.invalid/page")
        guard case let .soleLink(href, text, _) = blocks.first else { return #expect(Bool(false)) }
        // Still the paragraph a page's card would stand for, keyed as before.
        #expect(href == nil && text == "https://no-such-host.invalid/page")
        #expect(runs(blocks.first) == [InlineRun("https://no-such-host.invalid/page", link: "https://no-such-host.invalid/page")])
    }

    @Test func anAddressInASentenceIsALinkInIt() {
        #expect(runs(linked("參考 https://example.com/inline-bare 這篇。").first) == [
            InlineRun("參考 "), InlineRun("https://example.com/inline-bare", link: "https://example.com/inline-bare"), InlineRun(" 這篇。"),
        ])
        // The rules' ends: CJK after the host, sentence punctuation, an unbalanced bracket.
        #expect(runs(linked("https://example.com很棒").first) == [InlineRun("https://example.com", link: "https://example.com/"), InlineRun("很棒")])
        #expect(runs(linked("(見 www.example.org/notes)。").first) == [
            InlineRun("(見 "), InlineRun("www.example.org/notes", link: "https://www.example.org/notes"), InlineRun(")。"),
        ])
        // Marks on the address stay with it; an address CommonMark breaks at an underscore is still one.
        #expect(runs(linked("**https://example.com/bold**").first) == [InlineRun("https://example.com/bold", bold: true, link: "https://example.com/bold")])
        #expect(runs(linked("https://example.com/f_(x)_y").first).map(\.link) == ["https://example.com/f_(x)_y"])
    }

    @Test func whatTheRulesRefuseOrAlreadyLinkStaysAsItIs() {
        #expect(runs(linked("http://localhost:3000/x 與 https://user@example.com/").first).allSatisfy { $0.link == nil })
        #expect(runs(linked("`https://example.com/code`").first) == [InlineRun("https://example.com/code", code: true)])
        #expect(runs(linked("[這篇](https://example.com/a) https://example.com/b").first).map(\.link)
            == ["https://example.com/a", nil, "https://example.com/b"])
        // In quotes and lists too.
        guard case let .quote(children) = linked("> https://example.com/q").first else { return #expect(Bool(false)) }
        #expect(runs(children.first).map(\.link) == ["https://example.com/q"])
    }
}
