import CoreText
import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit

// MARK: - What a card on the map says

/// plainExcerpt (src/lib/adapters/story.ts): the story's prose with the Markdown
/// stripped, cut at `max` UTF-16 units like the web's `slice`.
func plainExcerpt(_ markdown: String, max: Int = 80) -> String {
    var t = markdown
    let rules: [(String, String, NSRegularExpression.Options)] = [
        ("```[\\s\\S]*?```", " ", []),
        ("!\\[[^\\]]*\\]\\([^)]*\\)", " ", []),
        ("\\[([^\\]]*)\\]\\([^)]*\\)", "$1", []),
        ("^#{1,6}\\s+", "", [.anchorsMatchLines]),
        ("^>\\s?", "", [.anchorsMatchLines]),
        ("[*_~`]+", "", []),
        ("\\s+", " ", []),
    ]
    for (pattern, template, options) in rules {
        let re = try! NSRegularExpression(pattern: pattern, options: options)
        t = re.stringByReplacingMatches(in: t, range: NSRange(t.startIndex..., in: t), withTemplate: template)
    }
    t = t.trimmingCharacters(in: .whitespacesAndNewlines)
    let ns = t as NSString
    return ns.length > max ? ns.substring(to: max) + "…" : t
}

/// The card's little picture: its cover, else the story's first inline image.
func mapThumbURL(_ card: MapCard) -> URL? {
    if let url = card.mediaURL { return url }
    let re = try! NSRegularExpression(pattern: "!\\[[^\\]]*\\]\\((https?://[^\\s)]+)\\)")
    let s = card.story
    guard let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)), let r = Range(m.range(at: 1), in: s) else { return nil }
    return URL(string: String(s[r]))
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
