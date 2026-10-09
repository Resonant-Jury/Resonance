import NukeUI
import SwiftUI

/// A link standing alone in a story, drawn as what its page says about itself (the server's
/// preview of it): the page's picture when it has one, its title, a line or two of description
/// and the site's host — the story-column sibling of a chat message's link preview, in the chat
/// card bubble's language (StoryLinkCard.tsx, the filled look B): a block of light fill
/// (`bubbleTheirs`) in a seeded wobbly outline, with no pen line round it.
///
/// The picture runs across the card's top edge to edge, cut by the card's own outline (the same
/// seeded path as its fill and its press), so the card has one edge, not a frame round a framed
/// picture; its foot meets the words directly. Without a picture (none, or one that won't load):
/// just the fill with the words. Upright wherever it stands — a story's quote sets its own words
/// in italics, never the card quoted in it (the card's type is its own).
///
/// The whole card is one link (`onOpen`). `host` is always the real one, in ASCII (punycode for an
/// international name), whatever the page called itself; the picture comes only from our own image
/// route (the server fetched it). `openLabel` is what VoiceOver calls the card ("Open link: example.com").
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

    /// The card's look, as the web's: the chat card bubble's fill, the quote's under a finger, no stroke.
    public enum Look {
        public static let fill = Tokens.bubbleTheirs
        public static let pressedFill = Tokens.bubbleQuote
        /// The description and the host line (glyph and words) at rest: deeper than text-muted,
        /// which read about 4.3:1 on the fill.
        public static let muted = Tokens.linkCardMeta
        public static let radius = 16.0
        /// How far the picture reaches past the card's box on its top and sides, so the outline's
        /// outward swings (a few points at most) still land on picture.
        public static let bleed: CGFloat = 8
    }

    public var body: some View {
        let picture = pictureFailed ? nil : imageURL
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 0) {
                if let picture {
                    LinkPicture(url: picture) { pictureFailed = true }
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(AppFonts.body(16, weight: .semibold)).foregroundStyle(Tokens.text)
                        .lineSpacing(2).lineLimit(2).multilineTextAlignment(.leading)
                    if let description, !description.isEmpty {
                        Text(description)
                            .font(AppFonts.body(14)).foregroundStyle(Look.muted)
                            .lineSpacing(3).lineLimit(2).multilineTextAlignment(.leading)
                    }
                    LinkHost(host: host).padding(.top, 4)
                }
                .padding(.horizontal, 18)
                .padding(.top, picture == nil ? 16 : 12)
                .padding(.bottom, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
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

/// The card's fill in its seeded outline, which also cuts what lies on it (the picture's top and
/// sides); pressed, the fill takes the quote's deeper wash, as the web's card does under a pointer.
private struct LinkCardStyle: ButtonStyle {
    let seed: Double

    func makeBody(configuration: Configuration) -> some View {
        let shape = WobRectShape(radius: StoryLinkCard.Look.radius, seed: seed)
        configuration.label
            .environment(\.linkCardPressed, configuration.isPressed)
            .background {
                shape.fill(StoryLinkCard.Look.fill)
                shape.fill(StoryLinkCard.Look.pressedFill).opacity(configuration.isPressed ? 1 : 0)
            }
            .clipShape(shape)
            .animation(.easeOut(duration: configuration.isPressed ? 0.1 : 0.3), value: configuration.isPressed)
    }
}

private extension EnvironmentValues {
    @Entry var linkCardPressed = false
}

/// The host line: the link glyph and the host, turning to the link colour under a finger.
private struct LinkHost: View {
    let host: String
    @Environment(\.linkCardPressed) private var pressed

    var body: some View {
        HStack(spacing: 6) {
            OrganicIcon(.link, size: 15, color: StoryLinkCard.Look.muted)
            Text(host).font(AppFonts.body(13)).foregroundStyle(pressed ? Tokens.terracotta : StoryLinkCard.Look.muted)
                .lineLimit(1).truncationMode(.tail)
        }
    }
}

/// The page's picture at 1.91:1 (the share-image ratio), flush with the card's top and sides: it
/// reaches `bleed` past them (the card's outline, which clips it, swings out a little there); its
/// foot is straight and meets the words. A picture that won't load says so (`onError`) and its
/// room goes with it.
private struct LinkPicture: View {
    let url: URL
    let onError: () -> Void

    var body: some View {
        GeometryReader { geo in
            let bleed = StoryLinkCard.Look.bleed
            LazyImage(url: url) { state in
                if let image = state.image {
                    image.resizable().scaledToFill()
                } else if state.error != nil {
                    Color.clear.onAppear(perform: onError)
                } else {
                    Tokens.text.opacity(0.06)
                }
            }
            .frame(width: geo.size.width + bleed * 2, height: geo.size.height + bleed)
            .clipped()
            .offset(x: -bleed, y: -bleed)
        }
        .aspectRatio(1.91, contentMode: .fit)
        .accessibilityHidden(true)
    }
}
