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

    /// Stands for a thread screen's model (the push center only tells them apart).
    final class Thread {}

    @Test func theConversationOnScreenGetsNoBanner() {
        let center = PushCenter()
        let thread = Thread()
        center.signedIn = "alice"
        #expect(center.presentation(for: message()) == banner)
        center.viewing("alice_bob", by: ObjectIdentifier(thread))
        #expect(center.presentation(for: message()) == [])
        // Another conversation still rings.
        #expect(center.presentation(for: message("alice_carol")) == banner)
        // Left (another page over it, the app in the background): it rings again.
        center.stoppedViewing(by: ObjectIdentifier(thread))
        #expect(center.presentation(for: message()) == banner)
    }

    @Test func otherPushesShowAsTheyAlwaysHave() {
        let center = PushCenter()
        let thread = Thread()
        center.signedIn = "alice"
        center.viewing("alice_bob", by: ObjectIdentifier(thread))
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
        let bob = Thread(), carol = Thread()
        center.viewing("alice_bob", by: ObjectIdentifier(bob))
        center.viewing("alice_carol", by: ObjectIdentifier(carol))
        center.stoppedViewing(by: ObjectIdentifier(bob))
        #expect(center.viewingConversation == "alice_carol")
        center.stoppedViewing(by: ObjectIdentifier(carol))
        #expect(center.viewingConversation == nil)
    }

    @Test func aSecondThreadOfTheSameConversationKeepsItQuiet() {
        // Bob's push tapped while his thread was open: a second thread of it comes on show, then the first
        // one leaves (its disappearing comes after the second's appearing).
        let center = PushCenter()
        let first = Thread(), second = Thread()
        center.signedIn = "alice"
        center.viewing("alice_bob", by: ObjectIdentifier(first))
        center.viewing("alice_bob", by: ObjectIdentifier(second))
        center.stoppedViewing(by: ObjectIdentifier(first))
        #expect(center.viewingConversation == "alice_bob")
        #expect(center.presentation(for: message()) == [])
        center.stoppedViewing(by: ObjectIdentifier(second))
        #expect(center.presentation(for: message()) == banner)
    }

    @Test func aTappedMessageForAnotherAccountOpensNothing() {
        let center = PushCenter()
        // A push the server sends iOS names no recipient: the conversation's pair stands in.
        center.open(userInfo: message())
        #expect(center.opened?.isFor("alice") == true)
        #expect(center.opened?.isFor("carol") == false)
        #expect(center.opened?.isFor(nil) == false)
        center.open(userInfo: message().merging(["toUserId": "bob"]) { $1 })
        #expect(center.opened?.isFor("alice") == false)
        // A bell's push says nothing of whom it was for: it opens as it always has.
        center.open(userInfo: ["type": "note", "route": "/messages/bob", "notificationId": "n1"])
        #expect(center.opened?.isFor("carol") == true)
        // A message push names no bell row (an older server sent an empty id): none is marked read.
        center.open(userInfo: message().merging(["notificationId": ""]) { $1 })
        #expect(center.opened?.notificationId == nil)
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
