import FirebaseAppCheck
import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import ResonanceKit
import Synchronization

enum FirebaseBootstrap {
    /// The emulators run as project `demo-resonance` (firebase/firebase.json);
    /// the app must use the same project id or its ID tokens and Firestore
    /// paths won't match what the local dev server expects.
    static let emulatorProjectID = "demo-resonance"

    nonisolated private struct Store {
        /// The instance in use; nil after `clearLocalData` until the next use.
        var current: Firestore?
        /// What every instance is set up with (emulator builds: the local host, memory cache).
        var settings: FirestoreSettings?
    }

    nonisolated private static let store = Mutex(Store())

    static func configure(_ config: AppConfig) {
        guard FirebaseApp.app() == nil else { return }
        if config.usesEmulator {
            let options = FirebaseOptions(contentsOfFile: Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist")!)!
            options.projectID = emulatorProjectID
            // A stand-in in the shape Firebase checks (39 characters, "A…"; Installations refuses others).
            options.apiKey = "AIzaSyDemoResonanceLocalEmulators000000"
            FirebaseApp.configure(options: options)
            Auth.auth().useEmulator(withHost: config.emulatorHost, port: config.emulatorAuthPort)
            let host = "\(config.emulatorHost):\(config.emulatorFirestorePort)"
            store.withLock { store in
                let settings = FirestoreSettings()
                settings.host = host
                settings.isSSLEnabled = false
                settings.cacheSettings = MemoryCacheSettings()
                store.settings = settings
            }
        } else {
            // App Check — watched by the API and Firestore, not enforced yet:
            // App Attest on a phone. Debug builds (the simulator has no App
            // Attest) use the debug provider, whose token Xcode's console
            // prints; register it in the Firebase console to see it pass.
            #if DEBUG
            AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
            #else
            AppCheck.setAppCheckProviderFactory(AppAttestProviderFactory())
            #endif
            FirebaseApp.configure()
            watchAppCheckToken()
        }
    }

    /// Our API calls carry the App Check token the app has at hand
    /// (`AppCheckHeader`): the first one asked for now, then each the SDK
    /// renews. None of them waits for one.
    private static func watchAppCheckToken() {
        NotificationCenter.default.addObserver(forName: .AppCheckTokenDidChange, object: nil, queue: nil) { note in
            AppCheckHeader.set(note.userInfo?[AppCheckTokenNotificationKey] as? String)
        }
        AppCheck.appCheck().token(forcingRefresh: false) { token, _ in
            if let token { AppCheckHeader.set(token.token) }
        }
    }

    /// Firestore as the app uses it — always through here, never kept across
    /// a sign-out: `clearLocalData` ends the instance, and the next use gets a
    /// fresh one, set up as the first was.
    nonisolated static var db: Firestore {
        store.withLock { store in
            if let current = store.current { return current }
            let db = Firestore.firestore()
            if let settings = store.settings { db.settings = settings }
            store.current = db
            return db
        }
    }

    /// Signed out: what Firestore keeps on the device of the account — its
    /// cache of messages, notifications, drafts, and writes not yet sent — is
    /// deleted. The instance ends (`terminate`, which takes it out of the
    /// SDK's registry at once, so the next use makes a new one) and its files
    /// go (`clearPersistence`, right behind it). The listeners were stopped
    /// before; one removed after this is a no-op.
    ///
    /// The instance is held here until both are done: freed while its
    /// persistence is being cleared, it would wait for its own queue on the
    /// thread freeing it, and that queue for it — the app would freeze.
    nonisolated static func clearLocalData() async {
        let taken: Firestore? = store.withLock { store in
            defer { store.current = nil }
            return store.current
        }
        guard let old = taken else { return }
        do {
            try await old.terminate()
            try await old.clearPersistence()
        } catch {
            #if DEBUG
            print("Clearing Firestore's local data failed: \(error)")
            #endif
        }
        withExtendedLifetime(old) {}
    }
}
