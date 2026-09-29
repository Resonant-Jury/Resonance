import FirebaseAuth
import FirebaseCore
import FirebaseFirestore

enum FirebaseBootstrap {
    /// The emulators run as project `demo-resonance` (firebase/firebase.json);
    /// the app must use the same project id or its ID tokens and Firestore
    /// paths won't match what the local dev server expects.
    static let emulatorProjectID = "demo-resonance"

    static func configure(_ config: AppConfig) {
        guard FirebaseApp.app() == nil else { return }
        if config.usesEmulator {
            let options = FirebaseOptions(contentsOfFile: Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist")!)!
            options.projectID = emulatorProjectID
            // A stand-in in the shape Firebase checks (39 characters, "A…"; Installations refuses others).
            options.apiKey = "AIzaSyDemoResonanceLocalEmulators000000"
            FirebaseApp.configure(options: options)
            Auth.auth().useEmulator(withHost: config.emulatorHost, port: 9099)
            let settings = Firestore.firestore().settings
            settings.host = "\(config.emulatorHost):8080"
            settings.isSSLEnabled = false
            settings.cacheSettings = MemoryCacheSettings()
            Firestore.firestore().settings = settings
        } else {
            FirebaseApp.configure()
        }
    }
}
