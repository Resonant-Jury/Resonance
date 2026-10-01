package com.resonance.app

import android.Manifest
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.lifecycleScope
import com.resonance.app.ui.ResonanceRoot
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/**
 * Debug launch extras (the twins of the iOS launch arguments):
 *   --ez emulator true             use the local Firebase emulators + dev server
 *   --es email … --es password …   sign that seeded account in, switching from a restored one (emulator only)
 *   --es route /card/<slug>        open that page (with --es notificationId … [--es fromUserId …], what a tapped push starts the app with)
 *   --es writeTitle … --es writeStory … --es writeCover <url>   a new card starts with them
 *   --es threadDraft …             fills a conversation's composer (--es route /messages/<handle> opens one)
 *   --es pushToken …               registers that stand-in push token under the signed-in account
 *   --es pushTitle … [--es pushBody … --es pushRoute … --es pushId … --es pushFromUserId …]   posts the notification a push received while open shows
 */
class MainActivity : ComponentActivity() {
    private val incomingRoute = mutableStateOf<String?>(null)
    private var session: Session? = null
    // The answer to the notification permission dialog: the device registers for pushes once they can show.
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        lifecycleScope.launch { session?.registerPush() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val emulator = BuildConfig.DEBUG && intent.getBooleanExtra("emulator", false)
        val config = if (!emulator) AppConfig(usesEmulator = false) else {
            fun port(name: String, default: Int) = intent.getIntExtra(name, default).takeIf { it in 1..65535 } ?: default
            AppConfig(
                usesEmulator = true,
                emulatorAuthPort = port("emulatorAuthPort", 9099),
                emulatorFirestorePort = port("emulatorFirestorePort", 8080),
                emulatorApiPort = port("emulatorApiPort", 3100),
            )
        }
        AppFirebase.configure(this, config)
        val session = (application as ResonanceApp).session(config)
        this.session = session
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
        // A recreated activity (rotation, process restore) still holds the intent it was first started with.
        if (savedInstanceState == null) handleExtras(intent)
        setContent { ResonanceRoot(session, incomingRoute) }
        // Once signed in: give this install's push token to the session.
        lifecycleScope.launch {
            session.phase.collect { phase ->
                if (phase == Session.Phase.SignedIn) PushCenter.fetchToken(config.usesEmulator)
            }
        }
        // Ask to show notifications (API 33+, once) when the app itself opens — not over the
        // sign-in or pen-name steps, before there is anything to be notified about.
        lifecycleScope.launch {
            combine(session.phase, session.entry) { phase, entry -> phase == Session.Phase.SignedIn && entry == Session.Entry.App }
                .distinctUntilChanged()
                .collect { inApp ->
                    if (inApp && PushCenter.takePermissionRequest()) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        incomingRoute.value = routeFrom(intent)
        handleExtras(intent)
    }

    /** A site link: /card/…, /u/…, /messages/…?note=…&card=…, its query kept. */
    private fun routeFrom(intent: Intent): String? =
        intent.data?.let { uri -> uri.path?.let { path -> path + (uri.encodedQuery?.let { "?$it" } ?: "") } }

    /**
     * A tapped push starts the app with its data as extras (`route`, `notificationId`,
     * `fromUserId`; the system's own notification does it for a push that arrived while the app
     * was closed, and the one the app posts itself does the same), in every build. The tabs open
     * what it points at.
     */
    private fun handleExtras(intent: Intent) {
        if (intent.data == null && (intent.hasExtra(PushCenter.EXTRA_ROUTE) || intent.hasExtra(PushCenter.EXTRA_NOTIFICATION_ID))) {
            PushCenter.open(
                intent.getStringExtra(PushCenter.EXTRA_ROUTE).orEmpty(),
                intent.getStringExtra(PushCenter.EXTRA_NOTIFICATION_ID),
                intent.getStringExtra(PushCenter.EXTRA_FROM_USER_ID),
            )
        }
        if (BuildConfig.DEBUG) {
            intent.getStringExtra("pushToken")?.let(PushCenter::tokenChanged)
            intent.getStringExtra("pushTitle")?.let {
                PushCenter.show(
                    this, it, intent.getStringExtra("pushBody"), intent.getStringExtra("pushRoute").orEmpty(), intent.getStringExtra("pushId"),
                    intent.getStringExtra("pushFromUserId"),
                )
            }
        }
    }
}

/** Debug launch extras the screens read (the writer's and a thread's prefill). */
object DebugLaunch {
    var writeTitle: String? = null
    var writeStory: String? = null
    var writeCover: String? = null
    /** A conversation's composer starts with this text. */
    var threadDraft: String? = null
}
