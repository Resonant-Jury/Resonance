import Foundation
import ResonanceAPI

/// The links an author puts in a story, standing alone in a paragraph, drawn as the page's preview
/// card (src/lib/links/storyLinks.ts): the server reads each page once the card is published or
/// edited and keeps what it found on the card (`CardDetail.linkPreviews`, in reading order); the
/// reader finds a paragraph's preview by the paragraph's key — its link normalized by the same
/// rules the chat's links follow (`ChatLinks`).
///
/// Shared with the web and Android case by case through native/fixtures/story-link-cards.json.
public enum StoryLinks {
    /// The key of a paragraph the story parser found standing alone (`StoryBlock.soleLink`): for an
    /// explicit link, its address as the link rules take it; for a bare address, the one link the
    /// rules find in the words — when it is all of them (`https://example.com很棒` is the link
    /// `https://example.com/` and two more words, so it stays words). Nil when the rules take no
    /// link there (another scheme, a port, a user name, an address in disguise such as `127.1`).
    public static func key(href: String?, text: String) -> String? {
        if let href {
            return ChatLinks.parse(href.trimmingCharacters(in: .whitespacesAndNewlines))?.url.absoluteString
        }
        let found = ChatLinks.links(in: text)
        guard found.count == 1, let only = found.first, only.range.location == 0, only.range.length == text.utf16.count
        else { return nil }
        return only.url.absoluteString
    }

    /// A card's previews by key, as the server sent them: each one whose address the link rules
    /// take (it is what a tap opens) and that has a title, its picture only when it is our image
    /// proxy's (`origin` is the API's). The first of any two for one address wins.
    public static func previews(_ sent: [Components.Schemas.LinkPreview]?, origin: URL) -> [String: LinkPreview] {
        var out: [String: LinkPreview] = [:]
        for item in sent ?? [] {
            guard let link = ChatLinks.parse(item.url), out[link.url.absoluteString] == nil,
                  let title = trimmed(item.title) else { continue }
            out[link.url.absoluteString] = LinkPreview(link: link, title: title, description: trimmed(item.description),
                                                       siteName: trimmed(item.siteName),
                                                       imageURL: ChatMessage.imageURL(item.image, origin: origin))
        }
        return out
    }

    private static func trimmed(_ value: String?) -> String? {
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text
    }
}
