import Foundation

/// Where a search matched: the message and the stretches of its text that match (UTF-16 ranges,
/// in order — they line up with an NSAttributedString of the text).
public struct SearchHit: Equatable, Sendable {
    public let messageId: String
    public let ranges: [NSRange]

    public init(messageId: String, ranges: [NSRange]) {
        self.messageId = messageId
        self.ranges = ranges
    }
}

/// Searching a conversation's messages the way a person types the query: case doesn't matter,
/// and neither does the width of ASCII letters and digits (`ＡＢＣ１２３` finds `abc123` and
/// back — a CJK keyboard types the full-width ones), nor an ideographic space for a plain one.
/// The text is folded one UTF-16 unit at a time, so the hits' ranges are positions in the message
/// as written. The whole query is one phrase; a query that is only spaces matches nothing. The
/// twin of Android's `MessageSearch`.
public enum MessageSearch {
    /// The hits among `messages` (those with text), the newest message first.
    public static func find(_ messages: [ChatMessage], query: String) -> [SearchHit] {
        let needle = fold(query.trimmingCharacters(in: .whitespacesAndNewlines))
        guard !needle.isEmpty else { return [] }
        var hits: [SearchHit] = []
        for message in messages.reversed() where !message.text.isEmpty {
            let found = ranges(of: needle, in: fold(message.text))
            if !found.isEmpty { hits.append(SearchHit(messageId: message.id, ranges: found)) }
        }
        return hits
    }

    /// Every non-overlapping match of the (already folded) `needle` in the (already folded) `haystack`.
    static func ranges(of needle: [UInt16], in haystack: [UInt16]) -> [NSRange] {
        guard !needle.isEmpty, needle.count <= haystack.count else { return [] }
        var out: [NSRange] = []
        var at = 0
        while at + needle.count <= haystack.count {
            if haystack[at] == needle[0], haystack[at..<(at + needle.count)].elementsEqual(needle) {
                out.append(NSRange(location: at, length: needle.count))
                at += needle.count
            } else {
                at += 1
            }
        }
        return out
    }

    /// One unit in, one out (so positions stay put): lower case, full-width ASCII to plain, the
    /// ideographic space to a space. A letter whose lower case is longer than itself keeps the
    /// first letter of it (`İ` → `i`), as a simple case mapping does.
    static func fold(_ text: String) -> [UInt16] {
        text.utf16.map { unit in
            switch unit {
            case 0xFF01...0xFF5E: return lower(unit - 0xFEE0)
            case 0x3000: return 0x20
            default: return lower(unit)
            }
        }
    }

    private static func lower(_ unit: UInt16) -> UInt16 {
        if (0x41...0x5A).contains(unit) { return unit + 0x20 }
        guard unit >= 0x80, let scalar = Unicode.Scalar(unit), let first = scalar.properties.lowercaseMapping.unicodeScalars.first,
              first.utf16.count == 1 else { return unit }
        return first.utf16.first ?? unit
    }
}

/// The line a search result shows for a message: a stretch of its text with the first match near
/// the front, cut with "…" where the message goes on, and the matches that fall inside it
/// (`ranges`, UTF-16 ranges into `text`). The twin of Android's `SearchSnippet`.
public struct SearchSnippet: Equatable, Sendable {
    /// How much of a message a result shows at most (two short lines).
    public static let maxLength = 96
    /// How much of the text before the first match is kept, so the match isn't pushed off the first line.
    public static let lead = 14

    public let text: String
    public let ranges: [NSRange]

    public init(text: String, ranges: [NSRange]) {
        self.text = text
        self.ranges = ranges
    }

    private static let ellipsis: UInt16 = 0x2026

    /// A message's `text` cut around the first of its `ranges` (the matches, in order).
    public static func of(_ text: String, ranges: [NSRange], maxLength: Int = maxLength) -> SearchSnippet {
        // A result is a line or two, not the message's own paragraphs.
        let flat = text.utf16.map { $0 == 0x0A || $0 == 0x0D ? 0x20 : $0 }
        guard flat.count > maxLength else { return SearchSnippet(text: string(flat), ranges: ranges) }
        guard let first = ranges.first else { return SearchSnippet(text: string(cut(flat, to: maxLength)) + "…", ranges: []) }
        var from = max(first.location - lead, 0)
        // Never open on the second half of a surrogate pair.
        if from > 0, UTF16.isTrailSurrogate(flat[from]) { from -= 1 }
        var to = min(from + maxLength, flat.count)
        // A match longer than the window still shows its beginning in full.
        if to <= first.location { to = min(first.location + 1, flat.count) }
        if to < flat.count, UTF16.isLeadSurrogate(flat[to - 1]) { to -= 1 }
        let head = from > 0 ? 1 : 0
        let shown: [UInt16] = (head == 1 ? [ellipsis] : []) + Array(flat[from..<to]) + (to < flat.count ? [ellipsis] : [])
        let shifted = ranges.compactMap { r -> NSRange? in
            let start = max(r.location, from), end = min(NSMaxRange(r), to)
            guard end > start else { return nil }
            return NSRange(location: start - from + head, length: end - start)
        }
        return SearchSnippet(text: string(shown), ranges: shifted)
    }

    private static func cut(_ units: [UInt16], to end: Int) -> [UInt16] {
        var end = end
        if end < units.count, end > 0, UTF16.isLeadSurrogate(units[end - 1]) { end -= 1 }
        return Array(units[..<end])
    }

    private static func string(_ units: [UInt16]) -> String {
        String(decoding: units, as: UTF16.self)
    }
}
