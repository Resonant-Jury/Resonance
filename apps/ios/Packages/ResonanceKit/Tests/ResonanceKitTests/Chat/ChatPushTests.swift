import Foundation
import Testing
@testable import ResonanceKit

/// A chat push as it reaches the app: whose it is, and whether the app shows it while it is open.
@Suite struct ChatPushTests {
    /// What the server puts beside the alert of a message push for iOS (FCM's data, at the top of the payload).
    let info: [AnyHashable: Any] = [
        "type": "message", "route": "/messages/bob", "fromUserId": "bob", "conversationId": "alice_bob", "messageId": "m1",
        "aps": ["alert": ["title": "bob", "body": "hello"], "thread-id": "alice_bob"],
    ]

    @Test func readsTheKeysTheServerSends() {
        #expect(ChatPush(userInfo: info) == ChatPush(conversationId: "alice_bob", messageId: "m1", fromUserId: "bob", route: "/messages/bob"))
        var named = info
        named["toUserId"] = "alice"
        #expect(ChatPush(userInfo: named)?.toUserId == "alice")
    }

    @Test func anotherTypeOrNoConversationIsNoChatPush() {
        func without(_ key: String) -> [AnyHashable: Any] { info.filter { $0.key != AnyHashable(key) } }
        func with(_ key: String, _ value: Any) -> [AnyHashable: Any] { info.merging([key: value]) { $1 } }
        #expect(ChatPush(userInfo: with("type", "resonance")) == nil)
        #expect(ChatPush(userInfo: without("type")) == nil)
        #expect(ChatPush(userInfo: without("conversationId")) == nil)
        #expect(ChatPush(userInfo: with("conversationId", " ")) == nil)
        #expect(ChatPush(userInfo: with("conversationId", 42)) == nil)
    }

    @Test func shownOnlyForTheAccountItWasSentTo() throws {
        let unnamed = try #require(ChatPush(userInfo: info))
        // The server names no recipient on a push the system draws: one of the conversation's two people must be signed in.
        #expect(unnamed.isFor("alice") && unnamed.isFor("bob"))
        #expect(!unnamed.isFor("carol"))
        #expect(!unnamed.isFor("alice_bob"))
        #expect(!unnamed.isFor(nil) && !unnamed.isFor(""))
        let toAlice = ChatPush(conversationId: "alice_bob", toUserId: "alice")
        #expect(toAlice.isFor("alice") && !toAlice.isFor("bob"))
    }

    @Test func aConversationOnScreenGetsNoBanner() throws {
        let push = try #require(ChatPush(userInfo: info))
        #expect(!push.showsWhileOpen(viewing: "alice_bob", signedIn: "alice"))
        // Another conversation on screen, or none: it shows.
        #expect(push.showsWhileOpen(viewing: "alice_carol", signedIn: "alice"))
        #expect(push.showsWhileOpen(viewing: nil, signedIn: "alice"))
        // Not for whoever is signed in now: never.
        #expect(!push.showsWhileOpen(viewing: nil, signedIn: "carol"))
    }
}
