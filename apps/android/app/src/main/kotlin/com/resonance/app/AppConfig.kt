package com.resonance.app

/**
 * Which backend the app talks to. Release builds always use production;
 * debug builds launched with `--ez emulator true` use the local stack as the
 * Android emulator sees the Mac (10.0.2.2): the Firebase emulators (project
 * demo-resonance) and `npm run dev:emulator -- --port 3100`. `--ei emulatorAuthPort`,
 * `--ei emulatorFirestorePort` and `--ei emulatorApiPort` point it at another set
 * (`npm run emulators:at`), so parallel checkouts don't share one.
 */
data class AppConfig(
    val usesEmulator: Boolean,
    val emulatorAuthPort: Int = 9099,
    val emulatorFirestorePort: Int = 8080,
    val emulatorApiPort: Int = 3100,
) {
    val origin: String = if (usesEmulator) "http://$EMULATOR_HOST:$emulatorApiPort" else "https://resonance-world.vercel.app"

    companion object {
        const val EMULATOR_HOST = "10.0.2.2"
        /** The emulators run as this project (firebase/firebase.json); the app must match. */
        const val EMULATOR_PROJECT = "demo-resonance"
    }
}
