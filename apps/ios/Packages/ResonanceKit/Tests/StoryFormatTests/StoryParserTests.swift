import Foundation
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

    @Test func escapedSyntaxAndHTMLStayText() {
        #expect(text(blocks("escapes")[0]) == "*不是粗體*，1. 不是清單，# 不是標題，a_b_c。")
        #expect(text(blocks("html-is-text")[0]) == "<b>不是 HTML</b> 與 <script>x</script>")
    }

    @Test func proseMarginsCollapseLikeCSS() {
        let gaps = ProseMetrics.gaps([.paragraph([]), .heading(level: 2, []), .paragraph([]), .blank, .paragraph([])])
        #expect(gaps.map { ($0 * 10).rounded() / 10 } == [0, 35.2, 13.2, 18.7, 0])
    }
}
