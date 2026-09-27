import Foundation

/// Which backend the app talks to.
///
/// Release builds always use production. Debug builds use production too
/// unless launched with `-emulator YES`, which points everything at the
/// local stack: Firebase emulators (`npm run emulators`, project
/// demo-resonance) and the Next.js dev server wired to them
/// (`npm run dev:emulator -- --port 3100`).
nonisolated struct AppConfig: Sendable {
    enum Backend: Sendable { case production, emulator }

    let backend: Backend
    /// The site's origin; the API lives under /api/v1.
    let origin: URL
    /// Where emulators run, as seen from the simulator (the Mac's loopback).
    let emulatorHost = "127.0.0.1"

    static let production = AppConfig(backend: .production, origin: URL(string: "https://resonance-world.vercel.app")!)
    static let emulator = AppConfig(backend: .emulator, origin: URL(string: "http://127.0.0.1:3100")!)

    static var current: AppConfig {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "emulator") { return .emulator }
        #endif
        return .production
    }

    var usesEmulator: Bool { backend == .emulator }
}
