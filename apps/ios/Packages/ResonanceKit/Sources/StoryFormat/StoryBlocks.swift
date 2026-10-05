import CoreGraphics
import Foundation
import Markdown

/// A story's Markdown, as the reader lays it out — the blocks the web's
/// StoryMarkdown (react-markdown + remark-gfm) produces, with its paragraph
/// rules: a paragraph holding only a card link is an embedded card, only a
/// photo is an image block, only a web link may be that page's preview card,
/// only the blank marker (U+00A0) is extra space.
public nonisolated indirect enum StoryBlock: Hashable, Sendable {
    case heading(level: Int, [InlineRun])
    case paragraph([InlineRun])
    case blank
    case image(url: String, alt: String)
    case cardEmbed(href: String, title: String)
    /// A paragraph that may be one web link standing alone (src/lib/links/storyLinks.ts):
    /// `[words](https://…)`, `<https://…>` or a reference link with no picture inside (`href` is
    /// its address), or a bare address with nothing round it (`href` nil — CommonMark leaves it
    /// text; `text` is the address as written). Whether it is one, and which page it names, is the
    /// link rules' to say (`StoryLinks.key` in ResonanceKit): the reader draws the page's preview
    /// card when the story has one for it, and otherwise `runs`, the paragraph as it always was
    /// (its bare address a link, `linkingAddresses`).
    case soleLink(href: String?, text: String, runs: [InlineRun])
    case quote([StoryBlock])
    case list(ordered: Bool, start: Int, items: [[StoryBlock]])
    case rule
    case code(String)
}

/// A run of inline text with its marks.
public nonisolated struct InlineRun: Hashable, Sendable {
    public var text: String
    public var bold = false
    public var italic = false
    public var strikethrough = false
    public var code = false
    public var link: String?

    public init(_ text: String, bold: Bool = false, italic: Bool = false, strikethrough: Bool = false, code: Bool = false, link: String? = nil) {
        self.text = text
        self.bold = bold
        self.italic = italic
        self.strikethrough = strikethrough
        self.code = code
        self.link = link
    }
}

public nonisolated enum StoryParser {
    /// The story as CommonMark reads it, without "smart" punctuation — as the web's reader and the
    /// server read it: `'` and `"` stay as written (a link's `?q=what's` stays one link), `--` and
    /// `...` too.
    public static func parse(_ markdown: String) -> [StoryBlock] {
        let document = Document(parsing: markdown, options: [.disableSmartOpts])
        return document.children.compactMap(block)
    }

    static func block(_ node: Markup) -> StoryBlock? {
        switch node {
        case let p as Paragraph:
            return paragraph(p)
        case let h as Heading:
            return .heading(level: h.level, inlines(h))
        case let q as BlockQuote:
            return .quote(q.children.compactMap(block))
        case let l as UnorderedList:
            return .list(ordered: false, start: 1, items: l.listItems.map { $0.children.compactMap(block) })
        case let l as OrderedList:
            return .list(ordered: true, start: Int(l.startIndex), items: l.listItems.map { $0.children.compactMap(block) })
        case is ThematicBreak:
            return .rule
        case let c as CodeBlock:
            return .code(c.code.hasSuffix("\n") ? String(c.code.dropLast()) : c.code)
        case let h as HTMLBlock:
            // The site renders stories without raw HTML: it shows as text.
            return .paragraph([InlineRun(h.rawHTML.trimmingCharacters(in: .newlines))])
        case let t as Markdown.Table:
            // Tables are rare in stories; keep their text, a row per line.
            let rows = ([t.head.cells.map(\.plainText)] + t.body.rows.map { $0.cells.map(\.plainText) })
                .map { $0.joined(separator: "  ·  ") }
            return .paragraph([InlineRun(rows.joined(separator: "\n"))])
        default:
            return nil
        }
    }

    /// The web's `p` override (StoryMarkdown.tsx).
    static func paragraph(_ p: Paragraph) -> StoryBlock {
        let meaningful = p.children.filter { !(($0 as? Text)?.string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? false) }
        if meaningful.count == 1 {
            if let link = meaningful[0] as? Link, let href = link.destination, href.hasPrefix("/card/") {
                return .cardEmbed(href: href, title: link.plainText)
            }
            if let image = meaningful[0] as? Markdown.Image, let src = image.source {
                return .image(url: src, alt: image.plainText)
            }
            if let link = meaningful[0] as? Link, let href = link.destination, isWeb(href), !holdsImage(link) {
                return .soleLink(href: href, text: link.plainText, runs: inlines(p))
            }
        }
        if let bare = bareAddress(p) {
            return .soleLink(href: nil, text: bare, runs: inlines(p))
        }
        let runs = inlines(p)
        let text = runs.map(\.text).joined()
        if !text.isEmpty, text.unicodeScalars.allSatisfy({ $0 == "\u{00A0}" || CharacterSet.whitespacesAndNewlines.contains($0) }) {
            return .blank
        }
        return .paragraph(runs)
    }

    /// An http(s) address (any case): the only links a paragraph of its own can be a page's card for.
    static func isWeb(_ href: String) -> Bool {
        let lower = href.lowercased()
        return lower.hasPrefix("http://") || lower.hasPrefix("https://")
    }

    /// `[![picture](…)](url)` is a linked picture, not a link.
    static func holdsImage(_ node: Markup) -> Bool {
        node.children.contains { $0 is Markdown.Image || holdsImage($0) }
    }

    /// The paragraph's words when they are plain text alone (no marks, links or breaks of their own;
    /// CommonMark may hand one run over in pieces) and, trimmed, one unbroken word that starts like
    /// a web address — a candidate for a bare link (the link rules decide).
    static func bareAddress(_ p: Paragraph) -> String? {
        var words = ""
        for child in p.children {
            switch child {
            case let t as Text: words += t.string
            case is SoftBreak: words += "\n"
            default: return nil
            }
        }
        let trimmed = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) }) else { return nil }
        let lower = trimmed.lowercased()
        return lower.hasPrefix("http://") || lower.hasPrefix("https://") || lower.hasPrefix("www.") ? trimmed : nil
    }

    static func inlines(_ node: Markup, bold: Bool = false, italic: Bool = false, strike: Bool = false, link: String? = nil) -> [InlineRun] {
        var runs: [InlineRun] = []
        for child in node.children {
            switch child {
            case let t as Text:
                runs.append(InlineRun(t.string, bold: bold, italic: italic, strikethrough: strike, link: link))
            case is SoftBreak:
                runs.append(InlineRun(" ", bold: bold, italic: italic, strikethrough: strike, link: link))
            case is LineBreak:
                runs.append(InlineRun("\n", bold: bold, italic: italic, strikethrough: strike, link: link))
            case let c as InlineCode:
                runs.append(InlineRun(c.code, bold: bold, italic: italic, strikethrough: strike, code: true, link: link))
            case is Strong:
                runs += inlines(child, bold: true, italic: italic, strike: strike, link: link)
            case is Emphasis:
                runs += inlines(child, bold: bold, italic: true, strike: strike, link: link)
            case is Strikethrough:
                runs += inlines(child, bold: bold, italic: italic, strike: true, link: link)
            case let l as Link:
                // A link the reader can't open (tel:, another app's scheme…) is plain text (StoryLink).
                runs += inlines(child, bold: bold, italic: italic, strike: strike, link: l.destination.flatMap { StoryLink.isTappable($0) ? $0 : nil })
            case let i as Markdown.Image:
                // An image inside running text keeps its alt text in the line.
                runs.append(InlineRun(i.plainText, bold: bold, italic: italic, strikethrough: strike, link: link))
            case let h as InlineHTML:
                runs.append(InlineRun(h.rawHTML, bold: bold, italic: italic, strikethrough: strike, link: link))
            default:
                runs += inlines(child, bold: bold, italic: italic, strike: strike, link: link)
            }
        }
        return runs
    }
}

nonisolated extension StoryBlock {
    /// The blocks with each web address written bare in their words made a link, as the web's
    /// reader (GFM) makes one — which words are an address is the link rules' to say (`find`: each
    /// link's UTF-16 range in a run's text and the address it opens; the reader's are ChatLinks,
    /// the server's own). Words already in a link, and code, stay as they are; a paragraph standing
    /// alone as a link (`soleLink`) keeps what keys its page's card and gets the link in its words,
    /// for when there is no card.
    public static func linkingAddresses(_ blocks: [StoryBlock], find: (String) -> [(range: NSRange, url: String)]) -> [StoryBlock] {
        blocks.map { $0.linkingAddresses(find) }
    }

    private func linkingAddresses(_ find: (String) -> [(range: NSRange, url: String)]) -> StoryBlock {
        func link(_ runs: [InlineRun]) -> [InlineRun] {
            // CommonMark may hand one run of words over in pieces (at a `_` or `*` that marks nothing): an
            // address is looked for in the words as they read, never in half of it.
            var joined: [InlineRun] = []
            for run in runs {
                if var last = joined.last, last.bold == run.bold, last.italic == run.italic, last.strikethrough == run.strikethrough,
                   last.code == run.code, last.link == run.link {
                    last.text += run.text
                    joined[joined.count - 1] = last
                } else {
                    joined.append(run)
                }
            }
            return joined.flatMap { run -> [InlineRun] in
                guard run.link == nil, !run.code else { return [run] }
                let found = find(run.text)
                guard !found.isEmpty else { return [run] }
                let text = run.text as NSString
                var pieces: [InlineRun] = []
                var at = 0
                func piece(_ range: NSRange, link: String?) {
                    guard range.length > 0 else { return }
                    var part = run
                    part.text = text.substring(with: range)
                    part.link = link
                    pieces.append(part)
                }
                for (range, url) in found where range.location >= at && NSMaxRange(range) <= text.length {
                    piece(NSRange(location: at, length: range.location - at), link: nil)
                    piece(range, link: url)
                    at = NSMaxRange(range)
                }
                piece(NSRange(location: at, length: text.length - at), link: nil)
                return pieces
            }
        }
        switch self {
        case let .paragraph(runs): return .paragraph(link(runs))
        case let .heading(level, runs): return .heading(level: level, link(runs))
        case let .soleLink(href, text, runs): return .soleLink(href: href, text: text, runs: link(runs))
        case let .quote(children): return .quote(Self.linkingAddresses(children, find: find))
        case let .list(ordered, start, items): return .list(ordered: ordered, start: start, items: items.map { Self.linkingAddresses($0, find: find) })
        case .blank, .image, .cardEmbed, .rule, .code: return self
        }
    }

    /// Plain text of a heading, for the table of contents.
    public var headingText: String? {
        if case let .heading(_, runs) = self { return runs.map(\.text).joined() }
        return nil
    }
}

/// CSS margins (top, bottom) of each block at the reader's 17pt, and the gap
/// between two blocks: the larger of the facing margins, as CSS collapses them.
public nonisolated enum ProseMetrics {
    public static let em: CGFloat = 17

    public static func margins(_ block: StoryBlock) -> (top: CGFloat, bottom: CGFloat) {
        switch block {
        case let .heading(level, _):
            return level <= 2 ? (1.6 * 22, 0.6 * 22) : (1.4 * 18, 0.5 * 18)
        case .blank: return (0, 0)
        case .image: return (22, 22)
        case .rule: return (28, 28)
        case .paragraph, .cardEmbed, .soleLink, .quote, .list, .code: return (0, 1.1 * em)
        }
    }

    public static func gaps(_ blocks: [StoryBlock]) -> [CGFloat] {
        blocks.indices.map { i in i == 0 ? 0 : max(margins(blocks[i - 1]).bottom, margins(blocks[i]).top) }
    }
}
