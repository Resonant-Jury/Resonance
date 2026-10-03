import Foundation

/// The links in a chat message, for the thread to make tappable. The rules
/// are the web's `src/lib/links/linkify.ts` and the server's link previews:
///
/// - A link starts at `http://`, `https://` or `www.` (read as `https://www.…`),
///   not in the middle of a word or an address.
/// - It runs to the next whitespace or the first non-ASCII character, so a link
///   written straight before Chinese text ends where the text starts.
/// - Trailing `.,;:!?'…` and a `)` with no `(` before it are not part of it.
/// - Only http and https; no user name or password; no port but the default;
///   a host with a dot in it; at most 2048 characters. Anything else stays text.
///
/// A link to an IP address or a punycode (`xn--`) host is valid but
/// `suspicious`: the reader asks before opening it.
public enum ChatLinks {
    public static let maxLength = 2048

    public struct Link: Equatable, Sendable {
        /// Where the link is in the message (UTF-16 units, as NSRange).
        public let range: NSRange
        /// The text as written.
        public let text: String
        /// The normalized http(s) address.
        public let url: URL
        /// The host in ASCII (punycode for international names).
        public let host: String
        public let suspicious: Bool
    }

    public struct Parsed: Equatable, Sendable {
        public let url: URL
        public let host: String
        public let suspicious: Bool

        public init(url: URL, host: String, suspicious: Bool) {
            self.url = url
            self.host = host
            self.suspicious = suspicious
        }
    }

    // A lookbehind keeps `foowww.x.com` and `me@www.x.com` from starting a link.
    private static let candidate = try! NSRegularExpression(
        pattern: #"(?<![A-Za-z0-9@./_-])(?:https?://|www\.)[[\x{21}-\x{7E}]&&[^<>"]]+"#,
        options: [.caseInsensitive]
    )

    /// Every link in `text`, in order.
    public static func links(in text: String) -> [Link] {
        let whole = NSRange(text.startIndex..., in: text)
        var found: [Link] = []
        let ns = text as NSString
        for match in candidate.matches(in: text, range: whole) {
            let raw = trimTrailing(ns.substring(with: match.range))
            guard let parsed = parse(raw) else { continue }
            found.append(Link(range: NSRange(location: match.range.location, length: (raw as NSString).length),
                              text: raw, url: parsed.url, host: parsed.host, suspicious: parsed.suspicious))
        }
        return found
    }

    /// Normalizes one candidate; nil when it isn't a link we make tappable.
    public static func parse(_ raw: String) -> Parsed? {
        guard raw.count <= maxLength else { return nil }
        let withScheme = raw.lowercased().hasPrefix("www.") ? "https://" + raw : raw
        // Taken apart by hand: Foundation turns a punycode host back into
        // Unicode, and what we show and judge must be the ASCII host.
        guard let schemeEnd = withScheme.range(of: "://") else { return nil }
        let scheme = withScheme[..<schemeEnd.lowerBound].lowercased()
        guard scheme == "http" || scheme == "https" else { return nil }
        let afterScheme = withScheme[schemeEnd.upperBound...]
        let authorityEnd = afterScheme.firstIndex { "/?#".contains($0) } ?? afterScheme.endIndex
        let authority = afterScheme[..<authorityEnd]
        let rest = afterScheme[authorityEnd...]
        guard !authority.contains("@") else { return nil }
        var host = authority.lowercased()
        if !host.hasPrefix("["), let colon = host.lastIndex(of: ":") {
            let port = host[host.index(after: colon)...]
            host = String(host[..<colon])
            // `:443` on https (or `:80` on http) is the default; any other port is odd.
            guard port.isEmpty || port == (scheme == "https" ? "443" : "80") else { return nil }
        }
        guard !host.isEmpty, host.hasPrefix("[") || host.contains(".") else { return nil }
        guard host.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || "-._[]:".contains($0)) }) else { return nil }
        let tail = rest.isEmpty || !rest.hasPrefix("/") ? "/" + rest : String(rest)
        let normalized = "\(scheme)://\(host)\(tail)"
        guard normalized.count <= maxLength, let url = URL(string: normalized), url.scheme == scheme else { return nil }
        return Parsed(url: url, host: host, suspicious: isSuspicious(host: host))
    }

    /// An IP-literal or punycode host: valid, but not a name a reader can vouch for.
    public static func isSuspicious(host: String) -> Bool {
        if host.contains(":") || host.hasPrefix("[") { return true }
        let labels = host.split(separator: ".")
        if labels.count == 4, labels.allSatisfy({ !$0.isEmpty && $0.count <= 3 && $0.allSatisfy(\.isASCIIDigit) }) { return true }
        return labels.contains { $0.lowercased().hasPrefix("xn--") }
    }

    private static func trimTrailing(_ raw: String) -> String {
        var s = Substring(raw)
        while let last = s.last {
            if ".,;:!?'…".contains(last) {
                s.removeLast()
            } else if last == ")", s.filter({ $0 == ")" }).count > s.filter({ $0 == "(" }).count {
                s.removeLast()
            } else {
                break
            }
        }
        return String(s)
    }

    /// A preview's picture path as the server writes it (`/api/link-image?…`),
    /// resolved against the site; nil for anything else, so nothing but our own
    /// image route is ever loaded.
    public static func previewImage(_ path: String?, origin: URL) -> URL? {
        guard let path, path.hasPrefix("/api/link-image?"), let url = URL(string: path, relativeTo: origin)?.absoluteURL,
              url.host == origin.host else { return nil }
        return url
    }
}

private extension Character {
    var isASCIIDigit: Bool { isASCII && isNumber }
}
