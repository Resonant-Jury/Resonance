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
