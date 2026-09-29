import SwiftUI

/// EmbedStoryCard: the smallest of the story-card family, set inside an
/// article — a 52pt thumbnail on the left, title over author on the right, in
/// a hand-drawn frame tinted with the card's hue, at most 360 wide.
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
        let interior = OKLCHColor.color(0.975, 0.012, hue)
        let accent = OKLCHColor.color(0.9, 0.06, hue)
        let border = OKLCHColor.color(0.52, 0.11, hue)
        HStack(spacing: 12) {
            OrganicImage(url: imageURL, seed: seed + 5, grain: 0.055, fill: accent)
                .frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 2) {
                CSSText(title, font: AppFonts.uiFont(.body, size: 14.5, weight: .semibold), lineHeight: 1.35, lineLimit: 2)
                if let author {
                    Text(author)
                        .font(AppFonts.body(12))
                        .foregroundStyle(Tokens.textMuted)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 16))
        .background {
            let shape = WobRectShape(radius: 16, seed: seed)
            shape.fill(interior)
            shape.stroke(border, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
        }
        .frame(maxWidth: 360, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// CardEmbedLink's loading chip: the embed's footprint (72 tall, 360 wide at
/// most) in plain CSS chrome — no wobble — holding the link's own words, so
/// the story doesn't reflow when the card arrives.
public struct EmbedStoryCardPlaceholder: View {
    let title: String

    public init(title: String) {
        self.title = title
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        CSSText(title, font: AppFonts.uiFont(.body, size: 14.5, weight: .semibold), lineHeight: 1.35,
                color: UIColor(Tokens.textMuted), lineLimit: 2)
            .padding(EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 16))
            .frame(maxWidth: 360, minHeight: 72, maxHeight: 72, alignment: .leading)
            .background(shape.fill(OKLCHColor.color(0.975, 0.012, 55)))
            .overlay(shape.strokeBorder(Tokens.text.opacity(0.22), lineWidth: 1.5))
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
