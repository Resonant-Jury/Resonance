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
        #if DEBUG
        .modifier(DebugWindow())
        #endif
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

#if DEBUG
/// `-debugWindow 1376x1032` lays the app out in a window of that size, scaled down to fit the
/// screen (screen checks of another window — an iPad's landscape, a split — where the simulator
/// can't be turned or split from the command line). Layout only: the safe areas stay the screen's.
private struct DebugWindow: ViewModifier {
    private let size: CGSize? = {
        guard let spec = UserDefaults.standard.string(forKey: "debugWindow") else { return nil }
        let parts = spec.split(separator: "x").compactMap { Double($0) }
        return parts.count == 2 ? CGSize(width: parts[0], height: parts[1]) : nil
    }()

    func body(content: Content) -> some View {
        if let size {
            GeometryReader { geo in
                let scale = min(geo.size.width / size.width, geo.size.height / size.height, 1)
                // Laid out at the size asked for, drawn scaled into the middle of the screen.
                content
                    .frame(width: size.width, height: size.height)
                    .border(Color.red.opacity(0.4))
                    .scaleEffect(scale)
                    .frame(width: geo.size.width, height: geo.size.height)
            }
        } else {
            content
        }
    }
}
#endif
