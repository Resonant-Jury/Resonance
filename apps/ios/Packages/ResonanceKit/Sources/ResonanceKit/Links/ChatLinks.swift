import Foundation

/// The links in a chat message, for the thread to make tappable. Which words
/// are a link follows the server's rules word for word (`findLinks` in
/// src/lib/links/url.ts, which also picks the link a message is previewed
/// for; the web's `linkify.ts` and Android's `Linkify` mirror it too):
///
/// - A link starts at `http://`, `https://` or `www.` (read as `https://www.…`),
///   not straight after a letter, digit or one of `. - _ @ / % \`.
/// - It ends at white space, a control character, one of `< > " ` \ ^`, CJK or
///   full-width punctuation, curly quotes, the ellipsis, an arrow, symbol or
///   emoji. The host is ASCII only (`https://example.com很棒` ends at `.com`);
///   a path may hold CJK letters (`/wiki/中文`).
/// - Trimmed from the end: `. , ; : ! ? ' " * ~`, and a `)`, `]` or `}` with no
///   opener in the link.
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

    /// Characters that may not stand directly before a link's first letter.
    private static let notBefore = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._@/%\\-".unicodeScalars)
    /// Trailing punctuation that belongs to the sentence, not the link.
    private static let trailing = Set(".,;:!?'\"*~".unicodeScalars)
    private static let pairs: [Unicode.Scalar: Unicode.Scalar] = [")": "(", "]": "[", "}": "{"]

    /// Every link in `text`, in order.
    public static func links(in text: String) -> [Link] {
        let scalars = Array(text.unicodeScalars)
        // UTF-16 offset of each scalar, so ranges line up with an NSAttributedString.
        var offsets = [Int](repeating: 0, count: scalars.count + 1)
        for (i, c) in scalars.enumerated() { offsets[i + 1] = offsets[i] + c.utf16.count }
        var found: [Link] = []
        var i = 0
        while i < scalars.count {
            guard let schemeLength = schemeLength(scalars, at: i) else {
                i += 1
                continue
            }
            let end = linkEnd(scalars, start: i, schemeLength: schemeLength)
            defer { i = max(end, i + schemeLength) } // a link inside another's query is not a second link
            if i > 0, notBefore.contains(scalars[i - 1]) { continue }
            var written = String.UnicodeScalarView()
            written.append(contentsOf: scalars[i..<end])
            let raw = String(written)
            guard let parsed = parse(raw) else { continue }
            found.append(Link(range: NSRange(location: offsets[i], length: offsets[end] - offsets[i]),
                              text: raw, url: parsed.url, host: parsed.host, suspicious: parsed.suspicious))
        }
        return found
    }

    /// `http://`, `https://` or `www.` (any case) starting at `i`: its length.
    private static func schemeLength(_ s: [Unicode.Scalar], at i: Int) -> Int? {
        func matches(_ word: String) -> Bool {
            let w = Array(word.unicodeScalars)
            guard i + w.count <= s.count else { return false }
            return (0..<w.count).allSatisfy { String(s[i + $0]).lowercased() == String(w[$0]) }
        }
        for word in ["https://", "http://", "www."] where matches(word) { return word.unicodeScalars.count }
        return nil
    }

    /// Whether this code point ends a link (url.ts `endsLink`).
    private static func endsLink(_ c: Unicode.Scalar) -> Bool {
        let cp = c.value
        if cp <= 0x20 || (0x7f...0x9f).contains(cp) { return true }
        if [0x3c, 0x3e, 0x22, 0x60, 0x5c, 0x5e, 0xa0, 0xab, 0xbb, 0x1680, 0x2028, 0x2029, 0x2026, 0x202f, 0x205f, 0xfeff].contains(cp) { return true }
        let ranges: [ClosedRange<UInt32>] = [0x2000...0x200f, 0x2018...0x201f, 0x2190...0x2bff, 0x3000...0x303f,
                                              0xfe00...0xfe0f, 0xfe30...0xfe6f, 0xff00...0xffef, 0x1f000...0x1ffff]
        return ranges.contains { $0.contains(cp) }
    }

    /// Where the link starting at `start` stops (url.ts `linkEnd`).
    private static func linkEnd(_ s: [Unicode.Scalar], start: Int, schemeLength: Int) -> Int {
        var i = start + schemeLength
        var inHost = true
        while i < s.count {
            let c = s[i]
            if endsLink(c) { break }
            if inHost {
                if c == "/" || c == "?" || c == "#" { inHost = false } else if c.value > 0x7f { break }
            }
            i += 1
        }
        while i - start > schemeLength {
            let last = s[i - 1]
            if trailing.contains(last) {
                i -= 1
                continue
            }
            if let opener = pairs[last] {
                let slice = s[start..<i]
                if slice.filter({ $0 == last }).count > slice.filter({ $0 == opener }).count {
                    i -= 1
                    continue
                }
            }
            break
        }
        return i
    }

    /// Normalizes one candidate; nil when it isn't a link we make tappable.
    public static func parse(_ raw: String) -> Parsed? {
        guard raw.utf16.count <= maxLength, !raw.contains("\\"),
              !raw.unicodeScalars.contains(where: { $0.value <= 0x20 || (0x7f...0x9f).contains($0.value) }) else { return nil }
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
        guard validHost(host) else { return nil }
        let tail = rest.isEmpty || !rest.hasPrefix("/") ? "/" + rest : String(rest)
        let normalized = "\(scheme)://\(host)\(tail)"
        guard normalized.count <= maxLength, let url = URL(string: normalized), url.scheme == scheme else { return nil }
        return Parsed(url: url, host: host, suspicious: isSuspicious(host: host))
    }

    /// A host name as the server's rules take it (Android's `validHost`): two or more labels of
    /// `a–z 0–9 - _`, none empty, over 63 or edged with `-`; no IPv6 literal. A last label that is a
    /// number makes the whole host an address — browsers read `127.1` and `0x7f.1` as 127.0.0.1 — so
    /// then only a plain dotted quad is kept (and it is `suspicious`).
    static func validHost(_ host: String) -> Bool {
        guard !host.isEmpty, host.count <= 253 else { return false }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard labels.count >= 2 else { return false }
        for label in labels {
            guard !label.isEmpty, label.count <= 63, !label.hasPrefix("-"), !label.hasSuffix("-"),
                  label.allSatisfy({ ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "-" || $0 == "_" }) else { return false }
        }
        if let last = labels.last, isNumber(last) { return isDottedQuad(labels) }
        return true
    }

    private static func isNumber(_ label: String) -> Bool {
        guard !label.isEmpty else { return false }
        if label.allSatisfy(\.isASCIIDigit) { return true }
        return label.hasPrefix("0x") && label.dropFirst(2).allSatisfy { $0.isHexDigit && $0.isASCII }
    }

    private static func isDottedQuad(_ labels: [String]) -> Bool {
        labels.count == 4 && labels.allSatisfy { l in
            (1...3).contains(l.count) && l.allSatisfy(\.isASCIIDigit) && (l == "0" || !l.hasPrefix("0")) && (Int(l) ?? 256) <= 255
        }
    }

    /// An IP-literal or punycode host: valid, but not a name a reader can vouch for.
    public static func isSuspicious(host: String) -> Bool {
        if host.contains(":") || host.hasPrefix("[") { return true }
        let labels = host.split(separator: ".")
        if labels.count == 4, labels.allSatisfy({ !$0.isEmpty && $0.count <= 3 && $0.allSatisfy(\.isASCIIDigit) }) { return true }
        return labels.contains { $0.lowercased().hasPrefix("xn--") }
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
