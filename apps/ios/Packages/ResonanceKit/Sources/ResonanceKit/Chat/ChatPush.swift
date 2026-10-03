import Foundation

/// A chat message's push as it reaches the app (`type: "message"` in its data; the system draws
/// it — the sender's pen name over the words — and groups a conversation's pushes by their
/// `threadId`, the conversation's pair id). What the app decides about one: whether to show it
/// while the app is open, and which conversation's pushes to clear once it is read. The twin of
/// Android's `ChatPush`, which draws its own.
public struct ChatPush: Equatable, Sendable {
    public static let type = "message"

    public let conversationId: String
    public let messageId: String?
    public let fromUserId: String?
    /// Whom it was sent to, when the server names them; otherwise the conversation's pair stands in.
    public let toUserId: String?
    /// A site path, `/messages/{handle}`.
    public let route: String

    public init(conversationId: String, messageId: String? = nil, fromUserId: String? = nil, toUserId: String? = nil, route: String = "") {
        self.conversationId = conversationId
        self.messageId = messageId
        self.fromUserId = fromUserId
        self.toUserId = toUserId
        self.route = route
    }

    /// The push `userInfo` describes (FCM puts its data at the top of the payload), or nil when it
    /// isn't a chat message or names no conversation.
    public init?(userInfo: [AnyHashable: Any]) {
        func value(_ key: String) -> String? {
            (userInfo[key] as? String).flatMap { $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 }
        }
        guard value("type") == Self.type, let conversationId = value("conversationId") else { return nil }
        self.init(conversationId: conversationId, messageId: value("messageId"), fromUserId: value("fromUserId"),
                  toUserId: value("toUserId"), route: value("route") ?? "")
    }

    /// Whether this push may be shown to `signedIn`: the account it was sent to must be the one
    /// signed in. A sign-out whose unregister never reached the server leaves the install
    /// registered to the old account for a while — its messages must not show for whoever is
    /// signed in now, or for nobody.
    public func isFor(_ signedIn: String?) -> Bool {
        guard let signedIn, !signedIn.isEmpty else { return false }
        if let toUserId { return toUserId == signedIn }
        let pair = conversationId.split(separator: "_", omittingEmptySubsequences: false)
        return pair.count == 2 && pair.contains { $0 == signedIn }
    }

    /// Whether the app, open, shows this push: not for a conversation the person is reading right
    /// now (`viewing`, its pair id) — the message is on screen already — nor for another account.
    public func showsWhileOpen(viewing: String?, signedIn: String?) -> Bool {
        isFor(signedIn) && viewing != conversationId
    }
}
