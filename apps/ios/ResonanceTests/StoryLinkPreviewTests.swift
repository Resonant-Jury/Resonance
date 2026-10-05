import Foundation
import ResonanceAPI
import ResonanceKit
import StoryFormat
import Testing
@testable import Resonance

/// A card page draws the story's standalone links as their pages' cards: the previews the server
/// read (`CardDetail.linkPreviews`) are found by each paragraph's key — the link as the link rules
/// normalize it — and a link without one stays the paragraph it is.
@MainActor @Suite struct StoryLinkPreviewTests {
    let origin = URL(string: "http://127.0.0.1:3300")!

    func page(story: String, previews: [Components.Schemas.LinkPreview]?) async -> CardModel {
        var sent = Fixture.detail(Fixture.card("c1"), story: story)
        sent.linkPreviews = previews
        let detail = sent
        let model = CardModel(key: "c1", origin: origin) { _ in detail }
        await model.load()
        return model
    }

    /// The paragraphs that stand alone as links, as the parser found them (address, words).
    func soleLinks(_ blocks: [StoryBlock]) -> [(href: String?, text: String)] {
        blocks.compactMap { if case let .soleLink(href, text, _) = $0 { (href, text) } else { nil } }
    }

    @Test func aLinkStandingAloneFindsThePageTheServerReadForIt() async throws {
        let model = await page(
            story: "前一段。\n\nhttps://Example.com/rain\n\n[一篇好文章](https://blog.example.com/post/42)\n\n看 https://example.com/inline 這篇。",
            previews: [
                .init(url: "https://example.com/rain", title: " 雨停了 ", description: "巷口的積水", siteName: "Example",
                      image: "/api/link-image?u=x&s=y"),
                .init(url: "https://blog.example.com/post/42", title: "一篇好文章", image: "https://tracker.example.net/pixel.gif"),
            ])
        let links = soleLinks(model.blocks)
        // The sentence with a link in it is no card, whatever is stored.
        #expect(links.count == 2)

        let bare = try #require(model.linkPreview(href: links[0].href, text: links[0].text))
        #expect(bare.title == "雨停了" && bare.description == "巷口的積水")
        #expect(bare.link.host == "example.com")
        // The picture is our image route's, on the API's origin.
        #expect(bare.imageURL?.absoluteString == "http://127.0.0.1:3300/api/link-image?u=x&s=y")

        let written = try #require(model.linkPreview(href: links[1].href, text: links[1].text))
        #expect(written.url.absoluteString == "https://blog.example.com/post/42")
        // Anything but our own image route is no picture of ours: nothing is requested for it.
        #expect(written.imageURL == nil)
    }

    @Test func aLinkWithoutAPreviewStaysAsItIsWritten() async {
        let model = await page(story: "https://example.com/unread\n\n<https://example.com/untitled>",
                               previews: [.init(url: "https://example.com/untitled", title: "  ")])
        // Not read (yet), or read without a title: no card.
        for link in soleLinks(model.blocks) { #expect(model.linkPreview(href: link.href, text: link.text) == nil) }
        #expect(soleLinks(model.blocks).count == 2)
    }

    @Test func anOlderServerSendsNoPreviewsAtAll() async {
        let model = await page(story: "https://example.com/rain", previews: nil)
        #expect(model.linkPreviews.isEmpty)
    }

    @Test func aLinkTheServerWritesDifferentlyStillFindsItsPage() async throws {
        // The server keys each page by the link as a browser writes it (`new URL(…).href`): an apostrophe in the
        // query encoded, dot segments resolved, an international host in punycode.
        let model = await page(
            story: "https://example.com/search?q=what's+up\n\nhttps://example.com/a/./b/../c\n\n[例子](https://例子.tw/x)",
            previews: [
                .init(url: "https://example.com/search?q=what%27s+up", title: "What's up"),
                .init(url: "https://example.com/a/c", title: "C"),
                .init(url: "https://xn--fsqu00a.tw/x", title: "例子"),
            ])
        let links = soleLinks(model.blocks)
        #expect(links.count == 3)
        #expect(links.compactMap { model.linkPreview(href: $0.href, text: $0.text)?.title } == ["What's up", "C", "例子"])
    }
}
