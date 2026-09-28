package com.resonance.app

/**
 * Which backend the app talks to. Release builds always use production;
 * debug builds launched with `--ez emulator true` use the local stack as the
 * Android emulator sees the Mac (10.0.2.2): the Firebase emulators (project
 * demo-resonance) and `npm run dev:emulator -- --port 3100`.
 */
data class AppConfig(val usesEmulator: Boolean) {
    val origin: String = if (usesEmulator) "http://$EMULATOR_HOST:3100" else "https://resonance-world.vercel.app"

    companion object {
        const val EMULATOR_HOST = "10.0.2.2"
        /** The emulators run as this project (firebase/firebase.json); the app must match. */
        const val EMULATOR_PROJECT = "demo-resonance"
    }
}
