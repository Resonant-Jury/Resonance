import Foundation

/// What the tag field does with the words it is given (TagField.tsx): a comma
/// of either width or the enumeration comma (、) ends a tag, so a pasted list
/// splits in one go, and a tag is trimmed and never added twice. Pure, so the
/// rules are pinned without a keyboard. The twin of Android's TagInput.
/// Nonisolated, since the tag field's Layout calls it off the main actor's turn.
nonisolated enum TagInput {
    private static let separators: Set<Character> = [",", "，", "、"]

    /// The text as typed or pasted, cut at its separators: the words it has
    /// finished (not yet trimmed) and what is still being typed after the last
    /// separator.
    static func split(_ text: String) -> (words: [String], rest: String) {
        guard text.contains(where: separators.contains) else { return ([], text) }
        var words = text.split(omittingEmptySubsequences: false, whereSeparator: separators.contains).map(String.init)
        let rest = words.removeLast()
        return (words, String(rest.drop(while: \.isWhitespace)))
    }

    /// `tags` with `words` added, in order: trimmed, blanks and tags already there left out.
    static func merge(_ tags: [String], _ words: [String]) -> [String] {
        var next = tags
        for word in words {
            let tag = word.trimmingCharacters(in: .whitespacesAndNewlines)
            if !tag.isEmpty, !next.contains(tag) { next.append(tag) }
        }
        return next
    }

    /// One line of the tag field: how many pills it holds and whether the input row ends it.
    nonisolated struct Line: Equatable {
        var pills: Int
        var entry: Bool
    }

    /// Breaks the tag field into lines: pills fill a line in order (a pill that
    /// doesn't fit starts the next; one wider than the field sits alone), and
    /// the input row takes the last line if `entryMin` of it is left, else a
    /// line of its own. The same rule as Android's `breakTagLines`.
    static func breakLines(pillWidths: [CGFloat], entryMin: CGFloat, maxWidth: CGFloat, gap: CGFloat) -> [Line] {
        var lines: [Line] = []
        var count = 0
        var used: CGFloat = 0
        for width in pillWidths {
            let needs = count == 0 ? width : used + gap + width
            if count > 0, needs > maxWidth {
                lines.append(Line(pills: count, entry: false))
                count = 0
            }
            used = count == 0 ? width : used + gap + width
            count += 1
        }
        let needs = count == 0 ? entryMin : used + gap + entryMin
        if count > 0, needs > maxWidth {
            lines.append(Line(pills: count, entry: false))
            lines.append(Line(pills: 0, entry: true))
        } else {
            lines.append(Line(pills: count, entry: true))
        }
        return lines
    }
}
