import Foundation
import ResonanceKit
import Testing

/// A standalone link's key is the link as the server writes it — the URL Standard's `href`, which
/// is what `normalizeLink` (src/lib/links/url.ts) stores a page's preview under — so a link the web
/// draws as its page's card is one in the app too. Each expected key is what Node's `new URL(…).href`
/// gives for the input.
@Suite struct StoryLinkKeyTests {
    @Test(arguments: [
        // Each part keeps what the Standard keeps there, and encodes the rest.
        ("https://example.com/search?q=what's+up", "https://example.com/search?q=what%27s+up"),
        ("https://a.com/p?x={1}#{f}", "https://a.com/p?x={1}#{f}"),
        ("https://a.com/a|b[c]^d`e{f}?q=|[]^`{}#|[]^`{}'", "https://a.com/a|b[c]%5Ed%60e%7Bf%7D?q=|[]^`{}#|[]^%60{}'"),
        ("https://a.com/é?é#é", "https://a.com/%C3%A9?%C3%A9#%C3%A9"),
        ("https://zh.wikipedia.org/wiki/中文", "https://zh.wikipedia.org/wiki/%E4%B8%AD%E6%96%87"),
        ("https://a.com/a%zz?%41", "https://a.com/a%zz?%41"),
        ("https://a.com/~!$&()*+,;=:@", "https://a.com/~!$&()*+,;=:@"),
        ("https://a.com/x?~!$&()*+,;=:@/?", "https://a.com/x?~!$&()*+,;=:@/?"),
        ("https://a.com/x?y=1#z?w#v", "https://a.com/x?y=1#z?w#v"),
        // Dot segments, written either way.
        ("https://example.com/a/./b/../c", "https://example.com/a/c"),
        ("https://a.com/%2e/x/%2E%2e/y", "https://a.com/y"),
        ("https://a.com/a/b/..", "https://a.com/a/"),
        ("https://a.com/x/.", "https://a.com/x/"),
        ("https://a.com/..", "https://a.com/"),
        // Empty parts.
        ("https://a.com", "https://a.com/"),
        ("https://a.com?x", "https://a.com/?x"),
        ("https://a.com/?", "https://a.com/?"),
        ("https://a.com/#", "https://a.com/#"),
        // Scheme, host and port.
        ("HTTPS://Example.COM/Path", "https://example.com/Path"),
        ("https://EXAMPLE.com:443/x", "https://example.com/x"),
        ("http://example.com:80/x", "http://example.com/x"),
        ("https://example.com:/x", "https://example.com/x"),
        // 80 and 443 the server follows on either scheme, keeping the one that isn't the scheme's own.
        ("https://example.com:80/x", "https://example.com:80/x"),
        ("http://example.com:443/x?q=1", "http://example.com:443/x?q=1"),
        ("https://例子.tw/x", "https://xn--fsqu00a.tw/x"),
        ("https://Bücher.de:443/", "https://xn--bcher-kva.de/"),
        ("www.example.org/notes", "https://www.example.org/notes"),
    ])
    func theKeyIsTheLinkAsABrowserWritesIt(_ written: String, _ key: String) {
        #expect(StoryLinks.serverKey(written) == key)
        // Already written so (a stored preview's own address): unchanged.
        #expect(StoryLinks.serverKey(key) == key)
    }

    @Test(arguments: ["http://localhost:3000/x", "https://user@example.com/", "https://example.com:8443/", "http://example.com:8080/",
                      "ftp://example.com/file",
                      "https://127.1/x", "https://例子@example.com/", "https://"])
    func whatTheRulesRefuseHasNoKey(_ written: String) {
        #expect(StoryLinks.serverKey(written) == nil)
    }

    @Test func aBareAddressIsKeyedAsItIsWritten() {
        #expect(StoryLinks.key(href: nil, text: "https://example.com/search?q=what's+up") == "https://example.com/search?q=what%27s+up")
        #expect(StoryLinks.key(href: " https://例子.tw/x ", text: "例子") == "https://xn--fsqu00a.tw/x")
        // In other letters the host is no bare link at all (the rules end it at `https://`).
        #expect(StoryLinks.key(href: nil, text: "https://例子.tw/x") == nil)
    }
}
