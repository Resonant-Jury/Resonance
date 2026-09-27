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
            OrganicImage(url: content.imageURL, seed: seed + 5) {
                StoryImagePlaceholder(fill: palette.fill, label: content.imageLabel)
            }
            .aspectRatio(1 / 0.62, contentMode: .fit)
            .accessibilityHidden(true)

            if !content.tags.isEmpty {
                FlowRow(spacing: 6) {
                    ForEach(content.tags.prefix(4), id: \.self) { TagPill($0, fill: palette.fill) }
                }
                .padding(.top, 8)
            }

            CSSText(content.title, font: AppFonts.uiFont(.heading, size: 18, weight: .bold), lineHeight: 1.3)
                .accessibilityAddTraits(.isHeader)

            CSSText(content.excerpt, font: AppFonts.uiFont(.body, size: 14), lineHeight: 1.65, color: UIColor(Tokens.textMuted))

            WavyLineShape(seed: seed + 91, amp: 1.2)
                .stroke(palette.separator, style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
                .frame(height: 6)
                .padding(.top, 2)
                .accessibilityHidden(true)

            HStack(spacing: 10) {
                HandDrawnAvatar(initials: content.authorInitials, imageURL: content.authorImageURL,
                                color: palette.fill, size: 30, seed: content.avatarSeed)
                VStack(alignment: .leading, spacing: 1) {
                    Text(content.authorName).font(AppFonts.body(13, weight: .semibold)).foregroundStyle(Tokens.text)
                    Text(content.readTime).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
                }
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Tokens.text.opacity(0.28))
                    .accessibilityHidden(true)
            }
            .padding(.top, 8)

            if let reason = content.reason, !reason.isEmpty {
                HStack(alignment: .top, spacing: 7) {
                    Image(systemName: "sparkle").font(.system(size: 12)).padding(.top, 5)
                    Text(reason).font(AppFonts.handwritten(17)).tracking(0.34).lineSpacing(17 * 0.45)
                }
                .foregroundStyle(palette.noteInk)
                .padding(.top, -4)
            }
        }
        .padding(.vertical, 32)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack {
                palette.interior
                // GrainOverlay opacity 0.08: ink at 2× so the mean darkening is 8%.
                GrainLayer(shape: Rectangle(), mode: .tile, opacity: 0.16, tile: "grain-overlay")
            }
        }
        .overlay(alignment: .top) { edge(seed + 17).offset(y: -3) }
        .overlay(alignment: .bottom) { if isLast { edge(seed + 23).offset(y: 3) } }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func edge(_ seed: Double) -> some View {
        WavyLineShape(seed: seed, amp: 1.4)
            .stroke(palette.border, style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
            .frame(height: 6)
            .accessibilityHidden(true)
    }
}

/// The web's striped cover placeholder: the card's fill, faint diagonal
/// hatching, the label in monospace, and grain.
public struct StoryImagePlaceholder: View {
    let fill: Color
    let label: String

    public init(fill: Color, label: String) {
        self.fill = fill
        self.label = label
    }

    public var body: some View {
        ZStack {
            fill
            Canvas { ctx, size in
                // 22 diagonal lines across a 320×200 viewBox, sliced to fill.
                let scale = max(size.width / 320, size.height / 200)
                for i in 0..<22 {
                    var p = Path()
                    let x = (Double(i) * 22 - 160) * scale
                    p.move(to: CGPoint(x: x, y: 0))
                    p.addLine(to: CGPoint(x: x + 320 * scale, y: 200 * scale))
                    ctx.stroke(p, with: .color(Tokens.text.opacity(0.07)), lineWidth: Tokens.inkLight)
                }
            }
            Text(label)
                .font(.system(size: 10.5, design: .monospaced))
                .foregroundStyle(Tokens.text.opacity(0.42))
                .lineLimit(1)
                .padding(.horizontal, 12)
            GrainLayer(shape: Rectangle(), mode: .tile, opacity: 0.11, tile: "grain-overlay")
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
