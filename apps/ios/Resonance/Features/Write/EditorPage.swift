import CryptoKit
import Foundation
import WebKit

/// Where the story editor island lives inside its web view, and all it may
/// reach from there.
///
/// The page is served from the app bundle under a scheme of its own
/// (`resonance-editor://editor/editor.html`) by `EditorPageHandler`, which
/// answers for the page and its four fonts and nothing else — loaded as a
/// `file://` URL, the page could read anything in the bundle. Its
/// Content-Security-Policy lets it run only its own two inline scripts (by
/// hash), load only its own fonts and show https, data and blob images; it
/// can't fetch, frame, post a form or change its base URL. `EditorNavigation`
/// keeps the web view on the page.
enum EditorPage {
    static let scheme = "resonance-editor"
    static let host = "editor"
    static let path = "/editor.html"
    /// The fonts the page's @font-face rules name (scripts/native/build-editor.mjs), in the bundle's fonts/.
    static let fonts: Set<String> = ["PlayfairDisplay.ttf", "DMSans.ttf", "NotoSansTC.ttf", "NotoSerifTC.ttf"]

    /// The page, as the writing screen embeds it.
    static func url(placeholder: String) -> URL {
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.path = path
        components.queryItems = [
            URLQueryItem(name: "embed", value: "1"),
            URLQueryItem(name: "fonts", value: "fonts/"),
            URLQueryItem(name: "placeholder", value: placeholder),
        ]
        return components.url!
    }

    /// Whether `url` is the page itself (any query).
    static func isPage(_ url: URL) -> Bool {
        url.scheme?.lowercased() == scheme && url.host?.lowercased() == host && url.path == path
    }

    /// The policy for `html`: only its own inline scripts run.
    static func contentSecurityPolicy(for html: String) -> String {
        let scripts = inlineScripts(in: html).map { "'sha256-\(Data(SHA256.hash(data: Data($0.utf8))).base64EncodedString())'" }
        return [
            "default-src 'none'",
            "script-src \(scripts.isEmpty ? "'none'" : scripts.joined(separator: " "))",
            // The font loader's <style>, ProseMirror's and the island's inline styles.
            "style-src 'unsafe-inline'",
            "font-src \(scheme):",
            // Story photos (R2, over https); pasted or dropped ones may be data: or blob:.
            "img-src https: data: blob:",
            "base-uri 'none'",
            "form-action 'none'",
        ].joined(separator: "; ")
    }

    /// The text of each `<script>` without attributes (the build inlines both of its scripts so).
    static func inlineScripts(in html: String) -> [String] {
        var scripts: [String] = []
        var rest = html[...]
        while let open = rest.range(of: "<script>"), let close = rest.range(of: "</script>", range: open.upperBound..<rest.endIndex) {
            scripts.append(String(rest[open.upperBound..<close.lowerBound]))
            rest = rest[close.upperBound...]
        }
        return scripts
    }

    /// The page as served: its policy also as a meta element, ahead of anything that runs.
    static func served(_ html: String, policy: String) -> String {
        let meta = #"<meta http-equiv="Content-Security-Policy" content="\#(policy)">"#
        guard let head = html.range(of: "<head>") else { return meta + html }
        return html.replacingCharacters(in: head, with: "<head>\n" + meta)
    }
}

/// Answers the editor page's requests from the app bundle: the page (with
/// its policy) and its fonts. Anything else it asks for doesn't exist.
final class EditorPageHandler: NSObject, WKURLSchemeHandler {
    struct Resource {
        let data: Data
        let headers: [String: String]
    }

    private let bundle: Bundle

    init(bundle: Bundle = .main) {
        self.bundle = bundle
    }

    /// The page, read and hashed once.
    private lazy var page: Resource? = {
        guard let file = bundle.url(forResource: "editor", withExtension: "html"),
              let html = try? String(contentsOf: file, encoding: .utf8) else { return nil }
        let policy = EditorPage.contentSecurityPolicy(for: html)
        return Resource(data: Data(EditorPage.served(html, policy: policy).utf8), headers: [
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": policy,
            "Cache-Control": "no-store",
        ])
    }()

    /// What `url` names, if it's something the page may load.
    func resource(for url: URL) -> Resource? {
        guard url.scheme?.lowercased() == EditorPage.scheme, url.host?.lowercased() == EditorPage.host else { return nil }
        if url.path == EditorPage.path { return page }
        let parts = url.path.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].isEmpty, parts[1] == "fonts", EditorPage.fonts.contains(String(parts[2])),
              let file = bundle.url(forResource: String(parts[2]), withExtension: nil, subdirectory: "fonts"),
              let data = try? Data(contentsOf: file, options: .mappedIfSafe) else { return nil }
        return Resource(data: data, headers: ["Content-Type": "font/ttf", "Cache-Control": "no-store"])
    }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url, let resource = resource(for: url),
              let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: resource.headers) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        task.didReceive(response)
        task.didReceive(resource.data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

/// Where the editor's web view may go: nowhere but its page. A web link the
/// writer taps in the story (the editor opens it as the web's does) shows in
/// the in-app browser; anything else — a script sending the page away, a
/// frame, a file — is refused.
enum EditorNavigation: Equatable {
    case allow
    case cancel
    case openInBrowser(URL)

    /// - Parameters:
    ///   - mainFrame: the navigation is the page's own (not a frame's).
    ///   - tapped: the writer asked for it (a link they tapped, a window the editor opened for a tap).
    static func decide(_ url: URL?, mainFrame: Bool, tapped: Bool) -> EditorNavigation {
        guard let url else { return .cancel }
        if EditorPage.isPage(url) { return mainFrame ? .allow : .cancel }
        let scheme = url.scheme?.lowercased()
        if tapped, scheme == "http" || scheme == "https", url.host?.isEmpty == false { return .openInBrowser(url) }
        return .cancel
    }
}
