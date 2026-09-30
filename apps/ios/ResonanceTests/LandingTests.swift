import Testing
@testable import Resonance

/// Where a signed-in person lands: onboarding only on the API's "no profile
/// yet", never because a request failed.
@MainActor @Suite struct LandingTests {
    typealias Landing = SessionStore.Landing

    @Test func aNewAccountWaitsForItsAnswer() {
        #expect(Landing.pending.after(.missing) == .onboarding)
        #expect(Landing.pending.after(.found) == .tabs)
    }

    @Test func aFailedRequestNeverOpensOnboarding() {
        // Offline at the first ask: into the tabs (the card box offers a retry), not onboarding.
        #expect(Landing.pending.after(.failed) == .tabs)
        // An existing account whose refresh fails stays in the tabs.
        #expect(Landing.tabs.after(.failed) == .tabs)
        // Someone mid-onboarding stays there.
        #expect(Landing.onboarding.after(.failed) == .onboarding)
    }

    @Test func aCreatedProfileOpensTheTabs() {
        #expect(Landing.onboarding.after(.found) == .tabs)
    }
}
