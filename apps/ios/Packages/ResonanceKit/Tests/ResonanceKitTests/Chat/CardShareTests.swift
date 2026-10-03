import Foundation
import Testing
@testable import ResonanceKit

/// A message that shares a Resonance card — with the card button, or as a link to a card's page —
/// is drawn as the card's own bubble; any other link is not.
@Suite struct CardShareTests {
    let at = Date(timeIntervalSince1970: 1)

    func key(_ url: String, origin: URL? = nil) -> String? { CardLinks.cardKey(URL(string: url)!, origin: origin) }
    func share(_ text: String, cardRef: String? = nil, preview: String? = nil, origin: URL? = nil) -> CardShare? {
        let p = preview.flatMap(ChatLinks.parse).map { LinkPreview(link: $0, title: "A walk") }
        return ChatMessage(id: "m1", senderId: "bob", text: text, sentAt: at, cardRef: cardRef, preview: p).cardShare(origin: origin)
    }

    @Test func aCardsPageOnTheSiteNamesTheCard() {
        #expect(key("https://resonance.channel/card/a-walk") == "a-walk")
        #expect(key("https://resonance.channel/zh-TW/card/rich-story") == "rich-story")
        #expect(key("https://www.resonance.channel/en/card/a-walk/") == "a-walk")
        #expect(key("https://resonance-world.vercel.app/card/Xy12_ab?utm=1#top") == "Xy12_ab")
        #expect(key("http://Resonance.Channel/card/a-walk") == "a-walk")
        #expect(key("https://resonance.channel:443/card/a-walk") == "a-walk")
    }

    @Test func otherPagesAndOtherSitesAreNot() {
        #expect(key("https://resonance.channel/u/bob") == nil)
        #expect(key("https://resonance.channel/card/") == nil)
        #expect(key("https://resonance.channel/card/a/b") == nil)
        #expect(key("https://resonance.channel/fr/card/a-walk") == nil)
        #expect(key("https://resonance.channel/card/a%20walk") == nil)
        #expect(key("https://resonance.channel.example.com/card/a-walk") == nil)
        #expect(key("https://img.resonance.channel/card/a-walk") == nil)
        #expect(key("https://resonance.channel:8443/card/a-walk") == nil)
        #expect(key("ftp://resonance.channel/card/a-walk") == nil)
    }

    @Test func anEmulatorBuildsOwnOriginCountsAsTheSite() {
        let origin = URL(string: "http://127.0.0.1:3300")!
        #expect(key("http://127.0.0.1:3300/zh-TW/card/rich-story", origin: origin) == "rich-story")
        #expect(key("http://127.0.0.1:3100/card/rich-story", origin: origin) == nil)
        #expect(key("http://127.0.0.1:3300/card/rich-story") == nil)
    }

    @Test func aCardSharedWithTheButtonKeepsAllItsWords() {
        #expect(share("", cardRef: "c1") == CardShare(key: "c1", link: nil, text: ""))
        #expect(share(" read this \n", cardRef: "c1") == CardShare(key: "c1", link: nil, text: "read this"))
        // The button's card wins over a link in the words.
        #expect(share("and https://resonance.channel/card/other", cardRef: "c1")?.key == "c1")
    }

    @Test func aLinkToACardIsTheCardAndItsWordsAreWhatIsLeft() throws {
        let alone = try #require(share("https://resonance.channel/zh-TW/card/rich-story"))
        #expect(alone.key == "rich-story")
        #expect(alone.text.isEmpty)
        #expect(alone.link?.url.absoluteString == "https://resonance.channel/zh-TW/card/rich-story")
        #expect(alone.link?.host == "resonance.channel")
        #expect(share("看看這篇 https://resonance.channel/card/a-walk ！")?.text == "看看這篇 ！")
        #expect(share("看看這篇：https://resonance.channel/card/a-walk")?.text == "看看這篇：")
        #expect(share("Read this\nhttps://resonance.channel/card/a-walk\nso good")?.text == "Read this\nso good")
    }

    @Test func thePreviewsLinkDecidesBeforeTheText() {
        // The server previews the first link; its address is the card's.
        let s = share("look https://resonance.channel/card/a-walk", preview: "https://resonance.channel/card/a-walk")
        #expect(s?.key == "a-walk")
        #expect(s?.text == "look")
        // A preview of another page is no card.
        #expect(share("look https://example.com/", preview: "https://example.com/") == nil)
    }

    @Test func onlyTheFirstLinkCounts() {
        #expect(share("https://example.com/ and https://resonance.channel/card/a-walk") == nil)
        #expect(share("no links here") == nil)
        #expect(share("") == nil)
    }
}
