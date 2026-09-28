package com.resonance.app

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.memoryCacheSettings

/**
 * The Firebase app the rest of the code uses. Production is the default app
 * (google-services.json); emulator builds get their own app as project
 * demo-resonance, so ID tokens and Firestore paths match the local stack.
 */
object AppFirebase {
    lateinit var app: FirebaseApp
        private set

    val auth: FirebaseAuth get() = FirebaseAuth.getInstance(app)
    val db: FirebaseFirestore get() = FirebaseFirestore.getInstance(app)

    fun configure(context: Context, config: AppConfig) {
        if (::app.isInitialized) return
        val default = FirebaseApp.initializeApp(context) ?: FirebaseApp.getInstance()
        if (!config.usesEmulator) {
            app = default
            return
        }
        val options = FirebaseOptions.Builder(default.options)
            .setProjectId(AppConfig.EMULATOR_PROJECT)
            .setApiKey("demo-key")
            .build()
        app = FirebaseApp.initializeApp(context, options, "emulator")
        FirebaseAuth.getInstance(app).useEmulator(AppConfig.EMULATOR_HOST, 9099)
        FirebaseFirestore.getInstance(app).apply {
            useEmulator(AppConfig.EMULATOR_HOST, 8080)
            firestoreSettings = FirebaseFirestoreSettings.Builder().setLocalCacheSettings(memoryCacheSettings {}).build()
        }
    }
}
