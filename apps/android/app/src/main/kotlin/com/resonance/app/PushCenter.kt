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
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.resonance.kit.chat.ChatPush
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
 *
 * Chat messages are the exception: a build that registers [CAPABILITIES] gets them as data-only
 * pushes and draws the conversation's notification itself ([showChatMessage]) — one per
 * conversation, a stack of its latest lines, which a thread on screen suppresses
 * ([viewingConversation]) and clears when it opens.
 */
object PushCenter {
    /** The channel the server names in every push (`android.notification.channelId`). */
    const val CHANNEL_ID = "activity"
    /** The channel of chat messages (the server names it in the message pushes it sends as notifications, too). */
    const val MESSAGES_CHANNEL_ID = "messages"
    /**
     * What this build does with a push beyond showing it, told to the server with the device:
     * `chat-push` — it draws a conversation's messages itself, so the server sends those as data.
     */
    val CAPABILITIES: List<String> = listOf("chat-push")
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

    /**
     * The "activity" and "messages" channels, named in the app's language (created again when the
     * language changes, which renames them). Messages are the louder one: a person writing to you
     * is worth a heads-up, a resonance can wait in the shade.
     */
    fun createChannel() {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, L10n.App.Nav.notifications, NotificationManager.IMPORTANCE_DEFAULT))
        manager.createNotificationChannel(NotificationChannel(MESSAGES_CHANNEL_ID, L10n.App.Nav.messages, NotificationManager.IMPORTANCE_HIGH))
    }

    /** False while the person has switched the app's notifications off (or, on API 33+, not granted the permission yet). */
    val canNotify: Boolean get() = NotificationManagerCompat.from(context).areNotificationsEnabled()

    /** The registration this install last sent (see [PushRegistration]); null once signed out. */
    var lastRegistration: String?
        get() = prefs.getString(REGISTRATION_KEY, null)
        set(value) = prefs.edit().apply { if (value == null) remove(REGISTRATION_KEY) else putString(REGISTRATION_KEY, value) }.apply()

    private val _permissionWanted = MutableStateFlow(false)
    /** The notification permission dialog should show now (MainActivity shows it, then [permissionShown]). */
    val permissionWanted: StateFlow<Boolean> = _permissionWanted

    /**
     * The person just reached someone — a note, a message, a card published: the moment a reply,
     * a resonance or a note back is worth hearing about, so the moment to ask (once; see
     * [takePermissionRequest]) — not on first opening the app, before there is anything to be
     * notified about.
     */
    fun reachedOut() {
        if (::context.isInitialized && takePermissionRequest()) _permissionWanted.value = true
    }

    fun permissionShown() {
        _permissionWanted.value = false
    }

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
    fun notification(context: Context, title: String, body: String?, route: String, notificationId: String?, fromUserId: String? = null): Notification =
        NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.notification_accent))
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(tapIntent(context, route, notificationId, fromUserId, notificationId))
            .build()

    /** What a tap on a notification starts: the app, with the push's keys as extras. */
    private fun tapIntent(context: Context, route: String, notificationId: String?, fromUserId: String?, identity: String?): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_ROUTE, route)
            .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            .putExtra(EXTRA_FROM_USER_ID, fromUserId)
        // A request code per push: intents that differ only in their extras would otherwise be one PendingIntent.
        return PendingIntent.getActivity(
            context, java.util.Objects.hash(identity, route), intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    // Chat

    /**
     * The conversation (its pair id, the notification's tag) that is open on screen right now: set
     * while its thread is resumed and cleared when it pauses, so a message that arrives behind the
     * lock screen or with the app in the background still rings. Read by the push service on
     * another thread.
     */
    @Volatile var viewingConversation: String? = null
        private set

    /** The thread of [pairId] is on screen (or no thread is, with null). Opening it clears its notification: the messages in it are being read. */
    fun viewing(pairId: String?) {
        viewingConversation = pairId
        if (pairId != null) cancelConversation(pairId)
    }

    /** The thread of [pairId] stopped being on screen — unless another has taken its place already. */
    fun stoppedViewing(pairId: String) {
        if (viewingConversation == pairId) viewingConversation = null
    }

    /** Takes a conversation's notification out of the shade (its messages were read, here or elsewhere). */
    fun cancelConversation(pairId: String) {
        if (::context.isInitialized) NotificationManagerCompat.from(context).cancel(pairId, CHAT_NOTIFICATION_ID)
    }

    /**
     * A chat message's notification: the conversation's latest lines ([MAX_LINES]) in one
     * `MessagingStyle` notification, tagged by the conversation so a new message replaces it (the
     * lines already in the shade are read back from it, which holds across a process restart), in
     * the "messages" channel and group. Nothing when the person switched notifications off, or is
     * looking at that conversation, or this very message is already in the shade (FCM delivered it twice).
     */
    fun showChatMessage(context: Context, push: ChatPush) {
        if (!canNotify || viewingConversation == push.conversationId) return
        val manager = NotificationManagerCompat.from(context)
        val shown = manager.activeNotifications
            .firstOrNull { it.tag == push.conversationId && it.id == CHAT_NOTIFICATION_ID }
            ?.notification?.let(NotificationCompat.MessagingStyle::extractMessagingStyleFromNotification)
        val lines = shown?.messages.orEmpty()
        if (push.messageId != null && lines.any { it.extras.getString(EXTRA_MESSAGE_ID) == push.messageId }) return

        val sender = Person.Builder().setName(push.title).setKey(push.fromUserId ?: push.conversationId).build()
        val style = NotificationCompat.MessagingStyle(Person.Builder().setName(L10n.Messages.you).build())
        lines.takeLast(MAX_LINES - 1).forEach(style::addMessage)
        style.addMessage(
            NotificationCompat.MessagingStyle.Message(push.body, push.sentAt, sender).also { line ->
                push.messageId?.let { line.extras.putString(EXTRA_MESSAGE_ID, it) }
            },
        )

        val builder = NotificationCompat.Builder(context, MESSAGES_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.notification_accent))
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setGroup(MESSAGES_GROUP)
            .setWhen(push.sentAt)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setContentIntent(tapIntent(context, push.route, null, push.fromUserId, push.conversationId))
        // canNotify covers the permission check the lint rule wants to see.
        @Suppress("MissingPermission")
        manager.notify(push.conversationId, CHAT_NOTIFICATION_ID, builder.build())
        // One summary for the group, so several conversations stack under one heading; it never alerts itself.
        val summary = NotificationCompat.Builder(context, MESSAGES_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.notification_accent))
            .setContentTitle(L10n.App.Nav.messages)
            .setGroup(MESSAGES_GROUP)
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setAutoCancel(true)
            .setContentIntent(tapIntent(context, MESSAGES_ROUTE, null, null, MESSAGES_GROUP))
            .build()
        @Suppress("MissingPermission")
        manager.notify(MESSAGES_GROUP, SUMMARY_NOTIFICATION_ID, summary)
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

    /** A conversation's notification: its pair id is the tag, and this the id. */
    private const val CHAT_NOTIFICATION_ID = 0
    private const val SUMMARY_NOTIFICATION_ID = 1
    private const val MESSAGES_GROUP = "messages"
    private const val MESSAGES_ROUTE = "/messages"
    /** The server's message id, kept on each line of a notification so a message delivered twice shows once. */
    private const val EXTRA_MESSAGE_ID = "messageId"
    /** How many of a conversation's latest lines its notification keeps. */
    private const val MAX_LINES = 6

    private const val INSTALLATION_KEY = "installationId"
    private const val REGISTRATION_KEY = "registration"
    private const val ASKED_KEY = "permissionAsked"
}
