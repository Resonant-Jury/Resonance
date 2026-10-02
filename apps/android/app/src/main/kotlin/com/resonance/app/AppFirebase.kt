package com.resonance.app

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.memoryCacheSettings
import kotlinx.coroutines.tasks.await

/**
 * The Firebase app the rest of the code uses. Production is the default app
 * (google-services.json); emulator builds get their own app as project
 * demo-resonance, so ID tokens and Firestore paths match the local stack.
 */
object AppFirebase {
    lateinit var app: FirebaseApp
        private set

    val auth: FirebaseAuth get() = FirebaseAuth.getInstance(app)

    /** Where an emulator build's Firestore lives (null: production). */
    private var emulator: AppConfig? = null
    /** The instance in use; null after [clearLocalData] until the next use. */
    @Volatile private var current: FirebaseFirestore? = null

    /**
     * Firestore as the app uses it — always through here, never kept across a sign-out:
     * [clearLocalData] ends the instance, and the next use gets a fresh one, set up as the first was.
     */
    val db: FirebaseFirestore
        get() = current ?: synchronized(this) {
            current ?: FirebaseFirestore.getInstance(app).also { db ->
                emulator?.let { config ->
                    db.useEmulator(AppConfig.EMULATOR_HOST, config.emulatorFirestorePort)
                    db.firestoreSettings = FirebaseFirestoreSettings.Builder().setLocalCacheSettings(memoryCacheSettings {}).build()
                }
                current = db
            }
        }

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
        FirebaseAuth.getInstance(app).useEmulator(AppConfig.EMULATOR_HOST, config.emulatorAuthPort)
        emulator = config
        db
    }

    /**
     * Signed out: what Firestore keeps on the device of the account — its cache of messages,
     * notifications, drafts, and writes not yet sent — is deleted. The instance ends (terminate,
     * which takes it out of the SDK's registry at once, so the next use makes a new one) and its
     * files go (clearPersistence). The listeners were stopped before; one removed after this is a
     * no-op.
     */
    suspend fun clearLocalData() {
        val (old, terminating) = synchronized(this) {
            val old = current ?: return
            current = null
            old to old.terminate()
        }
        try {
            terminating.await()
            old.clearPersistence().await()
        } catch (e: Exception) {
            android.util.Log.w("AppFirebase", "clearing Firestore's local data failed", e)
        }
    }
}
