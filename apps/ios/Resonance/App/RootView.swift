import DesignSystem
import SwiftUI

/// Signed out → sign-in; signed in → the tabs, or first the pen-name step
/// when the account has no profile yet. While Firebase restores a previous
/// session (or a new sign-in waits for its profile), the paper and a loader
/// (no flash of the sign-in screen, or of the tabs before onboarding).
struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase

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
                        // A new interface language re-renders everything.
                        .id(session.languageEpoch)
                        .transition(.opacity)
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: session.phase)
        .animation(.easeInOut(duration: 0.25), value: session.landing)
        .tint(Tokens.terracotta)
        // A profile that failed to load is asked for again when the app comes back
        // (a new account that was offline at first still reaches onboarding).
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, session.phase == .signedIn, case .failed = session.profile else { return }
            Task { await session.loadMe() }
        }
    }
}
