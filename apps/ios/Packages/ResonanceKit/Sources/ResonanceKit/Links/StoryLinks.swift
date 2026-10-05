import Foundation
import ResonanceAPI

/// The links an author puts in a story, standing alone in a paragraph, drawn as the page's preview
/// card (src/lib/links/storyLinks.ts): the server reads each page once the card is published or
/// edited and keeps what it found on the card (`CardDetail.linkPreviews`, in reading order); the
/// reader finds a paragraph's preview by the paragraph's key — its link as the server writes it
/// (`serverKey`: taken by the rules the chat's links follow, `ChatLinks`, and written as a browser
/// writes it), so the same links are cards on the web and in the app.
///
/// Shared with the web and Android case by case through native/fixtures/story-link-cards.json.
public enum StoryLinks {
    /// The key of a paragraph the story parser found standing alone (`StoryBlock.soleLink`): for an
    /// explicit link, its address as the link rules take it; for a bare address, the one link the
    /// rules find in the words — when it is all of them (`https://example.com很棒` is the link
    /// `https://example.com/` and two more words, so it stays words). Nil when the rules take no
    /// link there (another scheme, a port, a user name, an address in disguise such as `127.1`).
    public static func key(href: String?, text: String) -> String? {
        if let href { return serverKey(href.trimmingCharacters(in: .whitespacesAndNewlines)) }
        let found = ChatLinks.links(in: text)
        guard found.count == 1, let only = found.first, only.range.location == 0, only.range.length == text.utf16.count
        else { return nil }
        return serverKey(only.text)
    }

    /// A link as the server keys it — `normalizeLink` in src/lib/links/url.ts, which is the URL
    /// Standard's `href` (`new URL(…).href`) of what the link rules take — or nil when the rules
    /// take no link there (`ChatLinks.parse`). Written as a browser writes it, not as Foundation
    /// does: scheme and host in lower case, a host written in other letters in punycode (an
    /// explicit link's: the rules find no bare one), the default port dropped (80 on https, or 443
    /// on http, kept as the server keeps it), `.` and `..` segments resolved (`%2e` too), an empty
    /// path `/`, and each part percent-encoded with the Standard's own set — `'` in the query
    /// (`?q=what%27s`) but `{ } | [ ]` left as written there, `{ } ^` and the backtick in the path;
    /// an escape already written is kept as it is.
    public static func serverKey(_ written: String) -> String? {
        var raw = written.lowercased().hasPrefix("www.") ? "https://" + written : written
        guard let schemeEnd = raw.range(of: "://") else { return nil }
        // The host first: an international name in punycode (Foundation's IDNA), so the rules can judge it.
        let afterScheme = raw[schemeEnd.upperBound...]
        let authority = afterScheme[..<(afterScheme.firstIndex { "/?#".contains($0) } ?? afterScheme.endIndex)]
        if !authority.unicodeScalars.allSatisfy(\.isASCII) {
            let colon = authority.lastIndex(of: ":")
            let port = colon.map { String(authority[$0...]) } ?? ""
            guard !authority.contains("@"), let ascii = URL(string: "http://\(authority[..<(colon ?? authority.endIndex)])/")?
                .host(percentEncoded: false), ascii.unicodeScalars.allSatisfy(\.isASCII) else { return nil }
            raw.replaceSubrange(authority.startIndex..<authority.endIndex, with: ascii + port)
        }
        // The server follows 80 and 443 on either scheme and keeps the one that isn't the scheme's own
        // (`https://host:80/`); the chat's rules take a scheme's own port only, so it is set aside for them.
        var keptPort = ""
        let hostStart = raw.range(of: "://")!.upperBound
        let hostEnd = raw[hostStart...].firstIndex { "/?#".contains($0) } ?? raw.endIndex
        if let colon = raw[hostStart..<hostEnd].lastIndex(of: ":"), raw[..<colon].last != "]" {
            let port = raw[raw.index(after: colon)..<hostEnd]
            let own = raw.lowercased().hasPrefix("https:") ? "443" : "80"
            if port != own, port == "80" || port == "443" {
                keptPort = ":" + port
                raw.removeSubrange(colon..<hostEnd)
            }
        }
        guard let parsed = ChatLinks.parse(raw), let scheme = parsed.url.scheme?.lowercased() else { return nil }
        // What follows the host, as written: the path up to `?` or `#`, the query up to `#`, the fragment.
        let rest = raw[raw.range(of: "://")!.upperBound...].drop { !"/?#".contains($0) }
        let hash = rest.firstIndex(of: "#")
        let beforeHash = rest[..<(hash ?? rest.endIndex)]
        let question = beforeHash.firstIndex(of: "?")
        let path = beforeHash[..<(question ?? beforeHash.endIndex)]
        var key = "\(scheme)://\(parsed.host)\(keptPort)\(Self.path(String(path)))"
        if let question { key += "?" + Self.encode(beforeHash[beforeHash.index(after: question)...], keeping: Self.queryKept) }
        if let hash { key += "#" + Self.encode(rest[rest.index(after: hash)...], keeping: Self.fragmentKept) }
        return key.utf16.count <= ChatLinks.maxLength ? key : nil
    }

    /// The path as the Standard serializes it: segments encoded, `.` and `..` resolved, never empty.
    private static func path(_ written: String) -> String {
        var segments: [String] = []
        let parts = written.isEmpty ? [""] : written.dropFirst().split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        for (i, part) in parts.enumerated() {
            let last = i == parts.count - 1
            switch part.lowercased() {
            case "..", ".%2e", "%2e.", "%2e%2e":
                if !segments.isEmpty { segments.removeLast() }
                if last { segments.append("") }
            case ".", "%2e":
                if last { segments.append("") }
            default:
                segments.append(encode(part[...], keeping: pathKept))
            }
        }
        return "/" + segments.joined(separator: "/")
    }

    /// Printable ASCII the Standard leaves as written in each part (its percent-encode sets, inverted).
    private static let pathKept = printable(except: " \"#<>?^`{}")
    private static let queryKept = printable(except: " \"#<>'")
    private static let fragmentKept = printable(except: " \"<>`")

    private static func printable(except: String) -> Set<UInt8> {
        Set((0x21...0x7e).map(UInt8.init)).subtracting(except.utf8)
    }

    private static func encode(_ part: Substring, keeping kept: Set<UInt8>) -> String {
        var out = ""
        for byte in part.utf8 {
            if kept.contains(byte) { out.unicodeScalars.append(Unicode.Scalar(byte)) } else { out += String(format: "%%%02X", byte) }
        }
        return out
    }

    /// A card's previews by key, as the server sent them: each one whose address the link rules
    /// take (it is what a tap opens) and that has a title, its picture only when it is our image
    /// proxy's (`origin` is the API's). The first of any two for one address wins.
    public static func previews(_ sent: [Components.Schemas.LinkPreview]?, origin: URL) -> [String: LinkPreview] {
        var out: [String: LinkPreview] = [:]
        for item in sent ?? [] {
            guard let key = serverKey(item.url), out[key] == nil, let link = ChatLinks.parse(item.url) ?? opened(key),
                  let title = trimmed(item.title) else { continue }
            out[key] = LinkPreview(link: link, title: title, description: trimmed(item.description),
                                                       siteName: trimmed(item.siteName),
                                                       imageURL: ChatMessage.imageURL(item.image, origin: origin))
        }
        return out
    }

    /// What a key the rules took opens, when the chat's own reading of it refuses its port (80 on
    /// https, 443 on http, which the server follows).
    private static func opened(_ key: String) -> ChatLinks.Parsed? {
        guard let url = URL(string: key), let host = url.host(percentEncoded: true) else { return nil }
        return ChatLinks.Parsed(url: url, host: host, suspicious: ChatLinks.isSuspicious(host: host))
    }

    private static func trimmed(_ value: String?) -> String? {
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text
    }
}
