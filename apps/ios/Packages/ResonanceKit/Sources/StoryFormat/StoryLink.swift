import Foundation

/// Where a link in a story leads, decided by its scheme — the web reader
/// keeps only safe protocols (react-markdown's default), and so do the apps.
/// A page of the site (a relative link, or http(s) on the site's own host or
/// the one it had before) opens in the app; any other web page opens in the
/// in-app browser; a mailto: link opens Mail. Anything else (tel:, sms:,
/// shortcuts:, another app's own scheme, javascript:) is plain text: the
/// reader never hands it to the system. The twin of Android's StoryLink.
public nonisolated enum StoryLink: Equatable, Sendable {
    /// A page of this site: its path from the root (and its query), resolved
    /// as the web resolves it from a card's page.
    case site(path: String)
    /// A page elsewhere on the web.
    case web(URL)
    /// An email address to write to.
    case mail(URL)

    /// The page a story is read on, which relative links resolve against (`/card/{key}`).
    private static let base = "/card/"

    /// Hosts the site was served from before its own domain, which still serve
    /// it: links written then lead to its pages.
    public static let formerHosts: Set<String> = ["resonance-world.vercel.app"]

    /// Whether `host` (any case, a trailing dot allowed) is the site's: the
    /// origin's, or one it was served from before. Whole names only — a
    /// look-alike such as resonance.channel.example.com is someone else's.
    public static func isSiteHost(_ host: String, origin: URL) -> Bool {
        guard let host = normalized(host) else { return false }
        return host == Self.host(of: origin.absoluteString) || formerHosts.contains(host)
    }

    /// Whether a link can lead anywhere at all: the reader draws the others as plain text.
    public static func isTappable(_ href: String) -> Bool { kind(href) != nil }

    /// Where `href` leads for a reader of the site at `origin`; nil: nowhere.
    public static func resolve(_ href: String, origin: URL) -> StoryLink? {
        let link = href.trimmingCharacters(in: .whitespacesAndNewlines)
        switch kind(link) {
        case .relative:
            return .site(path: sitePath(link))
        case .web:
            let absolute = link.hasPrefix("//") ? "https:" + link : link
            guard let host = host(of: absolute) else { return nil }
            if isSiteHost(host, origin: origin) { return .site(path: sitePath(afterAuthority(absolute))) }
            return URL(string: absolute).map(StoryLink.web)
        case .mail:
            return URL(string: link).map(StoryLink.mail)
        case nil:
            return nil
        }
    }

    private enum Kind { case relative, web, mail }

    private static func kind(_ href: String) -> Kind? {
        let link = href.trimmingCharacters(in: .whitespacesAndNewlines)
        // Nothing to open, or a jump within the page; and control characters or
        // spaces inside a link are how a scheme gets disguised (`java\tscript:`).
        guard !link.isEmpty, !link.hasPrefix("#"),
              !link.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) || CharacterSet.whitespacesAndNewlines.contains($0) })
        else { return nil }
        if let name = scheme(of: link) {
            switch name {
            case "http", "https": return host(of: link) != nil ? .web : nil
            case "mailto": return link.count > "mailto:".count ? .mail : nil
            default: return nil
            }
        }
        if link.hasPrefix("//") { return host(of: "https:" + link) != nil ? .web : nil }
        // A colon before the first slash, without a valid scheme, is no path either (RFC 3986 §4.2).
        if link.prefix(while: { $0 != "/" && $0 != "?" && $0 != "#" }).contains(":") { return nil }
        return .relative
    }

    /// The lowercased scheme (RFC 3986: a letter, then letters, digits, `+`, `-`, `.`), if the link starts with one.
    private static func scheme(of link: String) -> String? {
        guard let colon = link.firstIndex(of: ":") else { return nil }
        let name = link[..<colon]
        guard let first = name.unicodeScalars.first, first.isASCII, CharacterSet.letters.contains(first),
              name.unicodeScalars.allSatisfy({ $0.isASCII && (CharacterSet.alphanumerics.contains($0) || "+-.".unicodeScalars.contains($0)) })
        else { return nil }
        return name.lowercased()
    }

    /// The authority of an absolute URL: up to its path, query or fragment (a backslash counts as a slash, as browsers read it).
    private static func authority(_ url: String) -> Substring? {
        guard let start = url.range(of: "://") else { return nil }
        return url[start.upperBound...].prefix { $0 != "/" && $0 != "\\" && $0 != "?" && $0 != "#" }
    }

    private static func afterAuthority(_ url: String) -> String {
        guard let authority = authority(url) else { return "" }
        return String(url[authority.endIndex...])
    }

    /// The lowercased host, without credentials or port; nil when there is none.
    private static func host(of url: String) -> String? {
        guard let authority = authority(url) else { return nil }
        let hostPort = authority.split(separator: "@", omittingEmptySubsequences: false).last.map(String.init) ?? ""
        let host = hostPort.hasPrefix("[")
            ? String(hostPort.prefix { $0 != "]" }) + "]"
            : String(hostPort.prefix { $0 != ":" })
        return normalized(host)
    }

    /// A host lowercased, without trailing dots; nil when nothing is left.
    private static func normalized(_ host: String) -> String? {
        var trimmed = host.lowercased()
        while trimmed.hasSuffix(".") { trimmed.removeLast() }
        return trimmed.isEmpty ? nil : trimmed
    }

    /// A path (with its query, without its fragment) resolved against the card page and freed of dot segments.
    private static func sitePath(_ ref: String) -> String {
        let bare = ref.prefix { $0 != "#" }
        let path = bare.prefix { $0 != "?" }
        let query = bare.dropFirst(path.count)
        let merged: String
        if path.isEmpty {
            merged = "/"
        } else if path.hasPrefix("/") || path.hasPrefix("\\") {
            merged = String(path)
        } else {
            merged = base + path
        }
        var segments: [Substring] = []
        for segment in merged.replacingOccurrences(of: "\\", with: "/").split(separator: "/", omittingEmptySubsequences: true) {
            switch segment {
            case ".": continue
            case "..": _ = segments.popLast()
            default: segments.append(segment)
            }
        }
        return "/" + segments.joined(separator: "/") + (query.count > 1 ? String(query) : "")
    }
}
