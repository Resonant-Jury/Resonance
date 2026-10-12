import DesignSystem
import GoogleSignIn
import ResonanceKit
import SwiftUI

@main
struct ResonanceApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session: SessionStore

    init() {
        AppFonts.register()
        Strings.shared.load()
        let config = AppConfig.current
        FirebaseBootstrap.configure(config)
        _session = State(initialValue: SessionStore(config: config))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .onOpenURL { url in _ = GIDSignIn.sharedInstance.handle(url) }
        }
    }
}

extension View {
    /// A modal's content handed the session itself rather than left to inherit it. On a Mac (the iPad
    /// app there) SwiftUI builds a presented cover's view before the presenter's environment reaches
    /// it, and a view reading `@Environment(SessionStore.self)` then crashes the app — 分享卡片 in a
    /// conversation did. Every `organicModal` whose content reads the session goes through this.
    func withSession(_ session: SessionStore) -> some View {
        environment(session)
    }
}
