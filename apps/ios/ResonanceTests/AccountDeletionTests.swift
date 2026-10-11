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

/// An account that signs in with Apple has its Apple token revoked as it
/// schedules deletion (App Store 5.1.1(v)): Apple's sheet gives a fresh code,
/// Firebase revokes it — and only closing the sheet stops the deletion.
@MainActor @Suite struct AppleTokenRevocationTests {
    /// What the sheet and Firebase were asked.
    final class Calls {
        var authorized = 0
        var revoked: [String] = []
    }

    func revocation(appleUser: String? = "apple-sub", sheet: Result<(user: String, code: String?), Error> = .success(("apple-sub", "code-1")),
                    revoke: Error? = nil, calls: Calls) -> AppleTokenRevocation {
        AppleTokenRevocation(appleUser: appleUser, authorize: {
            calls.authorized += 1
            return try sheet.get()
        }, revoke: { code in
            calls.revoked.append(code)
            if let revoke { throw revoke }
        })
    }

    @Test func revokesTheCodeTheSheetGives() async throws {
        let calls = Calls()
        try await revocation(calls: calls).run()
        #expect(calls.authorized == 1)
        #expect(calls.revoked == ["code-1"])
    }

    @Test func anAccountWithoutAppleAsksNothingOfApple() async throws {
        let calls = Calls()
        try await revocation(appleUser: nil, calls: calls).run()
        #expect(calls.authorized == 0)
        #expect(calls.revoked.isEmpty)
    }

    @Test func closingTheSheetStopsTheDeletion() async {
        let calls = Calls()
        let closed = NSError(domain: "com.apple.AuthenticationServices.AuthorizationError", code: 1001)
        await #expect(throws: CancellationError.self) {
            try await revocation(sheet: .failure(closed), calls: calls).run()
        }
        #expect(calls.revoked.isEmpty)
    }

    @Test func anotherAppleIDsCodeIsNotRevoked() async throws {
        // Signed in here with Google, say: the device's Apple ID may sign in as someone else.
        let calls = Calls()
        try await revocation(sheet: .success(("someone-else", "code-2")), calls: calls).run()
        #expect(calls.revoked.isEmpty)
    }

    @Test func failuresLetTheDeletionGoAhead() async throws {
        let calls = Calls()
        let failed = NSError(domain: "com.apple.AuthenticationServices.AuthorizationError", code: 1000)
        // The sheet failed (no Apple ID on the device, say), no code came back, Firebase refused: none throws.
        try await revocation(sheet: .failure(failed), calls: calls).run()
        try await revocation(sheet: .success(("apple-sub", nil)), calls: calls).run()
        #expect(calls.revoked.isEmpty)
        try await revocation(revoke: NSError(domain: "FIRAuthErrorDomain", code: 17999), calls: calls).run()
        #expect(calls.revoked == ["code-1"])
    }
}
