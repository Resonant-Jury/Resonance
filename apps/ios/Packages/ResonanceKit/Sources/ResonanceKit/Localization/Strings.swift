import Foundation

/// The web's message catalogs (src/messages/*.json, bundled unchanged) and
/// the small slice of ICU MessageFormat they use: `{name}` arguments and
/// `{count, plural, =0 {…} one {…} other {…}}` with `#`. Use the generated
/// `L10n` accessors instead of calling this with raw keys.
public final class Strings: @unchecked Sendable {
    public enum Language: String, CaseIterable, Sendable {
        case en
        case zhTW = "zh-TW"

        /// The system's preferred language, mapped onto the two the site has.
        public static func preferred(_ languages: [String] = Locale.preferredLanguages) -> Language {
            for tag in languages {
                if tag.hasPrefix("zh") { return .zhTW }
                if tag.hasPrefix("en") { return .en }
            }
            return .en
        }
    }

    public static let shared = Strings()

    private let lock = NSLock()
    private var catalogs: [Language: [String: String]] = [:]
    private var _language: Language

    public var language: Language {
        get { lock.withLock { _language } }
        set { lock.withLock { _language = newValue } }
    }

    public init(language: Language = .preferred()) {
        _language = language
    }

    /// Loads `en.json` and `zh-TW.json` from `bundle` (the app target bundles
    /// src/messages as-is), or from `directory` in tests.
    public func load(bundle: Bundle = .main, directory: URL? = nil) {
        var loaded: [Language: [String: String]] = [:]
        for lang in Language.allCases {
            let url = directory?.appendingPathComponent("\(lang.rawValue).json")
                ?? bundle.url(forResource: lang.rawValue, withExtension: "json")
            guard let url, let data = try? Data(contentsOf: url),
                  let tree = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            loaded[lang] = Self.flatten(tree)
        }
        lock.withLock { catalogs = loaded }
    }

    /// The message for `key` in the current language, falling back to English,
    /// then to the key itself (never crashes on a missing string).
    public func string(_ key: String) -> String {
        lock.withLock {
            catalogs[_language]?[key] ?? catalogs[.en]?[key] ?? key
        }
    }

    public func format(_ key: String, _ args: [String: any Sendable]) -> String {
        MessageFormat.format(string(key), args: args, language: language)
    }

    static func flatten(_ tree: [String: Any], prefix: String = "") -> [String: String] {
        var out: [String: String] = [:]
        for (key, value) in tree {
            let path = prefix.isEmpty ? key : "\(prefix).\(key)"
            if let s = value as? String { out[path] = s }
            else if let sub = value as? [String: Any] { out.merge(flatten(sub, prefix: path)) { a, _ in a } }
        }
        return out
    }
}

/// The ICU MessageFormat subset the catalogs use (scripts/apps/l10n.ts
/// refuses anything else when it generates the accessors).
public enum MessageFormat {
    public static func format(_ pattern: String, args: [String: any Sendable], language: Strings.Language) -> String {
        var out = ""
        var i = pattern.startIndex
        while i < pattern.endIndex {
            let c = pattern[i]
            guard c == "{" else {
                out.append(c)
                i = pattern.index(after: i)
                continue
            }
            guard let close = matchingBrace(pattern, from: i) else {
                out.append(contentsOf: pattern[i...])
                break
            }
            let body = String(pattern[pattern.index(after: i)..<close])
            out += argument(body, args: args, language: language)
            i = pattern.index(after: close)
        }
        return out
    }

    private static func matchingBrace(_ s: String, from open: String.Index) -> String.Index? {
        var depth = 0
        var i = open
        while i < s.endIndex {
            if s[i] == "{" { depth += 1 }
            if s[i] == "}" {
                depth -= 1
                if depth == 0 { return i }
            }
            i = s.index(after: i)
        }
        return nil
    }

    private static func argument(_ body: String, args: [String: any Sendable], language: Strings.Language) -> String {
        let parts = body.split(separator: ",", maxSplits: 2, omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespaces) }
        let name = parts[0]
        guard parts.count == 3, parts[1] == "plural" else {
            return args[name].map { "\($0)" } ?? "{\(name)}"
        }
        let n = (args[name] as? Int) ?? Int("\(args[name] ?? 0)") ?? 0
        let branches = pluralBranches(parts[2])
        let chosen = branches["=\(n)"] ?? branches[category(n, language)] ?? branches["other"] ?? ""
        // `#` is the count; nested arguments are formatted too.
        return format(chosen.replacingOccurrences(of: "#", with: "\(n)"), args: args, language: language)
    }

    /// `=0 {…} one {…} other {…}` → selector: text.
    private static func pluralBranches(_ s: String) -> [String: String] {
        var out: [String: String] = [:]
        var i = s.startIndex
        while i < s.endIndex {
            while i < s.endIndex, s[i].isWhitespace { i = s.index(after: i) }
            guard let open = s[i...].firstIndex(of: "{"), let close = matchingBrace(s, from: open) else { break }
            let selector = s[i..<open].trimmingCharacters(in: .whitespaces)
            out[selector] = String(s[s.index(after: open)..<close])
            i = s.index(after: close)
        }
        return out
    }

    /// CLDR plural category for the site's two languages.
    static func category(_ n: Int, _ language: Strings.Language) -> String {
        switch language {
        case .en: n == 1 ? "one" : "other"
        case .zhTW: "other"
        }
    }
}
