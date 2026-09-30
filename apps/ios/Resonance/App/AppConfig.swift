import Foundation

/// Which backend the app talks to.
///
/// Release builds always use production. Debug builds use production too
/// unless launched with `-emulator YES`, which points everything at the
/// local stack: Firebase emulators (`npm run emulators`, project
/// demo-resonance) and the Next.js dev server wired to them
/// (`npm run dev:emulator -- --port 3100`). `-emulatorAuthPort`,
/// `-emulatorFirestorePort` and `-emulatorApiPort` point it at another set
/// (`npm run emulators:at`), so parallel checkouts don't share one.
nonisolated struct AppConfig: Sendable {
    enum Backend: Sendable { case production, emulator }

    let backend: Backend
    /// The site's origin; the API lives under /api/v1.
    let origin: URL
    /// Where emulators run, as seen from the simulator (the Mac's loopback).
    let emulatorHost = "127.0.0.1"
    var emulatorAuthPort = 9099
    var emulatorFirestorePort = 8080

    static let production = AppConfig(backend: .production, origin: URL(string: "https://resonance-world.vercel.app")!)
    static let emulator = AppConfig(backend: .emulator, origin: URL(string: "http://127.0.0.1:3100")!)

    static var current: AppConfig {
        #if DEBUG
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: "emulator") {
            var config = AppConfig.emulator
            if let port = Self.port(defaults, "emulatorApiPort") {
                config = AppConfig(backend: .emulator, origin: URL(string: "http://127.0.0.1:\(port)")!)
            }
            config.emulatorAuthPort = Self.port(defaults, "emulatorAuthPort") ?? config.emulatorAuthPort
            config.emulatorFirestorePort = Self.port(defaults, "emulatorFirestorePort") ?? config.emulatorFirestorePort
            return config
        }
        #endif
        return .production
    }

    var usesEmulator: Bool { backend == .emulator }

    #if DEBUG
    private static func port(_ defaults: UserDefaults, _ key: String) -> Int? {
        let value = defaults.integer(forKey: key)
        return (1...65535).contains(value) ? value : nil
    }
    #endif
}
