package com.resonance.app

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.resonance.kit.chat.ChatPush
import com.resonance.kit.push.PushPlacement

/**
 * FCM's side of push (the twin of iOS's AppDelegate callbacks). A push that arrives while the app
 * is closed is shown by the system itself, from the message's `notification` and the channel it
 * names ("activity", or "picks" for the pushes the person turned on); one that arrives while it is
 * open comes here, where the app posts the same notification in the same channel ([PushPlacement]).
 *
 * A chat message is different: this build tells the server it draws those itself (`chat-push`),
 * so they arrive as data-only pushes — in every state of the app — and become the conversation's
 * notification here ([PushCenter.showChatMessage]). A message that came with a notification
 * payload all the same (an older path) takes the same road when the app is open.
 */
class ResonancePushService : FirebaseMessagingService() {
    @Suppress("OVERRIDE_DEPRECATION") // the registration-token callback; onRegistered belongs to the manifest opt-in
    override fun onNewToken(token: String) = PushCenter.tokenChanged(token)

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["type"] == ChatPush.TYPE) {
            // Only for the account signed in now. A push can wake a process the app never started, where
            // AppFirebase isn't set up yet: the default app (FCM's own) holds the same persisted sign-in.
            val me = runCatching { FirebaseAuth.getInstance().currentUser?.uid }.getOrNull()
            ChatPush.from(message.data, message.notification?.title, message.notification?.body)
                ?.takeIf { it.isFor(me) }
                ?.let { PushCenter.showChatMessage(this, it) }
            return
        }
        val title = message.notification?.title ?: return
        PushCenter.show(
            this, title, message.notification?.body,
            route = message.data[PushCenter.EXTRA_ROUTE].orEmpty(),
            notificationId = message.data[PushCenter.EXTRA_NOTIFICATION_ID],
            fromUserId = message.data[PushCenter.EXTRA_FROM_USER_ID],
            // Tonight's card and a connection's new card go where the system would have put them (the "picks" channel).
            placement = PushPlacement.of(message.data),
        )
    }
}
