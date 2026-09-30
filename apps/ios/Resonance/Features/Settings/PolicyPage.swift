import Foundation
import ResonanceKit

/// The site's policy pages, which settings' Terms section links to (the web
/// list is privacy, terms, contact → /{locale}/support). The apps show the
/// live pages: the configured origin plus the locale-prefixed path.
enum PolicyPage: CaseIterable {
    case privacy, terms, support

    /// The footer label the web's link carries.
    var label: String {
        switch self {
        case .privacy: L10n.Footer.privacy
        case .terms: L10n.Footer.terms
        case .support: L10n.Footer.contact
        }
    }

    private var segment: String {
        switch self {
        case .privacy: "privacy"
        case .terms: "terms"
        case .support: "support"
        }
    }

    /// The web link's `href`: `/zh-TW/privacy`, `/en/support`.
    func path(_ language: Strings.Language) -> String { "/\(language.rawValue)/\(segment)" }

    func url(origin: URL, language: Strings.Language) -> URL {
        origin.appending(path: path(language))
    }
}
