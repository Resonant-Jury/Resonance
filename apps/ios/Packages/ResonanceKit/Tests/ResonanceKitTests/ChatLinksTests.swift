import Foundation
import Testing
@testable import ResonanceKit

@Suite struct ChatLinksTests {
    private func texts(_ s: String) -> [String] { ChatLinks.links(in: s).map(\.text) }

    @Test func findsHttpAndWwwLinksAndNormalizesThem() {
        let links = ChatLinks.links(in: "see https://Example.com/a?b=1 and www.example.org now")
        #expect(links.map(\.url.absoluteString) == ["https://example.com/a?b=1", "https://www.example.org/"])
        #expect(links.map(\.text) == ["https://Example.com/a?b=1", "www.example.org"])
    }

    @Test func leavesPunctuationAndUnbalancedParenOut() {
        #expect(texts("(https://example.com/x)") == ["https://example.com/x"])
        #expect(texts("https://en.wikipedia.org/wiki/A_(b) ok") == ["https://en.wikipedia.org/wiki/A_(b)"])
        #expect(texts("go to https://example.com!?") == ["https://example.com"])
    }

    @Test func followsTheServersRulesAroundChineseText() {
        // The host is ASCII, so Chinese straight after it ends the link; a path may hold CJK letters,
        // and CJK punctuation ends it (url.ts `findLinks`).
        #expect(texts("看這個https://example.com很好") == ["https://example.com"])
        #expect(texts("https://zh.wikipedia.org/wiki/共振，很有趣") == ["https://zh.wikipedia.org/wiki/共振"])
        #expect(texts("（https://example.com/a）") == ["https://example.com/a"])
        // Ranges count UTF-16 units, so they line up with an NSAttributedString.
        let link = ChatLinks.links(in: "看這個 https://example.com/x")[0]
        #expect(link.range == NSRange(location: 4, length: 21))
    }

    @Test func neverLinksOtherSchemesNorRiskyAddresses() {
        #expect(texts("javascript:alert(1) data:text/html,hi file:///etc/passwd ftp://example.com").isEmpty)
        #expect(texts("http://user@example.com/").isEmpty)
        #expect(texts("https://bank.com@evil.com/login").isEmpty)
        #expect(texts("https://example.com:8443/").isEmpty)
        #expect(texts("http://localhost/").isEmpty)
        #expect(texts("https://example.com/" + String(repeating: "a", count: 2100)).isEmpty)
        #expect(ChatLinks.links(in: "https://example.com:443/ok")[0].url.absoluteString == "https://example.com/ok")
    }

    @Test func doesNotStartInTheMiddleOfAWord() {
        #expect(texts("foowww.example.com").isEmpty)
        #expect(texts("me@www.example.com").isEmpty)
    }

    @Test func flagsIPAddressesAndPunycodeAsSuspicious() {
        #expect(ChatLinks.links(in: "http://192.168.0.1/admin")[0].suspicious)
        #expect(ChatLinks.links(in: "https://xn--pple-43d.com/")[0].suspicious)
        #expect(!ChatLinks.links(in: "https://example.com/")[0].suspicious)
        #expect(!ChatLinks.links(in: "https://2130706433.example.com/")[0].suspicious)
    }

    @Test func aPreviewPictureComesOnlyFromTheSitesOwnRoute() {
        let origin = URL(string: "https://resonance.channel")!
        #expect(ChatLinks.previewImage("/api/link-image?u=a&s=b", origin: origin)?.absoluteString == "https://resonance.channel/api/link-image?u=a&s=b")
        #expect(ChatLinks.previewImage("https://evil.test/p.png", origin: origin) == nil)
        #expect(ChatLinks.previewImage("//evil.test/api/link-image?u=a", origin: origin) == nil)
        #expect(ChatLinks.previewImage(nil, origin: origin) == nil)
    }
}
