import Foundation
import ResonanceKit
import Testing
import UserNotifications
@testable import Resonance

/// A conversation on screen is being read: its messages' pushes stay quiet while it shows, and
/// the ones already delivered go when it opens. Everything else shows as it always has.
@MainActor @Suite struct ChatNotificationTests {
    let banner: UNNotificationPresentationOptions = [.banner, .list, .sound]

    func message(_ conversation: String = "alice_bob") -> [AnyHashable: Any] {
        ["type": "message", "route": "/messages/bob", "fromUserId": "bob", "conversationId": conversation, "messageId": "m1"]
    }

    @Test func theConversationOnScreenGetsNoBanner() {
        let center = PushCenter()
        center.signedIn = "alice"
        #expect(center.presentation(for: message()) == banner)
        center.viewing("alice_bob")
        #expect(center.presentation(for: message()) == [])
        // Another conversation still rings.
        #expect(center.presentation(for: message("alice_carol")) == banner)
        // Left (another page over it, the app in the background): it rings again.
        center.stoppedViewing("alice_bob")
        #expect(center.presentation(for: message()) == banner)
    }

    @Test func otherPushesShowAsTheyAlwaysHave() {
        let center = PushCenter()
        center.signedIn = "alice"
        center.viewing("alice_bob")
        #expect(center.presentation(for: ["type": "note", "route": "/messages/bob", "notificationId": "n1"]) == banner)
        #expect(center.presentation(for: [:]) == banner)
    }

    @Test func aMessageForAnotherAccountStaysQuiet() {
        let center = PushCenter()
        // Signed out, or someone else signed in since this install was registered.
        #expect(center.presentation(for: message()) == [])
        center.signedIn = "carol"
        #expect(center.presentation(for: message()) == [])
    }

    @Test func leavingAThreadDoesntForgetTheOneThatTookItsPlace() {
        let center = PushCenter()
        center.viewing("alice_bob")
        center.viewing("alice_carol")
        center.stoppedViewing("alice_bob")
        #expect(center.viewingConversation == "alice_carol")
        center.stoppedViewing("alice_carol")
        #expect(center.viewingConversation == nil)
    }

    @Test func aDeliveredPushBelongsToItsConversation() {
        let grouped = UNMutableNotificationContent()
        grouped.threadIdentifier = "alice_bob"
        #expect(PushCenter.isOf(conversation: "alice_bob", grouped))
        #expect(!PushCenter.isOf(conversation: "alice_carol", grouped))
        // One whose group the system didn't keep is known by its data.
        let named = UNMutableNotificationContent()
        named.userInfo = message()
        #expect(PushCenter.isOf(conversation: "alice_bob", named))
        let bell = UNMutableNotificationContent()
        bell.userInfo = ["type": "note", "conversationId": "alice_bob"]
        #expect(!PushCenter.isOf(conversation: "alice_bob", bell))
    }
}
