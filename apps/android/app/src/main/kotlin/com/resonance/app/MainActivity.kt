package com.resonance.app

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.resonance.app.ui.KeyShortcuts
import com.resonance.app.ui.ResonanceRoot
import com.resonance.kit.chat.ChatPush
import com.resonance.kit.push.PushPlacement
import kotlinx.coroutines.launch

/**
 * Debug launch extras (the twins of the iOS launch arguments):
 *   --ez emulator true             use the local Firebase emulators + dev server
 *   --es email … --es password …   sign that seeded account in, switching from a restored one (emulator only)
 *   --es route /card/<slug>        open that page (with --es notificationId … [--es fromUserId …], what a tapped push starts the app with)
 *   --es writeTitle … --es writeStory … --es writeCover <url>   a new card starts with them
 *   --es threadDraft …             fills a conversation's composer (--es route /messages/<handle> opens one)
 *   --es pushToken …               registers that stand-in push token under the signed-in account
 *   --es pushTitle … [--es pushBody … --es pushRoute … --es pushId … --es pushFromUserId … --es pushType pick|new_card --es pushCardId …]   posts the notification a push received while open shows
 *   --ez avifDecoder true          reads AVIF with the app's own decoder (Android 10–11's path) on any version
 */
class MainActivity : ComponentActivity() {
    private val incomingRoute = mutableStateOf<String?>(null)
    private var session: Session? = null
    // The answer to the notification permission dialog: the device registers for pushes once they can show.
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        lifecycleScope.launch { session?.registerPush() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // The launch's splash (the waves on the paper) before anything else draws; see [Launch].
        val splash = installSplashScreen()
        // The app is drawn on paper in light and dark mode alike: dark system-bar icons always,
        // not the system's white ones on cream when the phone is in dark mode.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
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
        // The splash stays until the first screen is the page itself (not the loader while the
        // account restores, nor the wait for a profile this device hasn't seen), at most Launch.HOLD_MILLIS.
        Launch.hold(this, splash, fresh = savedInstanceState == null) {
            when (session.phase.value) {
                Session.Phase.Restoring -> false
                Session.Phase.SignedOut -> true
                Session.Phase.SignedIn -> session.entry.value != Session.Entry.Waiting
            }
        }
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
            DebugLaunch.avifDecoder = intent.getBooleanExtra("avifDecoder", false)
        }
        // A recreated activity (rotation, process restore) still holds the intent it was first started with,
        // and its back stacks come back as they were: the link was opened then and isn't pushed again.
        if (savedInstanceState == null) {
            incomingRoute.value = routeFrom(intent)
            handleExtras(intent)
        }
        setContent { ResonanceRoot(session, incomingRoute) }
        // Once signed in: give this install's push token to the session.
        lifecycleScope.launch {
            session.phase.collect { phase ->
                if (phase == Session.Phase.SignedIn) PushCenter.fetchToken(config.usesEmulator)
            }
        }
        // Ask to show notifications (API 33+, once) the first time the person reaches someone — a
        // note, a message, a card published (PushCenter.reachedOut) — when an answer is worth
        // hearing about; not on first opening the app.
        lifecycleScope.launch {
            PushCenter.permissionWanted.collect { wanted ->
                if (!wanted) return@collect
                PushCenter.permissionShown()
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    // Ctrl-N / Cmd-N on a hardware keyboard opens the writer, whatever has focus (a text field doesn't use the chord).
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val chord = event.isCtrlPressed || event.isMetaPressed
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_N && chord && !event.isAltPressed && !event.isShiftPressed) {
            val open = KeyShortcuts.newCard
            if (open != null) {
                if (event.repeatCount == 0) open()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onStart() {
        super.onStart()
        // Back after a while: the screens read again in the background (what they show stays meanwhile).
        session?.enteredForeground()
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
                // `pushType` pick / new_card (with `pushCardId`) lands in the "picks" channel, as those pushes do.
                val data = listOfNotNull(
                    intent.getStringExtra("pushType")?.let { type -> "type" to type },
                    intent.getStringExtra("pushCardId")?.let { id -> "cardId" to id },
                    intent.getStringExtra("pushId")?.let { id -> PushCenter.EXTRA_NOTIFICATION_ID to id },
                ).toMap()
                PushCenter.show(
                    this, it, intent.getStringExtra("pushBody"), intent.getStringExtra("pushRoute").orEmpty(), intent.getStringExtra("pushId"),
                    intent.getStringExtra("pushFromUserId"), PushPlacement.of(data),
                )
            }
            // A chat message as the push service would show it (`pushChatConversation` is the pair id; screen checks of its notification).
            intent.getStringExtra("pushChatBody")?.let { body ->
                val conversation = intent.getStringExtra("pushChatConversation").orEmpty()
                PushCenter.showChatMessage(
                    this,
                    ChatPush(
                        conversationId = conversation, messageId = intent.getStringExtra("pushChatId"), fromUserId = intent.getStringExtra("pushFromUserId"),
                        toUserId = null,
                        title = intent.getStringExtra("pushChatTitle").orEmpty().ifEmpty { "bob" }, body = body,
                        route = intent.getStringExtra("pushRoute").orEmpty(), sentAt = System.currentTimeMillis(),
                    ),
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
    /** Pictures in AVIF go through [AvifDecoder] whatever the Android version (its check on a recent emulator). */
    var avifDecoder = false
}
