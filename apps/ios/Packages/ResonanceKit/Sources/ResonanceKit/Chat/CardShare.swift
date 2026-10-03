import Foundation

/// A Resonance card a message shares, which the thread draws as the card's own bubble (the way
/// Messenger draws a shared post): one shared with the card button (`cardRef`), or a link to a
/// card's page written in the message.
public struct CardShare: Equatable, Sendable {
    /// What the card is looked up by (GET /api/v1/cards?keys=): the id the card button shared, or
    /// the slug (or id) in the link's path.
    public let key: String
    /// The link it was written as; nil for a card shared with the card button. Should the reader
    /// not be allowed to see the card, the message falls back to this link (and its preview).
    public let link: ChatLinks.Parsed?
    /// The message's words besides that link, trimmed: what the bubble shows above the card
    /// (empty when the link was all it said). For a card shared with the button, all its words.
    public let text: String

    public init(key: String, link: ChatLinks.Parsed?, text: String) {
        self.key = key
        self.link = link
        self.text = text
    }
}

/// Links to a card's page on the site: `/card/{key}`, under `/en` or `/zh-TW` or neither, on the
/// site's host (with or without www), the host it was served from before, or — in an emulator
/// build — the app's own API origin.
public enum CardLinks {
    public static let hosts: Set<String> = ["resonance.channel", "www.resonance.channel", "resonance-world.vercel.app"]
    private static let locales: Set<String> = ["en", "zh-TW"]

    /// The card a link leads to (its slug or id, as written in the path), or nil for any other page.
    public static func cardKey(_ url: URL, origin: URL? = nil) -> String? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = url.host()?.lowercased(), isSite(host: host, port: url.port, scheme: scheme, origin: origin),
              let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath else { return nil }
        var parts = path.split(separator: "/").map(String.init)
        if let first = parts.first, locales.contains(first) { parts.removeFirst() }
        guard parts.count == 2, parts[0] == "card", let key = parts[1].removingPercentEncoding, CardKey.isValid(key) else { return nil }
        return key
    }

    private static func isSite(host: String, port: Int?, scheme: String, origin: URL?) -> Bool {
        if hosts.contains(host) { return port == nil || port == (scheme == "https" ? 443 : 80) }
        guard let origin, let own = origin.host()?.lowercased() else { return false }
        return host == own && port == origin.port
    }
}

extension ChatMessage {
    /// The card this message shares, if it shares one: its `cardRef`, else the card its link
    /// preview is of, else the card its first link leads to (the link the server previews).
    /// `origin` is the API's, whose host counts as the site's in an emulator build.
    public func cardShare(origin: URL? = nil) -> CardShare? {
        if let cardRef { return CardShare(key: cardRef, link: nil, text: text.trimmingCharacters(in: .whitespacesAndNewlines)) }
        let links = ChatLinks.links(in: text)
        if let preview, let key = CardLinks.cardKey(preview.url, origin: origin) {
            let written = links.first { $0.url == preview.url }
            return CardShare(key: key, link: preview.link,
                             text: written.map { Self.text(text, without: $0.range) } ?? text.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        guard let first = links.first, let key = CardLinks.cardKey(first.url, origin: origin) else { return nil }
        return CardShare(key: key, link: ChatLinks.Parsed(url: first.url, host: first.host, suspicious: first.suspicious),
                         text: Self.text(text, without: first.range))
    }

    /// `text` with the stretch `range` (UTF-16) taken out: the words on either side meet again
    /// across a space, or a line break when the link stood on a line of its own.
    static func text(_ text: String, without range: NSRange) -> String {
        let units = Array(text.utf16)
        guard range.location >= 0, NSMaxRange(range) <= units.count else { return text }
        let before = String(decoding: units[..<range.location], as: UTF16.self)
        let after = String(decoding: units[NSMaxRange(range)...], as: UTF16.self)
        let head = before.trimmingTrailingWhitespace, tail = after.trimmingLeadingWhitespace
        guard !head.isEmpty, !tail.isEmpty else { return (head + tail).trimmingCharacters(in: .whitespacesAndNewlines) }
        let onItsOwnLine = before.dropFirst(head.count).contains(where: \.isNewline) || after.prefix(after.count - tail.count).contains(where: \.isNewline)
        return (head + (onItsOwnLine ? "\n" : " ") + tail).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private extension String {
    var trimmingTrailingWhitespace: String {
        String(reversed().drop(while: \.isWhitespace).reversed())
    }

    var trimmingLeadingWhitespace: String {
        String(drop(while: \.isWhitespace))
    }
}
