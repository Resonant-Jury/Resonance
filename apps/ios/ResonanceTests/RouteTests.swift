import Foundation
import Testing
@testable import Resonance

/// Site links open in the app from the site's host — the origin's, or the one
/// the site had before its own domain, whose links are in older stories — and
/// from no look-alike of either.
@MainActor @Suite struct RouteTests {
    let origin = AppConfig.production.origin
    func route(_ link: String) -> Route? { Route(url: URL(string: link)!, origin: origin) }

    @Test func pagesOnTheSitesHostsOpenInTheApp() {
        #expect(route("https://resonance.channel/card/a-walk") == .card("a-walk"))
        #expect(route("https://Resonance.Channel/zh-TW/u/bob") == .author("bob"))
        #expect(route("https://resonance.channel/en/me/thought-map") == .thoughtMap)
        #expect(route("https://resonance-world.vercel.app/card/a-walk") == .card("a-walk"))
        #expect(route("https://resonance-world.vercel.app/en/u/bob") == .author("bob"))
        // A path alone (a push's route) is the site's.
        #expect(route("/card/a-walk") == .card("a-walk"))
    }

    @Test func otherHostsAndOtherPagesDoNot() {
        #expect(route("https://resonance.channel.example.com/card/a-walk") == nil)
        #expect(route("https://resonance.channel@example.com/card/a-walk") == nil)
        #expect(route("https://resonance-world.vercel.app.example.com/card/a-walk") == nil)
        #expect(route("https://img.resonance.channel/card/a-walk") == nil)
        #expect(route("https://example.com/card/a-walk") == nil)
        // The policy pages stay with the in-app browser.
        #expect(route("https://resonance.channel/zh-TW/privacy") == nil)
    }

    @Test func theLocalStackRoutesItsOwnPages() {
        let local = AppConfig.emulator.origin
        #expect(Route(url: URL(string: "http://127.0.0.1:3100/card/a-walk")!, origin: local) == .card("a-walk"))
        #expect(Route(url: URL(string: "https://example.com/card/a-walk")!, origin: local) == nil)
    }
}
