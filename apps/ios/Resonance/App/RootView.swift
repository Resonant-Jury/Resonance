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
                        // A new interface language re-renders everything; another account
                        // starts from nothing (no screen keeps what the last one was shown).
                        .id("\(session.languageEpoch)/\(session.uid ?? "")")
                        .transition(.opacity)
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: session.phase)
        .animation(.easeInOut(duration: 0.25), value: session.landing)
        .tint(Tokens.terracotta)
        // Back in the foreground after a while, the screens ask again behind what they
        // show (`cameBack`). Otherwise a profile that failed to load is asked for again
        // (a new account that was offline at first still reaches onboarding).
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, session.phase == .signedIn, !session.cameBack(),
                  case .failed = session.profile else { return }
            Task { await session.loadMe() }
        }
    }
}
