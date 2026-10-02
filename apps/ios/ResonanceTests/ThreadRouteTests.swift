import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// A conversation opens by the other person's uid when the place it's opened
/// from knows it, and older links by pen name keep working.
@MainActor @Suite struct ThreadRouteTests {
    let origin = AppConfig.production.origin

    @Test func linksByPenNameStillOpenAThread() {
        let route = Route(url: URL(string: "https://resonance.channel/zh-TW/messages/bob?note=n1&card=c1")!, origin: origin)
        #expect(route == .thread(handle: "bob", uid: nil, note: MessagingAPI.NoteRef(cardId: "c1", noteId: "n1")))
        // A note's reply link from before the site's own domain.
        let former = Route(url: URL(string: "https://resonance-world.vercel.app/zh-TW/messages/bob?note=n1&card=c1")!, origin: origin)
        #expect(former == route)
    }

    @Test func aPushTakesTheSendersUidFromItsBellRow() {
        let item = NotificationsStore.Item(id: "n1", type: "message", fromHandle: "bob", fromUserId: "uid-bob", cardId: nil,
                                           preview: nil, noteId: nil, count: nil, readAt: nil, createdAt: nil)
        let pushed = Route.thread(handle: "bob", note: nil)
        #expect(MainTabView.withSender(pushed, of: item) == .thread(handle: "bob", uid: "uid-bob", note: nil))
        // No row yet (a cold start), or a row about someone else: the pen name alone.
        #expect(MainTabView.withSender(pushed, of: nil) == pushed)
        let other = NotificationsStore.Item(id: "n2", type: "message", fromHandle: "carol", fromUserId: "uid-carol", cardId: nil,
                                            preview: nil, noteId: nil, count: nil, readAt: nil, createdAt: nil)
        #expect(MainTabView.withSender(pushed, of: other) == pushed)
        // Other routes pass through.
        #expect(MainTabView.withSender(.card("a-walk"), of: item) == .card("a-walk"))
    }

    @Test func aPushCarryingTheSendersUidOpensTheThreadByIt() {
        // A cold start: no bell row has arrived, the push's own data knows who wrote.
        let pushed = Route.thread(handle: "bob", note: MessagingAPI.NoteRef(cardId: "c1", noteId: "n1"))
        #expect(MainTabView.withSender(pushed, uid: "uid-bob", of: nil)
            == .thread(handle: "bob", uid: "uid-bob", note: MessagingAPI.NoteRef(cardId: "c1", noteId: "n1")))
        // The push's uid outlasts a pen name changed since (the row would no longer match it).
        let renamed = NotificationsStore.Item(id: "n1", type: "message", fromHandle: "bobby", fromUserId: "uid-bob", cardId: nil,
                                              preview: nil, noteId: nil, count: nil, readAt: nil, createdAt: nil)
        #expect(MainTabView.withSender(.thread(handle: "bob", note: nil), uid: "uid-bob", of: renamed)
            == .thread(handle: "bob", uid: "uid-bob", note: nil))
        // A push that opens a card has nobody to name.
        #expect(MainTabView.withSender(.card("a-walk"), uid: "uid-bob", of: nil) == .card("a-walk"))
    }

    @Test func aTappedPushHandsOverItsSender() {
        let center = PushCenter()
        center.open(userInfo: ["route": "/messages/bob", "notificationId": "n1", "fromUserId": "uid-bob", "type": "message"])
        #expect(center.opened?.route == "/messages/bob")
        #expect(center.opened?.notificationId == "n1")
        #expect(center.opened?.fromUserId == "uid-bob")
        // An older server's push: no uid, today's behaviour (the bell row, or the pen name).
        center.open(userInfo: ["route": "/messages/bob", "notificationId": "n2"])
        #expect(center.opened?.fromUserId == nil)
        center.open(userInfo: ["route": "/card/a-walk", "fromUserId": ""])
        #expect(center.opened?.fromUserId == nil)
    }

    @Test func aBellRowOpensTheThreadByUid() {
        let item = NotificationsStore.Item(id: "n1", type: "note", fromHandle: "bob", fromUserId: "uid-bob", cardId: "c1",
                                           preview: "hi", noteId: "note1", count: nil, readAt: nil, createdAt: nil)
        #expect(NotificationsScreen.route(for: item)
            == .thread(handle: "bob", uid: "uid-bob", note: MessagingAPI.NoteRef(cardId: "c1", noteId: "note1")))
    }

    @Test func theConversationIsFoundByItsPairId() {
        #expect(ThreadModel.pairId("bob", "alice") == "alice_bob")
        #expect(ThreadModel.pairId("alice", "bob") == "alice_bob")
    }

    @Test func aRefusedReadMeansNoConversationYet() {
        // What the SDK reports for a read the rules refuse (PERMISSION_DENIED, gRPC 7) and for no network (UNAVAILABLE, 14).
        let refused = NSError(domain: "FIRFirestoreErrorDomain", code: 7)
        #expect(ThreadModel.isNoConversation(refused))
        let offline = NSError(domain: "FIRFirestoreErrorDomain", code: 14)
        #expect(!ThreadModel.isNoConversation(offline))
        #expect(!ThreadModel.isNoConversation(URLError(.notConnectedToInternet)))
    }
}
