import Foundation
import ResonanceKit
import Testing
@testable import StoryFormat

/// The reader's block rules against the shared Markdown corpus
/// (native/fixtures/markdown-corpus.json — the storage format the web editor
/// and the apps' editor island are pinned to).
@Suite struct StoryParserTests {
    struct Case: Decodable { let id: String; let canonical: String }
    static let corpus: [String: String] = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../../../native/fixtures/markdown-corpus.json").standardized
        struct File: Decodable { let cases: [Case] }
        let file = try! JSONDecoder().decode(File.self, from: Data(contentsOf: url))
        return Dictionary(uniqueKeysWithValues: file.cases.map { ($0.id, $0.canonical) })
    }()

    func blocks(_ id: String) -> [StoryBlock] { StoryParser.parse(Self.corpus[id]!) }

    func text(_ block: StoryBlock) -> String? {
        if case let .paragraph(runs) = block { return runs.map(\.text).joined() }
        return nil
    }

    @Test func aLoneCardLinkIsAnEmbeddedCard() {
        let b = blocks("card-embed")
        #expect(b.count == 3)
        #expect(b[1] == .cardEmbed(href: "/card/a-walk-after-the-rain", title: "一場雨後的散步"))
    }

    @Test func aCardLinkInsideASentenceStaysALink() {
        guard case let .paragraph(runs) = blocks("card-link-mid-sentence").first else { return #expect(Bool(false)) }
        #expect(runs.map(\.text).joined() == "見 一場雨後的散步 這張卡片。")
        #expect(runs.contains { $0.link == "/card/a-walk-after-the-rain" && $0.text == "一場雨後的散步" })
    }

    @Test func aLonePhotoIsAnImageBlock() {
        #expect(blocks("image-block")[1] == .image(url: "https://cdn.example.com/image/u1/rain.avif", alt: "巷口的積水"))
        #expect(blocks("image-then-text-no-gap").first == .image(url: "https://cdn.example.com/x.avif", alt: "alt"))
    }

    @Test func theBlankMarkerIsExtraSpace() {
        #expect(blocks("blank-paragraph").map { $0 == .blank } == [false, true, false])
    }

    @Test func headingsQuotesListsRulesAndCode() {
        let h = blocks("headings")
        #expect(h[0].headingText == "那年夏天")
        guard case .heading(3, _) = h[2] else { return #expect(Bool(false)) }
        guard case let .quote(inner) = blocks("blockquote").first else { return #expect(Bool(false)) }
        #expect(inner.count == 2)
        let lists = blocks("lists")
        guard case let .list(false, _, items) = lists[0], case let .list(true, 1, ordered) = lists[1] else { return #expect(Bool(false)) }
        #expect(items.count == 2 && ordered.count == 2)
        #expect(blocks("rule")[1] == .rule)
        #expect(blocks("code-block") == [.code("const a = 1;")])
    }

    @Test func inlineMarksAndBreaks() {
        guard case let .paragraph(runs) = blocks("inline-marks").first else { return #expect(Bool(false)) }
        #expect(runs.contains { $0.text == "粗體" && $0.bold })
        #expect(runs.contains { $0.text == "斜體" && $0.italic })
        #expect(runs.contains { $0.text == "刪除線" && $0.strikethrough })
        #expect(runs.contains { $0.text == "code" && $0.code })
        #expect(text(blocks("hard-break")[0]) == "第一行\n第二行")
    }

    @Test func punctuationStaysAsItIsWritten() {
        // No "smart" quotes, dashes or ellipses: the web and the server read the story as written.
        let written = #"她說 "晚安" 而且 it's -- fine... 'ok'"#
        guard case let .paragraph(runs) = StoryParser.parse(written).first else { return #expect(Bool(false)) }
        #expect(runs.map(\.text).joined() == written)
    }

    @Test func escapedSyntaxAndHTMLStayText() {
        #expect(text(blocks("escapes")[0]) == "*不是粗體*，1. 不是清單，# 不是標題，a_b_c。")
        #expect(text(blocks("html-is-text")[0]) == "<b>不是 HTML</b> 與 <script>x</script>")
    }

    // MARK: Standalone links (native/fixtures/story-link-cards.json)

    struct LinkCase: Decodable, CustomTestStringConvertible {
        let id: String
        let markdown: String
        let soleLinks: [String]
        let links: [String]
        let inline: [String]?
        var testDescription: String { id }
    }

    static let linkCases: [LinkCase] = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../../../native/fixtures/story-link-cards.json").standardized
        struct File: Decodable { let cases: [LinkCase] }
        return try! JSONDecoder().decode(File.self, from: Data(contentsOf: url)).cases
    }()

    /// An address in disguise (`https://127.1/x`, which a browser reads as 127.0.0.1) is no link
    /// to these rules (ChatLinks, as in a chat message), so its paragraph stays a paragraph. The
    /// server never unfurls an IP address at all, so no card can be missing for it.
    static let refusedHere: Set<String> = ["https://127.0.0.1/x"]

    /// The keys of the paragraphs that stand alone as links, in reading order (quotes and lists too).
    func soleLinkKeys(_ blocks: [StoryBlock]) -> [String] {
        blocks.flatMap { block -> [String] in
            switch block {
            case let .soleLink(href, text, _): StoryLinks.key(href: href, text: text).map { [$0] } ?? []
            case let .quote(children): soleLinkKeys(children)
            case let .list(_, _, items): items.flatMap(soleLinkKeys)
            default: []
            }
        }
    }

    @Test(arguments: linkCases)
    func everyStandaloneLinkOfTheSharedFixture(_ c: LinkCase) {
        let keys = soleLinkKeys(StoryParser.parse(c.markdown))
        #expect(keys == c.soleLinks.filter { !Self.refusedHere.contains($0) })
        // What the server would draw a card for is never one of those left out here.
        #expect(c.links.allSatisfy { !Self.refusedHere.contains($0) })
        for link in c.inline ?? [] { #expect(!keys.contains(link)) }
    }

    @Test func aLinkStandingAloneKeepsItsParagraphForWhenThereIsNoPreview() {
        let blocks = StoryParser.parse("前一段。\n\n[一篇好文章](https://blog.example.com/post/42)")
        guard case let .soleLink(href, text, runs) = blocks[1] else { return #expect(Bool(false)) }
        #expect(href == "https://blog.example.com/post/42" && text == "一篇好文章")
        #expect(runs == [InlineRun("一篇好文章", link: "https://blog.example.com/post/42")])
        // A bare address is words to CommonMark (the reader makes it a link: `StoryBlock.linkingAddresses`).
        guard case let .soleLink(nil, bare, bareRuns) = StoryParser.parse("https://example.com/rain").first else { return #expect(Bool(false)) }
        #expect(bare == "https://example.com/rain" && bareRuns.allSatisfy { $0.link == nil })
        // Words round a link, or marks on it, keep it in its sentence.
        #expect(StoryParser.parse("我讀了 [這篇](https://example.com/inline) 之後").first.map { if case .paragraph = $0 { true } else { false } } == true)
        #expect(StoryParser.parse("**https://example.com/bold**").first.map { if case .paragraph = $0 { true } else { false } } == true)
        // Spaced like a paragraph.
        #expect(ProseMetrics.margins(blocks[1]).bottom == ProseMetrics.margins(.paragraph([])).bottom)
        #expect(ProseMetrics.margins(blocks[1]).top == 0)
    }

    @Test func proseMarginsCollapseLikeCSS() {
        let gaps = ProseMetrics.gaps([.paragraph([]), .heading(level: 2, []), .paragraph([]), .blank, .paragraph([])])
        #expect(gaps.map { ($0 * 10).rounded() / 10 } == [0, 35.2, 13.2, 18.7, 0])
    }
}
