import NukeUI
import StoryFormat
import SwiftUI

/// A story, laid out like the web reader's `.prose`: 17pt DM Sans on a 1.8
/// line box, Playfair headings, the curved quote rail, photos in organic
/// clips, card links as embedded cards, and blank-line markers as air.
/// Vertical rhythm follows CSS margins, collapsing between blocks.
public struct StoryMarkdownView<Embed: View>: View {
    let blocks: [StoryBlock]
    let onOpenURL: (URL) -> Void
    let embed: (_ href: String, _ title: String) -> Embed

    public init(blocks: [StoryBlock], onOpenURL: @escaping (URL) -> Void,
                @ViewBuilder embed: @escaping (_ href: String, _ title: String) -> Embed) {
        self.blocks = blocks
        self.onOpenURL = onOpenURL
        self.embed = embed
    }

    public var body: some View {
        BlockStack(blocks: blocks, style: .body, onOpenURL: onOpenURL, embed: embed)
    }
}

struct BlockStack<Embed: View>: View {
    let blocks: [StoryBlock]
    let style: ProseStyle
    let onOpenURL: (URL) -> Void
    let embed: (String, String) -> Embed

    var body: some View {
        let gaps = ProseMetrics.gaps(blocks)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { i, block in
                BlockView(block: block, style: style, onOpenURL: onOpenURL, embed: embed)
                    .padding(.top, gaps[i])
            }
        }
    }
}

struct BlockView<Embed: View>: View {
    let block: StoryBlock
    let style: ProseStyle
    let onOpenURL: (URL) -> Void
    let embed: (String, String) -> Embed

    var body: some View {
        switch block {
        case let .paragraph(runs):
            text(runs, style)
        case let .heading(level, runs):
            let heading = level <= 2 ? ProseStyle.h2 : ProseStyle.h3
            text(runs, heading)
                .accessibilityAddTraits(.isHeader)
        case .blank:
            Color.clear.frame(height: 1.6 * ProseMetrics.em).accessibilityHidden(true)
        case let .image(url, alt):
            StoryImageView(url: URL(string: url), alt: alt, seed: Double(seedFromString(url)))
                .frame(maxWidth: .infinity)
        case let .cardEmbed(href, title):
            embed(href, title)
        case let .quote(children):
            HStack(alignment: .top, spacing: ProseMetrics.em) {
                WavyRailShape(seed: 5)
                    .stroke(Tokens.terracottaLight, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                    .frame(width: 6)
                    .frame(maxHeight: .infinity)
                    .accessibilityHidden(true)
                BlockStack(blocks: children, style: style.quoted, onOpenURL: onOpenURL, embed: embed)
            }
            .fixedSize(horizontal: false, vertical: true)
        case let .list(ordered, start, items):
            VStack(alignment: .leading, spacing: 0.3 * ProseMetrics.em) {
                ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                    ListItemView(marker: ordered ? "\(start + i)." : "•", blocks: item, style: style, onOpenURL: onOpenURL, embed: embed)
                }
            }
        case .rule:
            WavyDivider(color: Tokens.textMuted.opacity(0.45), seed: 23)
        case let .code(code):
            Text(code)
                .font(.system(size: 15, design: .monospaced))
                .foregroundStyle(Tokens.text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func text(_ runs: [InlineRun], _ s: ProseStyle) -> some View {
        CSSTextView(s.attributed(runs), font: s.font, lineHeight: s.lineHeight, onOpenURL: onOpenURL)
    }
}

/// A list item: the marker hangs in a 1.5em gutter, the content keeps its
/// own blocks (tight lists hold a single paragraph).
struct ListItemView<Embed: View>: View {
    let marker: String
    let blocks: [StoryBlock]
    let style: ProseStyle
    let onOpenURL: (URL) -> Void
    let embed: (String, String) -> Embed

    var body: some View {
        let gutter = 1.5 * ProseMetrics.em
        // Blocks inside an item keep their spacing but not a trailing margin.
        ZStack(alignment: .topLeading) {
            // The marker sits on the first line's box, like a CSS list marker.
            CSSTextView(style.attributed([InlineRun(marker)]), font: style.font, lineHeight: style.lineHeight)
                .frame(width: gutter, alignment: .leading)
                .accessibilityHidden(true)
            BlockStack(blocks: blocks, style: style, onOpenURL: onOpenURL, embed: embed)
                .padding(.leading, gutter)
        }
    }
}

/// The blockquote's hand-drawn vertical rail (the web's vertical Divider).
nonisolated struct WavyRailShape: Shape {
    let seed: Double

    func path(in rect: CGRect) -> Path {
        let h = Double(rect.height)
        guard h > 0 else { return Path() }
        return wavyVertical(h, seed: seed, amp: 1.6, steps: max(3, Int((h / 60).rounded())))
            .path(offsetX: Double(rect.midX), offsetY: Double(rect.minY))
    }
}

/// OrganicStoryImage: a photo at its natural proportions (never taller than
/// 520pt or 62% of the screen), centred, in a hand-drawn clip.
struct StoryImageView: View {
    let url: URL?
    let alt: String
    let seed: Double
    @State private var aspect: CGFloat?

    var body: some View {
        GeometryReader { geo in
            let maxH = min(520, UIScreen.main.bounds.height * 0.62)
            let a = aspect ?? 1.5
            let w = min(geo.size.width, maxH * a)
            let setAspect = $aspect
            LazyImage(url: url) { state in
                if let image = state.image {
                    image.resizable().scaledToFill()
                } else {
                    Tokens.creamDark
                }
            }
            .onCompletion { result in
                if case let .success(response) = result, response.image.size.height > 0 {
                    setAspect.wrappedValue = response.image.size.width / response.image.size.height
                }
            }
            .frame(width: w, height: w / a)
            .clipShape(StoryImageClip(seed: seed))
            .frame(maxWidth: .infinity)
            .accessibilityLabel(alt)
            .accessibilityAddTraits(.isImage)
        }
        .frame(height: height)
    }

    /// The laid-out height for the reader's column (width ≈ the screen minus gutters).
    private var height: CGFloat {
        let maxH = min(520, UIScreen.main.bounds.height * 0.62)
        let a = aspect ?? 1.5
        let column = UIScreen.main.bounds.width - 40
        return min(column, maxH * a) / a
    }
}

/// The story photo's clip: R 12, a gentler wobble than covers (mag 2.5%).
nonisolated struct StoryImageClip: Shape {
    let seed: Double

    func path(in rect: CGRect) -> Path {
        let w = Double(rect.width), h = Double(rect.height)
        guard w > 0, h > 0 else { return Path() }
        return wobRect(w, h, 12, seed: seed, mag: min(w, h) * 0.025, options: WobRectOptions(
            curve: 0.4, cornerJitter: 1.1, cornerOffset: 6, segmentsH: .range(3, 4), segmentsV: .range(2, 3)
        )).path(offsetX: Double(rect.minX), offsetY: Double(rect.minY))
    }
}
