import Foundation
import Testing
@testable import Resonance

/// The undo banner's date comes with the account (GET /me), and a cancel
/// made here holds: an answer asked for before it can't bring the banner back.
@MainActor @Suite struct AccountDeletionTests {
    let purge = Date(timeIntervalSince1970: 1_791_000_000)

    @Test func anAnswerAskedForAfterTheCancelIsTakenAsItIs() {
        var cancels = DeletionCancels()
        // Nothing cancelled: the scheduled deletion stands.
        #expect(cancels.answer(Fixture.me(purgeAfter: purge), asked: cancels.count).deletion?.value1.purgeAfter == purge)
        cancels.cancelled()
        // Scheduled again elsewhere since (the web), and asked for after the cancel: it shows.
        #expect(cancels.answer(Fixture.me(purgeAfter: purge), asked: cancels.count).deletion?.value1.purgeAfter == purge)
    }

    @Test func anAnswerOnItsWayDuringTheCancelDoesntBringTheBannerBack() {
        var cancels = DeletionCancels()
        let asked = cancels.count
        // The undo tapped while /me was on its way: its answer still names the deletion.
        cancels.cancelled()
        let taken = cancels.answer(Fixture.me(purgeAfter: purge), asked: asked)
        #expect(taken.deletion == nil)
        // The rest of the account is as the server said.
        #expect(taken.handle == "alice")
        #expect(cancels.answer(Fixture.me(), asked: asked).deletion == nil)
    }
}
