package com.resonance.kit.chat

/**
 * A chat message's push as the server sends it (`type: "message"`): the sender's pen name as the
 * title and the message (or the localized "Shared a card") as the body, already in this device's
 * language. A build that draws the conversation's notification itself gets this as a data-only
 * push (it registered the `chat-push` capability); any other path delivers the same keys with a
 * notification payload beside them.
 */
data class ChatPush(
    val conversationId: String,
    val messageId: String?,
    val fromUserId: String?,
    val title: String,
    val body: String,
    /** A site path, `/messages/{handle}`. */
    val route: String,
    /** When the message was sent, epoch milliseconds. */
    val sentAt: Long,
) {
    companion object {
        const val TYPE = "message"

        /**
         * The push [data] describes, or null when it isn't a chat message or lacks what a
         * notification needs (a conversation to stack it in, someone it is from).
         * [fallbackTitle] and [fallbackBody] are the notification payload's, for the path that has one.
         */
        fun from(data: Map<String, String>, fallbackTitle: String? = null, fallbackBody: String? = null, now: Long = System.currentTimeMillis()): ChatPush? {
            if (data["type"] != TYPE) return null
            val conversationId = data["conversationId"]?.takeIf { it.isNotBlank() } ?: return null
            val title = (data["title"] ?: fallbackTitle)?.takeIf { it.isNotBlank() } ?: return null
            return ChatPush(
                conversationId = conversationId,
                messageId = data["messageId"]?.takeIf { it.isNotBlank() },
                fromUserId = data["fromUserId"]?.takeIf { it.isNotBlank() },
                title = title,
                body = data["body"] ?: fallbackBody.orEmpty(),
                route = data["route"].orEmpty(),
                sentAt = data["sentAt"]?.toLongOrNull()?.takeIf { it > 0 } ?: now,
            )
        }
    }
}
