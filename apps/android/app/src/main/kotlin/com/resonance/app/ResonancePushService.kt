package com.resonance.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM's side of push (the twin of iOS's AppDelegate callbacks). A push that arrives while the app
 * is closed is shown by the system itself, from the message's `notification` and the "activity"
 * channel; one that arrives while it is open comes here, where the app posts the same notification.
 */
class ResonancePushService : FirebaseMessagingService() {
    @Suppress("OVERRIDE_DEPRECATION") // the registration-token callback; onRegistered belongs to the manifest opt-in
    override fun onNewToken(token: String) = PushCenter.tokenChanged(token)

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: return
        PushCenter.show(
            this, title, message.notification?.body,
            route = message.data[PushCenter.EXTRA_ROUTE].orEmpty(),
            notificationId = message.data[PushCenter.EXTRA_NOTIFICATION_ID],
            fromUserId = message.data[PushCenter.EXTRA_FROM_USER_ID],
        )
    }
}
