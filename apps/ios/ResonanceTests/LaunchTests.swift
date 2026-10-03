import Testing
@testable import Resonance

/// When the launch cover may dissolve: into a page, never into a loader on its way out.
@MainActor @Suite struct LaunchTests {
    @Test func theCoverWaitsWhileTheAccountRestores() {
        #expect(!Launch.ready(.restoring, .pending))
        #expect(!Launch.ready(.restoring, .tabs))
    }

    @Test func aSignedOutLaunchOpensOnSignIn() {
        #expect(Launch.ready(.signedOut, .pending))
    }

    @Test func aSignedInLaunchWaitsForWhereItLands() {
        // A profile this device hasn't seen yet: the loader until the API answers.
        #expect(!Launch.ready(.signedIn, .pending))
        #expect(Launch.ready(.signedIn, .tabs))
        #expect(Launch.ready(.signedIn, .onboarding))
    }
}
