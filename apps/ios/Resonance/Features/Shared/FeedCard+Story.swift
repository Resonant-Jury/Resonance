import DesignSystem
import ResonanceKit
import SwiftUI

extension FeedCard {
    /// StoryCard's fields (lib/adapters/story.ts cardToStory). Anonymous cards
    /// get the placeholder byline: a dot, seeded from the card id.
    var story: StoryCardContent {
        let author = self.author?.value1
        return StoryCardContent(
            id: id,
            title: title,
            excerpt: excerpt,
            authorName: author?.handle ?? L10n.Card.anonymousAuthor,
            authorInitials: author?.initials ?? "·",
            authorImageURL: author?.avatarUrl.flatMap(URL.init(string:)),
            avatarSeed: author.map { $0.avatarSeedValue } ?? anonymousSeed,
            readTime: "\(readMinutes) min",
            tags: tags,
            imageURL: imageUrl.flatMap(URL.init(string:)),
            imageLabel: imageLabel ?? String(title.prefix(24)),
            accentHue: accentHue,
            // The web leaves a pick unexplained on purpose (home/page.tsx):
            // the surprise of opening the card is the point.
            reason: nil
        )
    }

    /// MiniStoryCard's fields (MiniCardGrid): cover, title, byline — the
    /// author's accent tints the avatar and an empty cover.
    var mini: MiniStoryCardContent {
        let author = self.author?.value1
        return MiniStoryCardContent(
            id: id,
            title: title,
            authorName: author?.handle ?? L10n.Card.anonymousAuthor,
            authorInitials: author?.initials ?? "·",
            authorImageURL: author?.avatarUrl.flatMap(URL.init(string:)),
            avatarSeed: author.map { $0.avatarSeedValue } ?? anonymousSeed,
            authorAccent: author.flatMap { OKLCHColor.parse($0.accentColor) },
            imageURL: imageUrl.flatMap(URL.init(string:)),
            accentHue: accentHue
        )
    }

    private var anonymousSeed: Double { Double((id.unicodeScalars.first?.value ?? 7) * 31) }

    /// Where the card lives on the site (its slug, or its id before it had one).
    var routeKey: String { slug ?? id }
}

extension Author {
    /// HandDrawnAvatar's seed: the stored avatarSeed, else the web's fallback.
    var avatarSeedValue: Double {
        if let seed = avatarSeed, let n = Double(seed) { return n }
        return Double((initials.unicodeScalars.first?.value ?? 7) * 13)
    }

    var accent: Color { OKLCHColor.parse(accentColor) ?? Tokens.terracottaLight }
}
