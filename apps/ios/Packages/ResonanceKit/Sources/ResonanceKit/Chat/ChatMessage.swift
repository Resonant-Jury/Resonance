import Foundation

/// Where a message of this person's own stands: `delivered` is a document the conversation
/// holds; the rest are still on their way. The twin of Android's `Delivery`.
public enum Delivery: Equatable, Sendable {
    /// A document of the conversation (read from Firestore).
    case delivered
    /// Waiting in the outbox, or being sent.
    case sending
    /// The server took it; the conversation's listener hasn't shown it yet (drawn as delivered,
    /// but it can't be replied to yet).
    case sent
    /// The server refused it, or the network did: it stays in the thread with a retry until the
    /// person retries or deletes it.
    case failed
}

/// What a reply carries of the message it answers (the server's `replyTo` snapshot, kept on the
/// reply): the quote is read from here, never from the original, which may be far up the thread
/// or gone. `text` is at most `maxText` code points; empty when the original was a card alone.
public struct ReplyQuote: Equatable, Hashable, Sendable {
    public static let maxText = 140

    public let id: String
    public let senderId: String
    public let text: String
    public let cardRef: String?

    public init(id: String, senderId: String, text: String, cardRef: String? = nil) {
        self.id = id
        self.senderId = senderId
        self.text = text
        self.cardRef = cardRef
    }

    /// The quote a reply to `message` carries (the same cut the server makes).
    public static func of(_ message: ChatMessage) -> ReplyQuote {
        ReplyQuote(id: message.id, senderId: message.senderId, text: cut(message.text), cardRef: message.cardRef)
    }

    /// At most `maxText` code points (Unicode scalars, so never half of a surrogate pair).
    public static func cut(_ text: String) -> String {
        let scalars = text.unicodeScalars
        guard scalars.count > maxText else { return text }
        var out = String.UnicodeScalarView()
        out.append(contentsOf: scalars.prefix(maxText))
        return String(out)
    }
}

/// The unfurled page of the first link in a message, which the server writes a moment after the
/// message itself (so a message is drawn without it and again when it arrives). `link` is the
/// address as `ChatLinks.parse` accepted it — what a tap opens, with the ASCII host to show and
/// whether to ask first. `imageURL` is the server's site-relative `/api/link-image?…` path
/// resolved against the API's origin, and only ever a picture of that proxy.
public struct LinkPreview: Equatable, Sendable {
    public let link: ChatLinks.Parsed
    public let title: String
    public let description: String?
    public let siteName: String?
    public let imageURL: URL?

    public init(link: ChatLinks.Parsed, title: String, description: String? = nil, siteName: String? = nil, imageURL: URL? = nil) {
        self.link = link
        self.title = title
        self.description = description
        self.siteName = siteName
        self.imageURL = imageURL
    }

    /// The normalized http(s) address of the page.
    public var url: URL { link.url }
}

/// One message of a conversation as the thread draws it (a document of
/// `conversations/{pair}/messages`, or one of this person's own still on its way). The twin of
/// Android's `ChatMessage`.
///
/// `key` is the identity a list keeps a row by: the id, except that a message sent from here
/// keeps the key it had while it was sending (the client id), so the row doesn't jump when the
/// document replaces it. `id` is the document's id; for a message still on its way it is the
/// client id, which the server uses as the document id.
public struct ChatMessage: Equatable, Sendable {
    public let id: String
    public let senderId: String
    public let text: String
    public let sentAt: Date
    public let cardRef: String?
    public let noteRef: MessagingAPI.NoteRef?
    /// A note left on a card (`kind: 'note'`), which the server copies into the conversation: its
    /// `cardRef` is the card it was left on — the note's author's words to that card's author — and
    /// the thread draws that card above the words, the way a reply draws its quote. Any other kind
    /// the server may add one day reads as a plain message.
    public let isNote: Bool
    /// The message this one answers, as it read when the reply was sent.
    public var replyTo: ReplyQuote?
    /// The first link's page; the server writes it a moment after the message.
    public var preview: LinkPreview?
    public var delivery: Delivery
    public var key: String

    public init(id: String, senderId: String, text: String, sentAt: Date, cardRef: String? = nil, noteRef: MessagingAPI.NoteRef? = nil,
                isNote: Bool = false, replyTo: ReplyQuote? = nil, preview: LinkPreview? = nil, delivery: Delivery = .delivered,
                key: String? = nil) {
        self.id = id
        self.senderId = senderId
        self.text = text
        self.sentAt = sentAt
        self.cardRef = cardRef
        self.noteRef = noteRef
        self.isNote = isNote
        self.replyTo = replyTo
        self.preview = preview
        self.delivery = delivery
        self.key = key ?? id
    }

    /// Still on its way, or failed: nothing is known of it by the server (yet).
    public var isPending: Bool { delivery != .delivered }
    /// A reply names a document of the conversation, so only delivered messages can be replied to.
    public var canReply: Bool { delivery == .delivered }

    /// Oldest first: the send time, then the id (messages sent in the same instant keep a stable order).
    public static func isOrderedBefore(_ a: ChatMessage, _ b: ChatMessage) -> Bool {
        a.sentAt != b.sentAt ? a.sentAt < b.sentAt : a.id < b.id
    }

    /// A message document's fields as Firestore returns them (maps and strings), with its id and
    /// its send time (read with the estimate for a server time still pending). `origin` is the
    /// API's — a preview's picture is a path of it. Missing or odd fields leave a message without
    /// that part; none of them fails it.
    public static func from(id: String, fields: [String: Any], sentAt: Date, origin: URL) -> ChatMessage {
        let note = fields["noteRef"] as? [String: Any]
        let noteRef = (note?["cardId"] as? String).flatMap { card in
            (note?["noteId"] as? String).map { MessagingAPI.NoteRef(cardId: card, noteId: $0) }
        }
        let cardRef = (fields["cardRef"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        return ChatMessage(
            id: id,
            senderId: fields["senderId"] as? String ?? "",
            text: fields["text"] as? String ?? "",
            sentAt: sentAt,
            cardRef: cardRef,
            noteRef: noteRef,
            // A note without the card it was left on would be about nothing: drawn as plain words.
            isNote: fields["kind"] as? String == "note" && cardRef != nil,
            replyTo: quote(fields["replyTo"] as? [String: Any]),
            preview: preview(fields["preview"] as? [String: Any], origin: origin)
        )
    }

    private static func quote(_ map: [String: Any]?) -> ReplyQuote? {
        guard let map, let id = map["id"] as? String, !id.isEmpty else { return nil }
        return ReplyQuote(id: id, senderId: map["senderId"] as? String ?? "", text: ReplyQuote.cut(map["text"] as? String ?? ""),
                          cardRef: (map["cardRef"] as? String).flatMap { $0.isEmpty ? nil : $0 })
    }

    private static func preview(_ map: [String: Any]?, origin: URL) -> LinkPreview? {
        // The address is what a tap opens: only one the link rules accept (http(s), no userinfo, a real host).
        guard let map, let link = (map["url"] as? String).flatMap(ChatLinks.parse),
              let title = trimmed(map["title"]) else { return nil }
        return LinkPreview(link: link, title: title, description: trimmed(map["description"]), siteName: trimmed(map["siteName"]),
                           imageURL: imageURL(map["image"] as? String, origin: origin))
    }

    private static func trimmed(_ value: Any?) -> String? {
        guard let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text
    }

    /// The server writes the picture as a path of its own image proxy; anything else (another
    /// host, a plain address, a path elsewhere on the site, a path with spaces or control
    /// characters) is no picture of ours, and nothing is requested for it.
    static func imageURL(_ path: String?, origin: URL) -> URL? {
        guard let path, path.utf16.count <= 4096,
              !path.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) })
        else { return nil }
        return ChatLinks.previewImage(path, origin: origin)
    }
}
