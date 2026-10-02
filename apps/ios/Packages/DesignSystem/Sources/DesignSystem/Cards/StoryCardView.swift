import SwiftUI
import UIKit

/// What a story card shows. (DesignSystem knows nothing about the API; the
/// app maps its FeedCard into this.)
public struct StoryCardContent: Sendable, Identifiable {
    public var id: String
    public var title: String
    public var excerpt: String
    public var authorName: String
    public var authorInitials: String
    public var authorImageURL: URL?
    public var avatarSeed: Double
    public var readTime: String
    public var tags: [String]
    public var imageURL: URL?
    public var imageLabel: String
    public var accentHue: Double?
    /// The recommender's margin note (「因為…」), if any.
    public var reason: String?

    public init(id: String, title: String, excerpt: String, authorName: String, authorInitials: String,
                authorImageURL: URL?, avatarSeed: Double, readTime: String, tags: [String],
                imageURL: URL?, imageLabel: String, accentHue: Double?, reason: String?) {
        self.id = id
        self.title = title
        self.excerpt = excerpt
        self.authorName = authorName
        self.authorInitials = authorInitials
        self.authorImageURL = authorImageURL
        self.avatarSeed = avatarSeed
        self.readTime = readTime
        self.tags = tags
        self.imageURL = imageURL
        self.imageLabel = imageLabel
        self.accentHue = accentHue
        self.reason = reason
    }
}

/// StoryCard as the web draws it on a phone: a full-bleed band tinted with the
/// card's hue, grain over it, a wavy rule along its top edge (and its bottom,
/// for the last card), then image, tags, title, excerpt, rule, byline.
public struct StoryCardView: View {
    let content: StoryCardContent
    let position: Int
    var isLast: Bool

    public init(_ content: StoryCardContent, position: Int, isLast: Bool = false) {
        self.content = content
        self.position = position
        self.isLast = isLast
    }

    private var palette: CardPalette { CardPalette(accentHue: content.accentHue, position: position) }
    private var seed: Double { Double(position * 77 + 13) }

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            OrganicImage(url: content.imageURL, seed: seed + 5, grain: StoryGrain.cover) {
                StoryImagePlaceholder(fill: palette.fill, stripe: palette.stripe, label: content.imageLabel)
            }
            .aspectRatio(1 / 0.62, contentMode: .fit)
            .accessibilityHidden(true)

            if !content.tags.isEmpty {
                FlowRow(spacing: 6) {
                    ForEach(content.tags.prefix(4), id: \.self) { TagPill($0, fill: palette.fill) }
                }
                .padding(.top, 8)
            }

            CSSText(content.title, font: AppFonts.scaledUIFont(.heading, size: 18, weight: .bold), lineHeight: 1.3)
                .accessibilityAddTraits(.isHeader)

            CSSText(content.excerpt, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.65, color: UIColor(Tokens.textMuted))

            StoryCardSeparator(palette: palette, seed: seed)

            HStack(spacing: 10) {
                HandDrawnAvatar(initials: content.authorInitials, imageURL: content.authorImageURL,
                                color: palette.fill, size: 30, seed: content.avatarSeed)
                VStack(alignment: .leading, spacing: 1) {
                    Text(content.authorName).font(AppFonts.body(13, weight: .semibold)).foregroundStyle(Tokens.text)
                    Text(content.readTime).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
                }
                Spacer()
                OrganicIcon(.arrowRight, size: 18, strokeWidth: Tokens.ink)
                    .foregroundStyle(Tokens.text.opacity(0.28))
                    .accessibilityHidden(true)
            }
            .padding(.top, 8)

            if let reason = content.reason, !reason.isEmpty {
                HStack(alignment: .top, spacing: 7) {
                    OrganicIcon(.sparkle, size: 13, strokeWidth: Tokens.inkLight).padding(.top, 5)
                    Text(reason).font(AppFonts.handwritten(17)).tracking(0.34).lineSpacing(17 * 0.45)
                }
                .foregroundStyle(palette.noteInk)
                .padding(.top, -4)
            }
        }
        .modifier(StoryBand(palette: palette, seed: seed, isLast: isLast, verticalPadding: 32))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// The loading card (StoryCard `loading`): the real band — tint, grain and
/// rules — with the picture, words and avatar swapped for shimmering blocks.
public struct StoryCardSkeleton: View {
    let position: Int
    var isLast: Bool

    public init(position: Int, isLast: Bool = false) {
        self.position = position
        self.isLast = isLast
    }

    public var body: some View {
        let palette = CardPalette(accentHue: nil, position: position)
        let seed = Double(position * 77 + 13)
        VStack(alignment: .leading, spacing: 14) {
            // OrganicImage's pre-wobble radius, where the curve will land.
            SkeletonBlock(height: nil, radius: 18)
                .aspectRatio(1 / 0.62, contentMode: .fit)
            HStack(spacing: 6) {
                SkeletonBlock(width: 56, height: 22, radius: 11)
                SkeletonBlock(width: 72, height: 22, radius: 11)
            }
            .padding(.top, 8)
            VStack(alignment: .leading, spacing: 8) {
                SkeletonBlock(fraction: 0.9, height: 18)
                SkeletonBlock(fraction: 0.55, height: 18)
            }
            VStack(alignment: .leading, spacing: 8) {
                SkeletonBlock(height: 13)
                SkeletonBlock(height: 13)
                SkeletonBlock(fraction: 0.7, height: 13)
            }
            StoryCardSeparator(palette: palette, seed: seed)
            HStack(spacing: 10) {
                SkeletonBlock(width: 30, circle: true)
                VStack(alignment: .leading, spacing: 6) {
                    SkeletonBlock(width: 96, height: 13)
                    SkeletonBlock(width: 56, height: 11)
                }
                Spacer()
                SkeletonBlock(width: 18, circle: true)
            }
            .padding(.top, 8)
        }
        .environment(\.skeletonHue, palette.hue)
        .modifier(StoryBand(palette: palette, seed: seed, isLast: isLast, verticalPadding: 32))
        .accessibilityHidden(true)
    }
}

/// What a mini card shows (MiniStoryCard: cover, title, author — no excerpt,
/// tags or read time).
public struct MiniStoryCardContent: Sendable, Identifiable {
    public var id: String
    public var title: String
    public var authorName: String
    public var authorInitials: String
    public var authorImageURL: URL?
    public var avatarSeed: Double
    /// The author's accent (tints the avatar and the empty cover); nil for anonymous cards.
    public var authorAccent: Color?
    public var imageURL: URL?
    public var accentHue: Double?

    public init(id: String, title: String, authorName: String, authorInitials: String, authorImageURL: URL?,
                avatarSeed: Double, authorAccent: Color?, imageURL: URL?, accentHue: Double?) {
        self.id = id
        self.title = title
        self.authorName = authorName
        self.authorInitials = authorInitials
        self.authorImageURL = authorImageURL
        self.avatarSeed = avatarSeed
        self.authorAccent = authorAccent
        self.imageURL = imageURL
        self.accentHue = accentHue
    }
}

/// MiniStoryCard's phone form: the pared-back sibling of StoryCardView for
/// resonances and linked cards — the same band, 28pt deep, holding a cover
/// in the author's accent, the title, and the byline.
public struct MiniStoryCardView: View {
    let content: MiniStoryCardContent
    let position: Int
    var isLast: Bool

    public init(_ content: MiniStoryCardContent, position: Int, isLast: Bool = false) {
        self.content = content
        self.position = position
        self.isLast = isLast
    }

    public var body: some View {
        let palette = CardPalette(accentHue: content.accentHue, position: position)
        let seed = Double(position * 71 + 19)
        let accent = content.authorAccent ?? palette.accent
        VStack(alignment: .leading, spacing: 12) {
            OrganicImage(url: content.imageURL, seed: seed + 5, grain: StoryGrain.cover, fill: accent)
                .aspectRatio(1 / 0.56, contentMode: .fit)
                .accessibilityHidden(true)
            CSSText(content.title, font: AppFonts.scaledUIFont(.heading, size: 17, weight: .bold), lineHeight: 1.3)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 9) {
                HandDrawnAvatar(initials: content.authorInitials, imageURL: content.authorImageURL,
                                color: accent, size: 30, seed: content.avatarSeed)
                Text(content.authorName).font(AppFonts.body(13, weight: .semibold)).foregroundStyle(Tokens.text)
            }
            .padding(.top, 2)
        }
        .modifier(StoryBand(palette: palette, seed: seed, isLast: isLast, verticalPadding: 28))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// The wavy rule over the byline: six slow turns across the card.
struct StoryCardSeparator: View {
    let palette: CardPalette
    let seed: Double

    var body: some View {
        WavyRuleShape(seed: seed + 91, amp: 1.2, steps: 6)
            .stroke(palette.separator, style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
            .frame(height: 6)
            .padding(.top, 2)
            .accessibilityHidden(true)
    }
}

/// The phone card's band: its paper tint, the content inset to where the
/// web's page padding plus the card's own puts it (20 + 18), grain over
/// everything (the web lays it above the text and the photo too), and the
/// seven-turn pen rule on the top edge — repeated on the bottom of the last card.
/// The story cards' grain (the web's STORY_GRAIN, src/lib/design/grain.ts):
/// GrainOverlay's mean darkening over the band — text and cover included —
/// and over a cover picture. Kept light: over the text it reads as sandpaper.
enum StoryGrain {
    static let band = 0.045
    static let cover = 0.03
}

struct StoryBand: ViewModifier {
    let palette: CardPalette
    let seed: Double
    let isLast: Bool
    let verticalPadding: CGFloat

    func body(content: Content) -> some View {
        content
            .padding(.vertical, verticalPadding)
            .padding(.horizontal, 38)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(palette.interior)
            // GrainOverlay at StoryGrain.band: ink at 2× so the mean darkening is the band's.
            .overlay {
                GrainLayer(shape: Rectangle(), mode: .tile, opacity: StoryGrain.band * 2, tile: "grain-overlay")
                    .accessibilityHidden(true)
            }
            .overlay(alignment: .top) { edge.offset(y: -3) }
            .overlay(alignment: .bottom) { if isLast { edge.offset(y: 3) } }
    }

    private var edge: some View {
        WavyRuleShape(seed: seed + 17, amp: 1.4, steps: 7)
            .stroke(palette.border, style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
            .frame(height: 6)
            .accessibilityHidden(true)
    }
}

/// The web's striped cover placeholder: the card's fill, diagonal hatching
/// in a darker shade of it, and the label in monospace.
public struct StoryImagePlaceholder: View {
    let fill: Color
    let stripe: Color
    let label: String

    public init(fill: Color, stripe: Color, label: String) {
        self.fill = fill
        self.stripe = stripe
        self.label = label
    }

    public var body: some View {
        ZStack {
            fill
            Canvas { ctx, size in
                // 22 diagonal lines across a 320×200 viewBox, sliced to fill.
                let scale = max(size.width / 320, size.height / 200)
                let dx = (size.width - 320 * scale) / 2, dy = (size.height - 200 * scale) / 2
                for i in 0..<22 {
                    var p = Path()
                    let x = (Double(i) * 22 - 160) * scale + dx
                    p.move(to: CGPoint(x: x, y: dy))
                    p.addLine(to: CGPoint(x: x + 320 * scale, y: 200 * scale + dy))
                    ctx.stroke(p, with: .color(stripe), lineWidth: Tokens.inkLight)
                }
            }
            Text(label)
                .font(.system(size: 10.5, design: .monospaced))
                .foregroundStyle(Tokens.text.opacity(0.42))
                .lineLimit(1)
                .padding(.horizontal, 12)
        }
    }
}

/// Wrapping row (tags), since SwiftUI has no flex-wrap.
public nonisolated struct FlowRow: Layout {
    var spacing: CGFloat

    public init(spacing: CGFloat = 6) {
        self.spacing = spacing
    }

    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal.width ?? .infinity, subviews)
        let width = rows.map { $0.width }.max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(bounds.width, subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(_ maxWidth: CGFloat, _ subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for (i, view) in subviews.enumerated() {
            let size = view.sizeThatFits(.unspecified)
            let extra = rows[rows.count - 1].indices.isEmpty ? size.width : size.width + spacing
            if rows[rows.count - 1].width + extra > maxWidth, !rows[rows.count - 1].indices.isEmpty {
                rows.append(Row())
            }
            let current = rows.count - 1
            rows[current].width += rows[current].indices.isEmpty ? size.width : size.width + spacing
            rows[current].height = max(rows[current].height, size.height)
            rows[current].indices.append(i)
        }
        return rows.filter { !$0.indices.isEmpty }
    }
}
