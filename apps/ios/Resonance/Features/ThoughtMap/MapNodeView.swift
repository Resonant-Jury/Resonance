import CoreText
import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit

// MARK: - What a card on the map says

/// The story's prose as a node shows it — src/lib/markdown/plainText.ts, the one rule the server
/// (a list's stored excerpt), the web's story cards and thought-map nodes share: the Markdown
/// stripped (a link keeps its words), every bare address the link rules find left out (`withoutLinks`),
/// then cut after `max` code points (`excerpt`) — never inside an emoji.
func plainExcerpt(_ markdown: String, max: Int = 80) -> String {
    StoryProse.excerpt(StoryProse.plainText(markdown), max: max)
}

/// plainText.ts (and lib/text/entities.ts), line for line.
enum StoryProse {
    /// What the writer wrote as text must not read as syntax: a backslash-escaped ASCII punctuation
    /// mark (`\*`, `1\.`, `\#` — the editor writes them) and a character reference (`&gt;` — the
    /// editor stores `->` as `-&gt;`). Each stands in as a private-use character, U+E000 plus its
    /// ASCII code — one UTF-16 unit for one, so offsets agree with the restored text — until the
    /// syntax is gone (`restore`). Such characters are never in a story's prose otherwise:
    /// plainText drops any it is given.
    private static let literalBase: UInt32 = 0xE000
    private static let literalsPattern = "[\u{E021}-\u{E07E}]"

    private static func isASCIIPunctuation(_ c: UInt32) -> Bool {
        (0x21...0x2F).contains(c) || (0x3A...0x40).contains(c) || (0x5B...0x60).contains(c) || (0x7B...0x7E).contains(c)
    }

    private static func literal(_ text: String) -> String {
        let scalars = Array(text.unicodeScalars)
        guard scalars.count == 1, isASCIIPunctuation(scalars[0].value),
              let mark = Unicode.Scalar(literalBase + scalars[0].value) else { return text }
        return String(Character(mark))
    }

    /// The references pages and the editor actually use (entities.ts's NAMED).
    private static let named: [String: String] = [
        "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ", "copy": "©", "reg": "®", "trade": "™",
        "hellip": "…", "mdash": "—", "ndash": "–", "lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”", "laquo": "«",
        "raquo": "»", "middot": "·", "bull": "•", "times": "×", "deg": "°", "euro": "€", "pound": "£", "yen": "¥", "cent": "¢",
        "sect": "§", "para": "¶", "iexcl": "¡", "iquest": "¿", "eacute": "é", "egrave": "è", "ecirc": "ê", "agrave": "à",
        "aacute": "á", "acirc": "â", "ccedil": "ç", "uuml": "ü", "ouml": "ö", "auml": "ä", "szlig": "ß", "ntilde": "ñ",
        "oacute": "ó", "iacute": "í", "uacute": "ú",
    ]

    /// What one reference's body (`amp`, `#62`, `#x3E`) stands for; nil for a name it doesn't know.
    static func entityValue(_ body: String) -> String? {
        if body.hasPrefix("#") {
            let digits = body.dropFirst()
            let hex = digits.first.map { $0 == "x" || $0 == "X" } ?? false
            let code = hex ? UInt32(digits.dropFirst(), radix: 16) : UInt32(digits, radix: 10)
            guard let code, code != 0, code <= 0x10FFFF, !(0xD800...0xDFFF).contains(code), let scalar = Unicode.Scalar(code) else {
                return "\u{FFFD}"
            }
            return String(Character(scalar))
        }
        return named[body.lowercased()]
    }

    /// Escapes and references set aside as literals (a backslash at a line's end — a hard break — is a space).
    private static func literals(_ markdown: String) -> String {
        let re = try! NSRegularExpression(
            pattern: "\\\\([!-/:-@\\[-`{-~])|\\\\\\r?\\n|&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});",
            options: [.caseInsensitive])
        let ns = markdown as NSString
        var out = ""
        var at = 0
        for m in re.matches(in: markdown, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: at, length: m.range.location - at))
            let whole = ns.substring(with: m.range)
            if m.range(at: 1).location != NSNotFound {
                out += literal(ns.substring(with: m.range(at: 1)))
            } else if m.range(at: 2).location == NSNotFound {
                out += " "
            } else if let value = entityValue(ns.substring(with: m.range(at: 2))) {
                out += literal(value)
            } else {
                out += whole
            }
            at = NSMaxRange(m.range)
        }
        return out + ns.substring(from: at)
    }

    /// The marks `literals` set aside, back as the characters they are.
    private static func restore(_ text: String) -> String {
        var scalars = String.UnicodeScalarView()
        for s in text.unicodeScalars {
            if (0xE021...0xE07E).contains(s.value), let plain = Unicode.Scalar(s.value - literalBase) {
                scalars.append(plain)
            } else {
                scalars.append(s)
            }
        }
        return String(scalars)
    }

    /// The text without its bare addresses: exactly the links the link rules find (ChatLinks, the
    /// server's findLinks), each with the `<…>` of an autolink round it. Everything else stays: the
    /// words either side, the punctuation after the address (with no space left hanging before it),
    /// an address the rules don't read as a link (`foo@www.…`, `localhost`). Marks set aside by
    /// `literals` count as what they stand for.
    static func withoutLinks(_ text: String) -> String {
        let ns = text as NSString
        let plain = restore(text) as NSString
        var out = ""
        var at = 0
        for link in ChatLinks.links(in: plain as String) {
            var start = link.range.location, end = NSMaxRange(link.range)
            if start > 0, end < plain.length, plain.character(at: start - 1) == 0x3C, plain.character(at: end) == 0x3E {
                start -= 1
                end += 1
            }
            let before = ns.substring(with: NSRange(location: at, length: start - at))
            // "see https://…, then" reads "see, then"; "see https://… then" keeps its space.
            let next = plain.substring(with: NSRange(location: end, length: min(2, plain.length - end)))
            out += closes(next) ? trimmingTrailingSpace(before) : before
            at = end
        }
        return out + ns.substring(from: at)
    }

    /// A closing mark — sentence punctuation, a closing bracket or quote, CJK ones too — leads `text`
    /// (the sentence's, never the link's).
    private static func closes(_ text: String) -> Bool {
        guard let first = text.unicodeScalars.first else { return false }
        switch first.properties.generalCategory {
        case .otherPunctuation, .closePunctuation, .finalPunctuation: return true
        default: return false
        }
    }

    private static func trimmingTrailingSpace(_ text: String) -> String {
        var scalars = Array(text.unicodeScalars)
        while let last = scalars.last, last.properties.isWhitespace { scalars.removeLast() }
        return String(String.UnicodeScalarView(scalars))
    }

    /// A picture, `![alt](src)`, and a link, `[text](destination)` (its words are group 1), on one
    /// line (plainText.ts's PICTURE and LINK). Every run is bounded — a link's words by
    /// `linkTextMax`, its destination by the longest address the link rules take — so no attempt
    /// reads on to the story's end: unbounded, a story of 200 000 unclosed `[` took seconds. A link
    /// whose words run longer shows its brackets in an excerpt, which is harmless. Each run is
    /// possessive (`{…}+`, which JavaScript lacks): its class holds no `]` / `)`, so giving a
    /// character back could never let the mark after it match — the same matches, without ICU
    /// trying every shorter run (4–5 times quicker on a flood of brackets).
    static let linkTextMax = 500
    private static let picturePattern = "!\\[[^\\]\\n]{0,\(linkTextMax)}+\\]\\([^)\\n]{0,\(ChatLinks.maxLength)}+\\)"
    private static let linkPattern = "\\[([^\\]\\n]{0,\(linkTextMax)}+)\\]\\([^)\\n]{0,\(ChatLinks.maxLength)}+\\)"
    /// A picture with a web address (group 1), bounded as `picturePattern` is.
    private static let webPicture = try! NSRegularExpression(
        pattern: "!\\[[^\\]\\n]{0,\(linkTextMax)}+\\]\\((https?://[^\\s)]{1,\(ChatLinks.maxLength)}+)\\)")

    /// The address of the story's first picture on the web — a node's little visual — or nil (plainText.ts's firstPicture).
    static func firstPicture(_ markdown: String) -> String? {
        let ns = markdown as NSString
        guard let m = webPicture.firstMatch(in: markdown, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return ns.substring(with: m.range(at: 1))
    }

    /// A story's prose without Markdown syntax (links keep their words), as a reader sees it:
    /// character references decoded (`-&gt;` reads `->`) and backslash escapes gone (`\*` reads `*`),
    /// without either ever making syntax; its bare addresses left out.
    static func plainText(_ markdown: String) -> String {
        func replace(_ text: String, _ pattern: String, _ template: String, lines: Bool = false) -> String {
            let re = try! NSRegularExpression(pattern: pattern, options: lines ? [.anchorsMatchLines] : [])
            return re.stringByReplacingMatches(in: text, range: NSRange(location: 0, length: (text as NSString).length),
                                               withTemplate: template)
        }
        var t = literals(replace(replace(markdown, literalsPattern, ""), "```[\\s\\S]*?```", " "))
        t = replace(t, picturePattern, " ")
        t = replace(t, linkPattern, "$1")
        // After the addresses go: an address's `_`, `~` and `*` are not emphasis.
        t = withoutLinks(t)
        t = replace(t, "^#{1,6}\\s+", "", lines: true)
        t = replace(t, "^>\\s?", "", lines: true)
        // A marker's indent is spaces and tabs on its own line: `^\s*` would read on across every blank line after it, at each one (quadratic).
        t = replace(t, "^[ \\t]*(?:[-*+]|[0-9]+\\.)\\s+", "", lines: true)
        t = replace(t, "^[ \\t]*(?:-{3,}|\\*{3,}|_{3,})[ \\t]*$", "", lines: true)
        t = replace(t, "[*~`]+", "")
        // An underscore inside a word is the word's (snake_case, a_b_c): only one at a word's edge can be emphasis.
        t = replace(t, "(?<![\\p{L}\\p{N}])_+|_+(?![\\p{L}\\p{N}])", "")
        t = replace(t, "\\s+", " ")
        return restore(t.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// The first `max` code points, then "…": cut between code points, never inside an emoji.
    static func excerpt(_ text: String, max: Int) -> String {
        let scalars = Array(text.unicodeScalars)
        guard scalars.count > max else { return text }
        return String(String.UnicodeScalarView(scalars.prefix(max))) + "…"
    }
}

/// The card's little picture: its cover, else the story's first inline image.
func mapThumbURL(_ card: MapCard) -> URL? {
    if let url = card.mediaURL { return url }
    return StoryProse.firstPicture(card.story).flatMap { URL(string: $0) }
}

/// The node's text, broken into lines the way the browser lays it out: CSS
/// line boxes (15px/1.4 title, 11.5px/1.6 excerpt 6px below it), and the
/// lines beside the floated 56px thumbnail (its 64×64 margin box at the
/// top-right) shortened to 136. Each line is placed by its baseline, so a
/// CJK fallback glyph can't push it off the web's grid.
struct NodeTextLayout {
    struct Line: Hashable {
        let text: String
        let title: Bool
        let baseline: CGFloat
    }

    let lines: [Line]

    static let width: CGFloat = 200
    static let bodyHeight: CGFloat = 126
    static let titleFont = AppFonts.uiFont(.heading, size: 15, weight: .semibold)
    static let excerptFont = AppFonts.uiFont(.body, size: 11.5)

    nonisolated(unsafe) private static var cache: [String: NodeTextLayout] = [:]

    static func make(title: String, excerpt: String, thumb: Bool) -> NodeTextLayout {
        let key = "\(thumb)|\(title)|\(excerpt)"
        if let hit = cache[key] { return hit }
        var lines: [Line] = []
        var y: CGFloat = 0
        func flow(_ text: String, font: UIFont, lineBox: CGFloat, title: Bool) {
            guard !text.isEmpty else { return }
            let attr = NSAttributedString(string: text, attributes: [.font: font])
            let typesetter = CTTypesetterCreateWithAttributedString(attr)
            let ns = text as NSString
            var start = 0
            while start < ns.length {
                let width = thumb && y < 64 ? width - 64 : width
                var count = CTTypesetterSuggestLineBreak(typesetter, start, Double(width))
                if count <= 0 { count = 1 }
                let line = ns.substring(with: NSRange(location: start, length: count))
                    .trimmingCharacters(in: .newlines)
                // The CSS line box: half the leading above the primary font's content area.
                let baseline = y + (lineBox + font.ascender + font.descender) / 2
                lines.append(Line(text: line.trimmingCharacters(in: .whitespaces), title: title, baseline: baseline))
                start += count
                y += lineBox
                if y > bodyHeight + lineBox { break }
            }
        }
        flow(title, font: titleFont, lineBox: 21, title: true)
        if !excerpt.isEmpty {
            y += 6
            flow(excerpt, font: excerptFont, lineBox: 18.4, title: false)
        }
        let layout = NodeTextLayout(lines: lines)
        if cache.count > 400 { cache.removeAll() }
        cache[key] = layout
        return layout
    }
}

// MARK: - A card on the map

/// ThoughtMapNode: the card's hand-drawn outline in its hue (a folder tab
/// grows out of it when selected), the title and excerpt wrapping round the
/// thumbnail, the visibility glyph and tags, and — selected — the link handle
/// and the tab's Open / remove buttons. Purely drawn: the map's touch surface
/// does all the hit-testing.
struct MapNodeView: View, Equatable {
    let card: MapCard
    let selected: Bool
    let linkTarget: Bool
    let dragging: Bool
    let showsHandle: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static func == (a: MapNodeView, b: MapNodeView) -> Bool {
        a.card == b.card && a.selected == b.selected && a.linkTarget == b.linkTarget
            && a.dragging == b.dragging && a.showsHandle == b.showsHandle
    }

    private var tabbed: Bool { selected && !dragging }
    private var emphasized: Bool { selected || linkTarget }
    private var hue: Double { ThoughtMapStore.hue(card) }
    private var seed: Double { Double(seedFromString(card.id)) }

    var body: some View {
        let thumb = mapThumbURL(card)
        let layout = NodeTextLayout.make(title: card.title, excerpt: plainExcerpt(card.story, max: thumb == nil ? 100 : 80),
                                         thumb: thumb != nil)
        ZStack(alignment: .topLeading) {
            // The outline re-draws when the card is (un)selected or dragged; the web fades each new one in.
            outline
                .id(tabbed)
                .transition(.asymmetric(insertion: .opacity, removal: .identity))
                .animation(reduceMotion ? nil : .easeOut(duration: 0.28), value: tabbed)
            VStack(alignment: .leading, spacing: 8) {
                ZStack(alignment: .topLeading) {
                    ForEach(Array(layout.lines.enumerated()), id: \.offset) { _, line in
                        Text(line.text)
                            // The very fonts the lines were broken with (a fixed-size world: no Dynamic Type here).
                            .font(Font(line.title ? NodeTextLayout.titleFont : NodeTextLayout.excerptFont))
                            .foregroundStyle(line.title ? Tokens.text : Tokens.textMuted)
                            .fixedSize()
                            .alignmentGuide(.top) { $0[.firstTextBaseline] }
                            .offset(y: line.baseline)
                    }
                    if let thumb { thumbnail(thumb).offset(x: NodeTextLayout.width - 56, y: 2) }
                }
                .frame(width: NodeTextLayout.width, height: NodeTextLayout.bodyHeight, alignment: .topLeading)
                .clipped()
                .mask {
                    LinearGradient(stops: [.init(color: .black, location: (NodeTextLayout.bodyHeight - 14) / NodeTextLayout.bodyHeight),
                                           .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom)
                }
                meta
            }
            .padding(EdgeInsets(top: 14, leading: 16, bottom: 12, trailing: 16))
            if selected && showsHandle && !dragging { linkHandle }
            if tabbed { tabRow }
        }
        .frame(width: mapNodeW, height: mapNodeH, alignment: .topLeading)
    }

    @ViewBuilder private var outline: some View {
        if tabbed {
            let path = GeometryCache.shared.path(key: "tab|\(seed)") {
                wobTabRect(mapNodeW, mapNodeH, tabX: ThoughtMapStore.tabX, tabW: ThoughtMapStore.tabW, tabH: ThoughtMapStore.tabH,
                           seed: seed, options: WobTabRectOptions(R: 18, tabR: 9, mag: 2.4, curve: 1))
            }.path()
            ZStack {
                path.fill(OKLCHColor.color(0.925, 0.045, hue))
                path.stroke(OKLCHColor.color(0.38, 0.13, hue), style: StrokeStyle(lineWidth: Tokens.inkStrong, lineCap: .round, lineJoin: .round))
            }
            .frame(width: mapNodeW, height: mapNodeH + ThoughtMapStore.tabH, alignment: .topLeading)
            .offset(y: -ThoughtMapStore.tabH)
        } else {
            let shape = WobRectShape(radius: 18, seed: seed, mag: 4, options: WobRectOptions(
                curve: 1, cornerJitter: 0.8, cornerOffset: 3, segmentsH: .range(3, 4), segmentsV: .count(2)))
            ZStack {
                shape.fill(emphasized ? OKLCHColor.color(0.925, 0.045, hue) : OKLCHColor.color(0.975, 0.012, hue))
                shape.stroke(emphasized ? OKLCHColor.color(0.38, 0.13, hue) : OKLCHColor.color(0.52, 0.11, hue),
                             style: StrokeStyle(lineWidth: emphasized ? Tokens.inkStrong : Tokens.ink, lineJoin: .round))
            }
            .frame(width: mapNodeW, height: mapNodeH)
        }
    }

    /// NodeThumb: 56×56 in a wobbly clip, the picture overscanned 4px each side.
    private func thumbnail(_ url: URL) -> some View {
        let clip = WobRectShape(radius: 12, seed: seed + 3, mag: 1.8, options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.4, segmentsH: .count(2), segmentsV: .count(2)))
        return ZStack {
            RemoteImage(url: url, pixelSize: CGSize(width: 64 * 6, height: 64 * 6))
                .frame(width: 64, height: 64)
                .frame(width: 56, height: 56)
                .clipShape(clip)
            clip.stroke(OKLCHColor.color(0.52, 0.11, hue, alpha: 0.55), style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
        }
        .frame(width: 56, height: 56)
    }

    private var meta: some View {
        HStack(spacing: 8) {
            OrganicIcon(card.publishedAt == nil ? .pen : Self.visibilityIcon(card.visibility), size: 14)
                .foregroundStyle(Tokens.textMuted)
            Text(card.tags.map { "#\($0)" }.joined(separator: " "))
                .font(Font(NodeTextLayout.excerptFont))
                .foregroundStyle(Tokens.textMuted)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
        }
        .frame(height: 18)
    }

    static func visibilityIcon(_ v: String) -> IconName {
        switch v {
        case "connections": .users
        case "private": .lock
        default: .globe
        }
    }

    /// The link handle: a dashed 28px circle on the right edge, an arrow inside.
    private var linkHandle: some View {
        ZStack {
            Circle().fill(Tokens.cardBg)
            Circle().stroke(Tokens.fieldBorderHover, style: StrokeStyle(lineWidth: 1.6, dash: [4.8, 3.2]))
            OrganicIcon(.arrowRight, size: 14).foregroundStyle(Tokens.textMuted)
        }
        .frame(width: 28, height: 28)
        .offset(x: mapNodeW - 13, y: mapNodeH / 2 - 14)
    }

    /// The tab's buttons: "Open" and the trash, centred in the 118×30 tab.
    private var tabRow: some View {
        HStack(spacing: 2) {
            HStack(spacing: 4) {
                Text(L10n.Me.ThoughtMap.open).font(AppFonts.body(12.5, weight: .semibold)).foregroundStyle(Tokens.text)
            }
            .padding(.horizontal, 7).padding(.vertical, 3)
            OrganicIcon(.trash, size: 14).foregroundStyle(Tokens.text)
                .padding(.horizontal, 7).padding(.vertical, 3)
        }
        .padding(EdgeInsets(top: 4, leading: 6, bottom: 0, trailing: 6))
        .frame(width: ThoughtMapStore.tabW, height: ThoughtMapStore.tabH, alignment: .center)
        .offset(x: ThoughtMapStore.tabX, y: -ThoughtMapStore.tabH)
    }
}
