import DesignSystem
import SwiftUI

/// Signed out → sign-in; signed in → the tabs. While Firebase restores a
/// previous session, the paper and a loader (no flash of the sign-in screen).
struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        ZStack {
            Tokens.cream.ignoresSafeArea()
            switch session.phase {
            case .restoring:
                SketchLoader(size: 56)
            case .signedOut:
                SignInScreen()
                    .transition(.opacity)
            case .signedIn:
                MainTabView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: session.phase)
        .tint(Tokens.terracotta)
    }
}
