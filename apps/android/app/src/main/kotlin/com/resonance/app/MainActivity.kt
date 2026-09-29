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
 *   --es email … --es password …   sign that seeded account in, switching from a restored one (emulator only)
 *   --es route /card/<slug>        open that page
 *   --es writeTitle … --es writeStory … --es writeCover <url>   a new card starts with them
 *   --es threadDraft …             fills a conversation's composer (--es route /messages/<handle> opens one)
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
            // Switches from whoever was restored to the requested account.
            if (email != null && password != null && !AppFirebase.auth.currentUser?.email.equals(email, ignoreCase = true)) {
                lifecycleScope.launch { session.signIn(email, password) }
            }
        }
        if (BuildConfig.DEBUG) {
            DebugLaunch.writeTitle = intent.getStringExtra("writeTitle")
            DebugLaunch.writeStory = intent.getStringExtra("writeStory")
            DebugLaunch.writeCover = intent.getStringExtra("writeCover")
            DebugLaunch.threadDraft = intent.getStringExtra("threadDraft")
        }
        incomingRoute.value = routeFrom(intent)
        setContent { ResonanceRoot(session, incomingRoute) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        incomingRoute.value = routeFrom(intent)
    }

    /** A site link (/card/…, /u/…, /messages/…?note=…&card=…, its query kept) or the debug `route` extra. */
    private fun routeFrom(intent: Intent): String? =
        intent.data?.let { uri -> uri.path?.let { path -> path + (uri.encodedQuery?.let { "?$it" } ?: "") } }
            ?: if (BuildConfig.DEBUG) intent.getStringExtra("route") else null
}

/** Debug launch extras the screens read (the writer's and a thread's prefill). */
object DebugLaunch {
    var writeTitle: String? = null
    var writeStory: String? = null
    var writeCover: String? = null
    /** A conversation's composer starts with this text. */
    var threadDraft: String? = null
}
