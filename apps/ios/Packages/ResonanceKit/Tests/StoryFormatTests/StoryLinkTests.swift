import Foundation
import Testing
@testable import StoryFormat

/// A story's links lead where their scheme says, and nowhere else: the site's
/// own pages into the app, other web pages into the in-app browser, mailto:
/// to Mail — any other scheme is plain text a stranger's story can't hand to
/// the system (the same cases as Android's StoryLinkTest).
@Suite struct StoryLinkTests {
    let origin = URL(string: "https://resonance-world.vercel.app")!
    func resolve(_ href: String) -> StoryLink? { StoryLink.resolve(href, origin: origin) }

    @Test func relativeLinksArePagesOfTheSite() {
        #expect(resolve("/card/a-walk") == .site(path: "/card/a-walk"))
        #expect(resolve("/zh-TW/u/bob") == .site(path: "/zh-TW/u/bob"))
        // Resolved from the card's page, as the web resolves them.
        #expect(resolve("another-walk") == .site(path: "/card/another-walk"))
        #expect(resolve("../u/bob") == .site(path: "/u/bob"))
        // The query stays (a note's reply link), the fragment goes.
        #expect(resolve("/messages/bob?note=n1&card=c1#end") == .site(path: "/messages/bob?note=n1&card=c1"))
    }

    @Test func theSitesOwnHostIsTheSiteWhateverItsScheme() {
        #expect(resolve("https://resonance-world.vercel.app/card/a-walk") == .site(path: "/card/a-walk"))
        #expect(resolve("http://Resonance-World.vercel.app/u/bob") == .site(path: "/u/bob"))
        #expect(resolve("https://resonance-world.vercel.app") == .site(path: "/"))
        #expect(resolve("//resonance-world.vercel.app/en/privacy") == .site(path: "/en/privacy"))
    }

    @Test func otherWebPagesOpenInTheBrowser() {
        #expect(resolve("https://example.com/a?b=1&c=2") == .web(URL(string: "https://example.com/a?b=1&c=2")!))
        #expect(resolve("HTTP://example.com/") == .web(URL(string: "HTTP://example.com/")!))
        #expect(resolve("//example.com/x") == .web(URL(string: "https://example.com/x")!))
        // Look-alikes of the site's host are someone else's.
        #expect(resolve("https://resonance-world.vercel.app.example.com/card/x")
            == .web(URL(string: "https://resonance-world.vercel.app.example.com/card/x")!))
        #expect(resolve("https://resonance-world.vercel.app@example.com/card/x")
            == .web(URL(string: "https://resonance-world.vercel.app@example.com/card/x")!))
    }

    @Test func mailtoWritesAMail() {
        // Opened as written — not rewritten into a page of the site.
        #expect(resolve("mailto:hello@example.com") == .mail(URL(string: "mailto:hello@example.com")!))
        #expect(resolve("MAILTO:hello@example.com?subject=Hi") == .mail(URL(string: "MAILTO:hello@example.com?subject=Hi")!))
        #expect(resolve("mailto:") == nil)
    }

    @Test(arguments: [
        "tel:+886912345678", "sms:+886912345678", "shortcuts://run-shortcut?name=x", "someapp://do/something",
        "intent://scan/#Intent;scheme=zxing;end", "javascript:alert(1)", "JavaScript:alert(1)", "java\tscript:alert(1)",
        " javascript:alert(1)", "data:text/html,<b>x</b>", "file:///etc/hosts", "facetime:bob@example.com",
        "itms-apps://apps.apple.com/app/id1", "http:no-host", "https://", "#section", "", "  ", "card:x",
    ])
    func everyOtherSchemeLeadsNowhere(_ href: String) {
        #expect(resolve(href) == nil)
        #expect(!StoryLink.isTappable(href))
    }

    @Test func theRestAreTappable() {
        #expect(StoryLink.isTappable("/card/a-walk"))
        #expect(StoryLink.isTappable("https://example.com"))
        #expect(StoryLink.isTappable("mailto:a@example.com"))
    }

    @Test func aLinkThatLeadsNowhereReadsAsPlainText() {
        guard case let .paragraph(runs) = StoryParser.parse("打給我 [這裡](tel:+886912345678)，或 [寫信](mailto:a@example.com)、看 [這篇](https://example.com)。").first
        else { return #expect(Bool(false)) }
        #expect(runs.map(\.text).joined() == "打給我 這裡，或 寫信、看 這篇。")
        #expect(runs.first { $0.text == "這裡" }?.link == nil)
        #expect(runs.first { $0.text == "寫信" }?.link == "mailto:a@example.com")
        #expect(runs.first { $0.text == "這篇" }?.link == "https://example.com")
        // Not even a card embed: a lone link to another app is a plain paragraph.
        guard case let .paragraph(lone) = StoryParser.parse("[開啟](shortcuts://run-shortcut?name=x)").first
        else { return #expect(Bool(false)) }
        #expect(lone.map(\.link) == [nil])
    }
}
