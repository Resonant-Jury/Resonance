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
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.resonance.kit.chat.ChatPush
import com.resonance.kit.l10n.L10n
import com.resonance.kit.push.PushPlacement
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
    /** The channel the server names in every bell row's push (`android.notification.channelId`). */
    const val CHANNEL_ID = PushPlacement.ACTIVITY_CHANNEL
    /** The channel of chat messages (the server names it in the message pushes it sends as notifications, too). */
    const val MESSAGES_CHANNEL_ID = "messages"
    /** The channel of the pushes the person turned on in Settings → Notifications: tonight's card, connections' new cards. */
    const val PICKS_CHANNEL_ID = PushPlacement.PICKS_CHANNEL
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
     * The "activity", "messages" and "picks" channels, named in the app's language (created again
     * when the language changes, which renames them). Messages are the louder one: a person writing
     * to you is worth a heads-up, a resonance can wait in the shade — and so can the pushes the
     * person asked for (tonight's card, a connection's new card), in a channel of their own that
     * can be silenced apart from the rest. A build without "picks" got those in "activity".
     */
    fun createChannel() {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, L10n.App.Nav.notifications, NotificationManager.IMPORTANCE_DEFAULT))
        manager.createNotificationChannel(NotificationChannel(MESSAGES_CHANNEL_ID, L10n.App.Nav.messages, NotificationManager.IMPORTANCE_HIGH))
        manager.createNotificationChannel(NotificationChannel(PICKS_CHANNEL_ID, L10n.Native.channelNewCards, NotificationManager.IMPORTANCE_DEFAULT))
    }

    /**
     * False while the person has switched the app's notifications off (or, on API 33+, not granted
     * the permission yet). A channel turned off alone doesn't count here: see [picksBlock].
     */
    val canNotify: Boolean get() = NotificationManagerCompat.from(context).areNotificationsEnabled()

    /**
     * Whether asking for the notification permission can still show the system's dialog: API 33+,
     * and not granted. (After two refusals the system answers "no" without asking — the request's
     * result says so.) Below 33 there is nothing to ask: notifications are on unless switched off
     * in the system settings.
     */
    val canAskPermission: Boolean
        get() = Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED

    /** The app asks for the permission itself (Settings → Notifications): the prompt after reaching someone needn't ask again. */
    fun permissionAsked() {
        prefs.edit().putBoolean(ASKED_KEY, true).apply()
    }

    /** What keeps the pushes of Settings → Notifications (tonight's card, connections' new cards) off this phone, if anything. */
    enum class PicksBlock {
        /** Nothing: they show. */
        None,

        /** Every notification of the app is off ([canNotify]: switched off, or the permission not given). */
        App,

        /** Only their "picks" channel, turned off by itself in the system settings — the rest still show. */
        Channel,
    }

    /**
     * Which [PicksBlock] holds back the pushes of Settings → Notifications: the app's notifications
     * off, or the "picks" channel's importance set to none ([picksImportance]; null while it isn't there).
     */
    internal fun picksBlock(appEnabled: Boolean, picksImportance: Int?): PicksBlock = when {
        !appEnabled -> PicksBlock.App
        picksImportance == NotificationManager.IMPORTANCE_NONE -> PicksBlock.Channel
        else -> PicksBlock.None
    }

    /**
     * This phone's [PicksBlock] now. Settings → Notifications reads this, not [canNotify]: a switch
     * whose channel is off would send pushes nobody sees. (Messages and bells only need [canNotify].)
     */
    val picksBlock: PicksBlock
        get() = picksBlock(
            canNotify,
            context.getSystemService(NotificationManager::class.java).getNotificationChannel(PICKS_CHANNEL_ID)?.importance,
        )

    /** A system settings page: its action, and the channel it opens at (none: the app's own page). */
    internal data class SettingsPage(val action: String, val channelId: String? = null)

    /** Where [block] is lifted: the "picks" channel's own page when only it is off, else the app's notification settings. */
    internal fun settingsPage(block: PicksBlock): SettingsPage = when (block) {
        PicksBlock.Channel -> SettingsPage(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS, PICKS_CHANNEL_ID)
        PicksBlock.App, PicksBlock.None -> SettingsPage(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
    }

    /** The system's notification settings for this app (or, for [PicksBlock.Channel], the "picks" channel's), where a refused permission is turned back on. */
    fun notificationSettingsIntent(context: Context, block: PicksBlock = PicksBlock.App): Intent {
        val page = settingsPage(block)
        return Intent(page.action)
            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            .apply { page.channelId?.let { putExtra(Settings.EXTRA_CHANNEL_ID, it) } }
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

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
        // An empty id (a message push has no bell row; older servers sent "") names no notification to mark read.
        _opened.value = Opened(route, notificationId?.takeIf { it.isNotEmpty() }, fromUserId?.takeIf { it.isNotEmpty() })
    }

    /** The tabs took the tap. */
    fun consume() {
        _opened.value = null
    }

    /**
     * The notification for a push that arrived while the app is open (FCM only shows the ones
     * that arrive while it is closed): the same channel ([placement]) and glyph, the whole body
     * when expanded (as FCM's own shows it — tonight's card is a title and a line under it), and a
     * tap starts the app with the push's `route`, `notificationId` and `fromUserId` as extras, as it
     * does for the system's own.
     */
    fun notification(
        context: Context,
        title: String,
        body: String?,
        route: String,
        notificationId: String?,
        fromUserId: String? = null,
        placement: PushPlacement = PushPlacement(CHANNEL_ID, notificationId),
    ): Notification =
        NotificationCompat.Builder(context, placement.channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.notification_accent))
            .setContentTitle(title)
            .setContentText(body)
            .apply { if (!body.isNullOrEmpty()) setStyle(NotificationCompat.BigTextStyle().bigText(body)) }
            .setAutoCancel(true)
            .setContentIntent(tapIntent(context, route, notificationId, fromUserId, placement.tag))
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

    /**
     * Posts [notification] in [placement]'s channel under its tag: a bell row's push by the row, so
     * the same push never shows twice; tonight's card in place of the last one; a new card by its id.
     */
    fun show(
        context: Context,
        title: String,
        body: String?,
        route: String,
        notificationId: String?,
        fromUserId: String? = null,
        placement: PushPlacement = PushPlacement(CHANNEL_ID, notificationId),
    ) {
        if (!canNotify) return
        val manager = NotificationManagerCompat.from(context)
        // canNotify covers the permission check the lint rule wants to see.
        @Suppress("MissingPermission")
        manager.notify(placement.tag, 0, notification(context, title, body, route, notificationId, fromUserId, placement))
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
