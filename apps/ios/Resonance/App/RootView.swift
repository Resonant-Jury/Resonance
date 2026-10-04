import DesignSystem
import SwiftUI

/// Signed out → sign-in; signed in → the tabs, or first the pen-name step
/// when the account has no profile yet (or one without a pen name). While
/// Firebase restores a previous session (or a new sign-in waits for its
/// profile), the paper and a loader (no flash of the sign-in screen, or of
/// the tabs before onboarding). A cold launch opens under the launch cover,
/// which hands off to the first of these.
struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var launchCovering = true

    private var launchReady: Bool { Launch.ready(session.phase, session.landing) }

    /// Under the launch cover the first screen simply is; a crossfade would show the loader leaving as it dissolves.
    private var phaseChange: Animation? { launchCovering ? nil : .easeInOut(duration: 0.25) }

    var body: some View {
        ZStack {
            Tokens.cream.ignoresSafeArea()
            switch session.phase {
            case .restoring:
                SketchLoader(size: 56)
            case .signedOut:
                SignInScreen()
                    .id(session.languageEpoch)
                    .transition(.opacity)
            case .signedIn:
                switch session.landing {
                case .pending:
                    SketchLoader(size: 56)
                case .onboarding:
                    OnboardingScreen()
                        .id(session.languageEpoch)
                        .transition(.opacity)
                case .tabs:
                    MainTabView()
                        // A new interface language re-renders everything; another account
                        // starts from nothing (no screen keeps what the last one was shown).
                        .id("\(session.languageEpoch)/\(session.uid ?? "")")
                        .transition(.opacity)
                }
            }
        }
        .animation(phaseChange, value: session.phase)
        .animation(phaseChange, value: session.landing)
        .tint(Tokens.terracotta)
        .launchCover(ready: launchReady, covering: $launchCovering)
        // Back in the foreground after a while, the screens ask again behind what they
        // show (`cameBack`). Otherwise a profile that failed to load is asked for again
        // (a new account that was offline at first still reaches onboarding).
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, session.phase == .signedIn else { return }
            // Live lists whose listener failed (or whose people couldn't be read) listen again.
            session.notifications.resume()
            session.conversations.resume()
            guard !session.cameBack(), case .failed = session.profile else { return }
            Task { await session.loadMe() }
        }
    }
}
