package com.resonance.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.lifecycleScope
import com.resonance.app.ui.ResonanceRoot
import kotlinx.coroutines.launch

/**
 * Debug launch extras (the twins of the iOS launch arguments):
 *   --ez emulator true             use the local Firebase emulators + dev server
 *   --es email … --es password …   sign that seeded account in (emulator only)
 *   --es route /card/<slug>        open that page
 *   --es writeTitle … --es writeStory … --es writeCover <url>   a new card starts with them
 */
class MainActivity : ComponentActivity() {
    private val incomingRoute = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val emulator = BuildConfig.DEBUG && intent.getBooleanExtra("emulator", false)
        val config = AppConfig(usesEmulator = emulator)
        AppFirebase.configure(this, config)
        val session = (application as ResonanceApp).session(config)
        if (emulator) {
            val email = intent.getStringExtra("email")
            val password = intent.getStringExtra("password")
            if (email != null && password != null && AppFirebase.auth.currentUser == null) {
                lifecycleScope.launch { session.signIn(email, password) }
            }
        }
        if (BuildConfig.DEBUG) {
            DebugLaunch.writeTitle = intent.getStringExtra("writeTitle")
            DebugLaunch.writeStory = intent.getStringExtra("writeStory")
            DebugLaunch.writeCover = intent.getStringExtra("writeCover")
        }
        incomingRoute.value = routeFrom(intent)
        setContent { ResonanceRoot(session, incomingRoute) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        incomingRoute.value = routeFrom(intent)
    }

    /** A site link (/card/…, /u/…) or the debug `route` extra. */
    private fun routeFrom(intent: Intent): String? =
        intent.data?.path ?: if (BuildConfig.DEBUG) intent.getStringExtra("route") else null
}

/** Debug launch extras the screens read (the writer's prefill). */
object DebugLaunch {
    var writeTitle: String? = null
    var writeStory: String? = null
    var writeCover: String? = null
}
