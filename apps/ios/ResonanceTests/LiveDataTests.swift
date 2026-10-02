import Foundation
import Testing
@testable import Resonance

/// A passing failure — offline, a timeout, the backend busy — never stands for
/// "gone": a listener that failed listens again when the app comes back, and
/// a person whose profile couldn't be read is asked about again instead of
/// their conversation disappearing for the session. Only refused or
/// not-found means gone.
@MainActor @Suite struct LiveDataTests {
    final class Log {
        var attached: [String] = []
        var detached: [String] = []
    }

    @Test func aFailedListenerListensAgainWhenResumed() {
        let log = Log()
        let listeners = LiveListeners()
        for name in ["notifications", "blocks"] {
            listeners.add(name) {
                log.attached.append(name)
                return { log.detached.append(name) }
            }
        }
        #expect(log.attached == ["notifications", "blocks"])

        listeners.fail("notifications")
        #expect(log.detached == ["notifications"])
        #expect(listeners.failed == ["notifications"])

        // Back in the foreground: only the failed one is attached again.
        #expect(listeners.resume())
        #expect(log.attached == ["notifications", "blocks", "notifications"])
        #expect(listeners.failed.isEmpty)
        // Nothing failed since: nothing to do.
        #expect(!listeners.resume())
        #expect(log.attached.count == 3)

        // Stopped (signed out): every listener goes, and a late failure brings nothing back.
        listeners.removeAll()
        #expect(Set(log.detached) == ["notifications", "blocks"])
        #expect(log.detached.count == 3)
        listeners.fail("blocks")
        #expect(!listeners.resume())
        #expect(log.attached.count == 3)
    }

    @Test func aProfileThatCouldntBeReadIsAskedForAgain() throws {
        var book = PeopleBook()
        #expect(book.toRead(["bob", "carol"]) == ["bob", "carol"])
        book.record("bob", .failed)
        book.record("carol", .gone)
        // Carol is gone for good; Bob's read failed, so he's asked about again (on the next change, or back in the foreground).
        #expect(book.hasRetries)
        #expect(book.toRead(["bob", "carol"]) == ["bob"])
        #expect(book.found["bob"] == nil)

        let bob = try #require(Person(id: "bob", data: ["handle": "bob"]))
        book.record("bob", .found(bob))
        #expect(!book.hasRetries)
        #expect(book.found["bob"]?.handle == "bob")
        #expect(book.toRead(["bob", "carol"]).isEmpty)
    }

    @Test func onlyRefusedOrNotFoundIsGone() {
        let firestore = "FIRFirestoreErrorDomain"
        // permission-denied (7), not-found (5)
        #expect(FirestoreFailure.isGone(NSError(domain: firestore, code: 7)))
        #expect(FirestoreFailure.isGone(NSError(domain: firestore, code: 5)))
        // unavailable (14), deadline-exceeded (4), and anything that isn't Firestore's
        #expect(!FirestoreFailure.isGone(NSError(domain: firestore, code: 14)))
        #expect(!FirestoreFailure.isGone(NSError(domain: firestore, code: 4)))
        #expect(!FirestoreFailure.isGone(NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)))
    }
}
