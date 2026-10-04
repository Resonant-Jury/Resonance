import NukeUI
import SwiftUI

/// A link standing alone in a story, drawn as what its page says about itself (the server's
/// preview of it): the page's picture when it has one, its title, a line or two of description
/// and the site's host — the story-column sibling of a chat message's link preview, in the
/// lightly inked hand-drawn card of an embedded story card (StoryLinkCard.tsx).
///
/// The whole card is one link (`onOpen`). `host` is always the real one, in ASCII (punycode for an
/// international name), whatever the page called itself; the picture comes only from our own image
/// route (the server fetched it), and one that won't load leaves no empty frame behind.
/// `openLabel` is what VoiceOver calls the card ("Open link: example.com").
public struct StoryLinkCard: View {
    let title: String
    let description: String?
    let host: String
    let imageURL: URL?
    let seed: Double
    let openLabel: String
    let onOpen: () -> Void
    @State private var pictureFailed = false

    public init(title: String, description: String?, host: String, imageURL: URL?, seed: Double, openLabel: String,
                onOpen: @escaping () -> Void) {
        self.title = title
        self.description = description
        self.host = host
        self.imageURL = imageURL
        self.seed = seed
        self.openLabel = openLabel
        self.onOpen = onOpen
    }

    public var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 10) {
                if let imageURL, !pictureFailed {
                    LinkPicture(url: imageURL, seed: seed + 3) { pictureFailed = true }
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(AppFonts.body(16, weight: .semibold)).foregroundStyle(Tokens.text)
                        .lineSpacing(2).lineLimit(2).multilineTextAlignment(.leading)
                    if let description, !description.isEmpty {
                        Text(description)
                            .font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                            .lineSpacing(3).lineLimit(2).multilineTextAlignment(.leading)
                    }
                    HStack(spacing: 6) {
                        OrganicIcon(.link, size: 15, color: Tokens.textMuted)
                        Text(host).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted).lineLimit(1).truncationMode(.tail)
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 8)
                .padding(.top, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, 10).padding(.horizontal, 10).padding(.bottom, 14)
            .frame(maxWidth: 520, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(LinkCardStyle(seed: seed))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(openLabel)
        .accessibilityValue(title)
        .accessibilityAddTraits(.isLink)
    }
}

/// The card's paper and its light pen line (both on the card's own seed); pressed, the paper takes
/// the hover wash and the line darkens, as the web's card does under a pointer.
private struct LinkCardStyle: ButtonStyle {
    let seed: Double

    func makeBody(configuration: Configuration) -> some View {
        let shape = WobRectShape(radius: 16, seed: seed)
        configuration.label
            .background {
                shape.fill(Tokens.cardBg)
                shape.fill(Tokens.creamDark).opacity(configuration.isPressed ? 1 : 0)
                shape.stroke(configuration.isPressed ? Tokens.fieldBorderHover : Tokens.fieldBorder,
                             style: StrokeStyle(lineWidth: Tokens.inkLight, lineJoin: .round))
            }
            .animation(.easeOut(duration: configuration.isPressed ? 0.1 : 0.3), value: configuration.isPressed)
    }
}

/// The page's picture at 1.91:1 (the share-image ratio) in the organic clip of a story photo; a
/// picture that won't load says so (`onError`) and its frame goes with it.
private struct LinkPicture: View {
    let url: URL
    let seed: Double
    let onError: () -> Void

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            // Past the wobble's outward swing, so the clip lands on picture, not on nothing.
            let bleed = (min(w, h) * 0.05 + 6 + 4).rounded(.up)
            LazyImage(url: url) { state in
                if let image = state.image {
                    image.resizable().scaledToFill()
                } else if state.error != nil {
                    Color.clear.onAppear(perform: onError)
                } else {
                    Tokens.creamDark
                }
            }
            .frame(width: w + bleed * 2, height: h + bleed * 2)
            .clipShape(OrganicImageShape(seed: seed, radius: 12, bleed: bleed))
            .offset(x: -bleed, y: -bleed)
        }
        .aspectRatio(1.91, contentMode: .fit)
        .accessibilityHidden(true)
    }
}
