package com.resonance.app

import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory

/**
 * Debug builds (emulators, sideloaded phones — no Play Integrity verdict) use the debug provider:
 * its token is in Logcat (tag DebugAppCheckProvider); register it in the Firebase console to see it
 * pass. Release builds use Play Integrity (src/release).
 */
internal fun appCheckProviderFactory(): AppCheckProviderFactory = DebugAppCheckProviderFactory.getInstance()
