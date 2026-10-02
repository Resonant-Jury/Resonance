package com.resonance.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.tasks.await
import java.util.UUID

/**
 * Push notifications: this install's id and FCM token, the notification the
 * app posts itself while it is open, and the pushes the person taps. The
 * server writes every push from a bell row (the same copy, in the app's
 * language) with `data.route`, a site path the app opens. The twin of iOS's
 * PushCenter.
 */
object PushCenter {
    /** The channel the server names in every push (`android.notification.channelId`). */
    const val CHANNEL_ID = "activity"
    /** The keys of a push's `data` — also the extras of the intent that a tap on it starts the app with. */
    const val EXTRA_ROUTE = "route"
    const val EXTRA_NOTIFICATION_ID = "notificationId"
    /** The sender's uid, in the pushes that open a conversation (note, message, resonance, accepted invite). */
    const val EXTRA_FROM_USER_ID = "fromUserId"

    /** A tapped push waiting for the tabs to open it. */
    data class Opened(
        /** A site path (`/messages/{handle}?note=…&card=…`, `/card/{id}`), or empty: show the notifications. */
        val route: String,
        val notificationId: String?,
        /** Who it is from, when the push says (its conversation then opens by uid, whatever their pen name is now). */
        val fromUserId: String? = null,
        /** Makes two taps on the same push two events. */
        val at: Long = System.nanoTime(),
    )

    private val _opened = MutableStateFlow<Opened?>(null)
    val opened: StateFlow<Opened?> = _opened

    /** This install's FCM token, once known. */
    @Volatile var token: String? = null
        private set

    /** Called with each new FCM token (the session registers it under whoever is signed in). */
    @Volatile var onToken: ((String) -> Unit)? = null

    private lateinit var context: Context
    private lateinit var prefs: SharedPreferences

    /** From the Application, before anything else: the process may have been started for a push. */
    fun init(application: Context) {
        context = application.applicationContext
        prefs = context.getSharedPreferences("push", Context.MODE_PRIVATE)
        createChannel()
    }

    /** This install's own id — the key the server keeps its token under. */
    val installationId: String
        get() = synchronized(this) {
            prefs.getString(INSTALLATION_KEY, null) ?: UUID.randomUUID().toString().also { prefs.edit().putString(INSTALLATION_KEY, it).apply() }
        }

    /** The "activity" channel, named in the app's language (created again when the language changes, which renames it). */
    fun createChannel() {
        val channel = NotificationChannel(CHANNEL_ID, L10n.App.Nav.notifications, NotificationManager.IMPORTANCE_DEFAULT)
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /** False while the person has switched the app's notifications off (or, on API 33+, not granted the permission yet). */
    val canNotify: Boolean get() = NotificationManagerCompat.from(context).areNotificationsEnabled()

    /**
     * Whether to show the notification permission dialog now: API 33+ only, not granted, and
     * not asked before (once per install; the system remembers a refusal too, and it stays
     * reachable in Settings).
     */
    fun takePermissionRequest(): Boolean {
        if (Build.VERSION.SDK_INT < 33) return false
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return false
        if (prefs.getBoolean(ASKED_KEY, false)) return false
        prefs.edit().putBoolean(ASKED_KEY, true).apply()
        return true
    }

    /**
     * Hands FCM's token to [tokenChanged]. Emulator builds stay off FCM entirely: their Firebase
     * project is a stand-in with no messaging behind it (the manifest leaves auto-init off).
     */
    // token / onNewToken are the registration-token API (the newer register() one is an opt-in through the manifest).
    @Suppress("DEPRECATION")
    suspend fun fetchToken(usesEmulator: Boolean) {
        if (usesEmulator) return
        val messaging = FirebaseMessaging.getInstance()
        messaging.isAutoInitEnabled = true
        runCatching { messaging.token.await() }.onSuccess { tokenChanged(it) }
    }

    fun tokenChanged(token: String?) {
        if (token.isNullOrEmpty() || token == this.token) return
        this.token = token
        onToken?.invoke(token)
    }

    fun open(route: String, notificationId: String?, fromUserId: String? = null) {
        _opened.value = Opened(route, notificationId, fromUserId?.takeIf { it.isNotEmpty() })
    }

    /** The tabs took the tap. */
    fun consume() {
        _opened.value = null
    }

    /**
     * The notification for a push that arrived while the app is open (FCM only shows the ones
     * that arrive while it is closed): the same channel and glyph, and a tap starts the app with
     * the push's `route`, `notificationId` and `fromUserId` as extras, as it does for the system's own.
     */
    fun notification(context: Context, title: String, body: String?, route: String, notificationId: String?, fromUserId: String? = null): Notification {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_ROUTE, route)
            .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            .putExtra(EXTRA_FROM_USER_ID, fromUserId)
        // A request code per push: intents that differ only in their extras would otherwise be one PendingIntent.
        val tap = PendingIntent.getActivity(
            context, java.util.Objects.hash(notificationId, route), intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.notification_accent))
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(tap)
            .build()
    }

    /** Signed out: the account's pushes still in the shade go (their words are its messages and notes). */
    fun clearDelivered() {
        if (::context.isInitialized) NotificationManagerCompat.from(context).cancelAll()
    }

    /** Posts [notification] (tagged by the bell row, so the same push never shows twice). */
    fun show(context: Context, title: String, body: String?, route: String, notificationId: String?, fromUserId: String? = null) {
        if (!canNotify) return
        val manager = NotificationManagerCompat.from(context)
        // canNotify covers the permission check the lint rule wants to see.
        @Suppress("MissingPermission")
        manager.notify(notificationId, 0, notification(context, title, body, route, notificationId, fromUserId))
    }

    private const val INSTALLATION_KEY = "installationId"
    private const val ASKED_KEY = "permissionAsked"
}
