import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Where a bell row leads. A note or resonance on one of your anonymous cards opens that card and
/// nothing else — never the writer's thread, which would read it and set up a reply answering the
/// anonymous card under your name — and its push, which says `/card/{id}` and names no sender, opens
/// the same card.
@MainActor @Suite struct NotificationRouteTests {
    let origin = AppConfig.production.origin

    private func row(_ type: String, anonymous: Bool? = nil, cardId: String? = "walk", preview: String? = nil) -> NotificationsStore.Item {
        var payload: [String: Any] = ["fromHandle": "bob", "fromUserId": "uid-bob"]
        if let cardId { payload["cardId"] = cardId }
        if let preview { payload["preview"] = preview }
        if type == "note" { payload["noteId"] = "note1" }
        if let anonymous { payload["anonymous"] = anonymous }
        return NotificationsStore.item(id: "n1", data: ["type": type, "payload": payload, "readAt": NSNull()])
    }

    @Test func aNoteOnAnAnonymousCardOpensTheCardWithItsWords() {
        let item = row("note", anonymous: true, preview: "thank you for this")
        #expect(item.anonymous)
        #expect(item.preview == "thank you for this")
        #expect(item.isUnread)
        #expect(NotificationsScreen.route(for: item) == .card("walk"))
    }

    @Test func aResonanceOnAnAnonymousCardOpensTheCard() {
        #expect(NotificationsScreen.route(for: row("resonance", anonymous: true)) == .card("walk"))
    }

    @Test func withoutItsCardItLeadsNowhereRatherThanToTheThread() {
        #expect(NotificationsScreen.route(for: row("note", anonymous: true, cardId: nil)) == nil)
        #expect(NotificationsScreen.route(for: row("resonance", anonymous: true, cardId: nil)) == nil)
    }

    @Test func rowsWithoutTheFlagOpenTheThreadAsBefore() {
        #expect(!row("note").anonymous)
        #expect(NotificationsScreen.route(for: row("note"))
            == .thread(handle: "bob", uid: "uid-bob", note: MessagingAPI.NoteRef(cardId: "walk", noteId: "note1")))
        #expect(NotificationsScreen.route(for: row("resonance", anonymous: false)) == .thread(handle: "bob", uid: "uid-bob", note: nil))
        // Only a note or a resonance carries the flag's meaning; a card link opens its card either way.
        #expect(NotificationsScreen.route(for: row("card_link", anonymous: true)) == .card("walk"))
        #expect(NotificationsScreen.route(for: row("message", anonymous: true)) == .thread(handle: "bob", uid: "uid-bob", note: nil))
    }

    @Test func itsPushOpensTheCardByItsRouteAlone() throws {
        let center = PushCenter()
        // The server's push for these: the card's path, no sender.
        center.open(userInfo: ["route": "/card/walk", "notificationId": "n1", "type": "note"])
        let opened = try #require(center.opened)
        #expect(opened.fromUserId == nil)
        let url = try #require(URL(string: opened.route, relativeTo: origin)?.absoluteURL)
        let route = try #require(Route(url: url, origin: origin))
        // Even with the bell row at hand (it names the writer), the card is what opens.
        #expect(MainTabView.withSender(route, uid: opened.fromUserId, of: row("note", anonymous: true)) == .card("walk"))
    }
}
