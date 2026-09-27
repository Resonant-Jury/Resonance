import SwiftUI

/// EmbedStoryCard: the smallest of the story-card family, set inside an
/// article — thumbnail on the left, title over author on the right, in a
/// hand-drawn frame tinted with the card's hue.
public struct EmbedStoryCard: View {
    let title: String
    let author: String?
    let imageURL: URL?
    let hue: Double
    let seed: Double

    public init(title: String, author: String?, imageURL: URL?, hue: Double?, seed: Double) {
        self.title = title
        self.author = author
        self.imageURL = imageURL
        self.hue = hue ?? 55
        self.seed = seed
    }

    public var body: some View {
        let interior = OKLCHColor.parse("oklch(97.5% 0.012 \(hue))") ?? Tokens.cardBg
        let accent = OKLCHColor.parse("oklch(90% 0.06 \(hue))") ?? Tokens.terracottaLight
        let border = OKLCHColor.parse("oklch(52% 0.11 \(hue))") ?? Tokens.terracotta
        HStack(spacing: 14) {
            OrganicImage(url: imageURL, seed: seed + 5) {
                ZStack {
                    accent
                    GrainLayer(shape: Rectangle(), mode: .tile, opacity: 0.11, tile: "grain-overlay")
                }
            }
            .frame(width: 64, height: 64)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(AppFonts.heading(16))
                    .foregroundStyle(Tokens.text)
                    .lineLimit(2)
                if let author {
                    Text(author).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background {
            let shape = WobRectShape(radius: 16, seed: seed)
            shape.fill(interior)
            shape.stroke(border, lineWidth: Tokens.ink)
        }
        .accessibilityElement(children: .combine)
    }
}
