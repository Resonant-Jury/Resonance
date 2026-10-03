import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// The thread's quiet labels — the time between messages, the full time under a held message's
/// menu, a search result's when — in each language the same as on Android and the web; and the
/// link a held message offers, whatever its bubble carries.
@MainActor @Suite struct ThreadLabelsTests {
    /// 2026-09-29 15:04 where the test runs (the labels are local times).
    let afternoon = Calendar.current.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 15, minute: 4))!

    @Test func aTimeLabelReadsAsItDoesOnTheOtherPlatforms() {
        #expect(ThreadScreen.time(afternoon, language: .zhTW) == "下午 3:04")
        #expect(ThreadScreen.time(afternoon, language: .en) == "3:04 PM")
        #expect(ThreadScreen.day(afternoon, language: .zhTW) == "9月29日")
        #expect(ThreadScreen.day(afternoon, language: .en) == "September 29")
        #expect(ThreadScreen.full(afternoon, language: .zhTW) == "9月29日 下午03:04")
        #expect(ThreadScreen.full(afternoon, language: .en) == "September 29 at 03:04 PM")
    }

    @Test func aResultSaysTheTimeTodayTheDayThisYearAndTheYearBefore() {
        let later = afternoon.addingTimeInterval(3 * 3600)
        #expect(ThreadScreen.resultTime(afternoon, now: later, language: .zhTW) == "下午 3:04")
        let nextMonth = Calendar.current.date(byAdding: .month, value: 1, to: afternoon)!
        #expect(ThreadScreen.resultTime(afternoon, now: nextMonth, language: .zhTW) == "9月29日")
        let nextYear = Calendar.current.date(byAdding: .year, value: 1, to: afternoon)!
        #expect(ThreadScreen.resultTime(afternoon, now: nextYear, language: .en) == "2026 · September 29")
    }

    @Test func aHeldMessageOffersTheLinkItLeadsTo() throws {
        let at = Date(timeIntervalSince1970: 1)
        let page = try #require(ChatLinks.parse("https://example.com/a"))
        let previewed = ChatMessage(id: "m1", senderId: "bob", text: "see https://example.com/a", sentAt: at,
                                    preview: LinkPreview(link: page, title: "A"))
        let carried = Carried<FeedCard>.of(previewed, share: nil) { _ in .loading }
        #expect(carried.link(of: previewed) == page.url)
        #expect(carried.carriesMore)

        // A card stands for the link to it; the menu still offers that link.
        let linked = ChatMessage(id: "m2", senderId: "bob", text: "https://resonance.channel/card/a-walk", sentAt: at)
        let card = Carried<FeedCard>.of(linked, share: linked.cardShare()) { _ in .found(Fixture.card("c1", slug: "a-walk")) }
        #expect(card.card?.id == "c1")
        #expect(card.link(of: linked)?.absoluteString == "https://resonance.channel/card/a-walk")
        // One shared with the button leads nowhere but the card itself.
        let attached = ChatMessage(id: "m3", senderId: "bob", text: "", sentAt: at, cardRef: "c1")
        #expect(Carried<FeedCard>.of(attached, share: attached.cardShare()) { _ in .loading }.link(of: attached) == nil)

        // Words alone: their first link, if any.
        let words = ChatMessage(id: "m4", senderId: "bob", text: "two: https://a.example/x and https://b.example/y", sentAt: at)
        let plain = Carried<FeedCard>.of(words, share: nil) { _ in .loading }
        #expect(plain.link(of: words)?.absoluteString == "https://a.example/x")
        #expect(!plain.carriesMore)
    }
}
