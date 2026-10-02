package com.resonance.app

import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

/** Release builds attest with Play Integrity (debug builds: src/debug). */
internal fun appCheckProviderFactory(): AppCheckProviderFactory = PlayIntegrityAppCheckProviderFactory.getInstance()
