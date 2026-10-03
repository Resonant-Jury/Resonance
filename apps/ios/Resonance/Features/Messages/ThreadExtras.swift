import DesignSystem
import ResonanceKit
import SwiftUI

/// What a reply answers, above its bubble (ReplyQuote.tsx): a small caption
/// (who replied to whom) and the quoted words as a faded, two-line ghost of a
/// bubble that the reply bubble slightly overlaps. A card-only original reads
/// 「一張卡片」. Tapping it scrolls to the original when it is loaded.
struct ReplyQuoteView: View {
    let quote: ReplyQuote
    let mine: Bool
    let viewerId: String
    let otherHandle: String
    let canJump: Bool
    let onJump: () -> Void

    var body: some View {
        let quotesViewer = quote.senderId == viewerId
        let caption = mine
            ? (quotesViewer ? L10n.Messages.youRepliedToYourself : L10n.Messages.youRepliedTo(handle: otherHandle))
            : (quotesViewer ? L10n.Messages.repliedToYou(handle: otherHandle) : L10n.Messages.repliedToThemselves(handle: otherHandle))
        let words = quote.text.isEmpty ? (quote.cardRef == nil ? "" : L10n.Messages.replyCard) : quote.text
        VStack(alignment: mine ? .trailing : .leading, spacing: 3) {
            HStack(spacing: 4) {
                OrganicIcon(.reply, size: 12, color: Tokens.textMuted)
                Text(caption).font(AppFonts.body(11.5)).foregroundStyle(Tokens.textMuted)
            }
            if !words.isEmpty {
                Button { if canJump { onJump() } } label: {
                    MessageBubble(text: words, mine: mine, seed: seedFromId("q-" + quote.id), ghost: true)
                        .opacity(0.8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(words)
            }
        }
        // The reply's bubble sits a little over the ghost.
        .padding(.bottom, -8)
    }
}

/// The first link of a message as a card under its bubble (LinkPreviewCard.tsx):
/// the picture when the page had one, the title, a line of description and the
/// site's host. The address passed the link rules when the message was read
/// (`ChatMessage.from`), the host shown is the real ASCII one, and the
/// picture comes only from the site's own `/api/link-image` route.
struct LinkPreviewCard: View {
    let preview: LinkPreview
    let onOpen: (ChatLinks.Parsed) -> Void

    var body: some View {
        let link = preview.link
        let seed = Double(seedFromString(preview.url.absoluteString))
        Button { onOpen(link) } label: {
            VStack(alignment: .leading, spacing: 8) {
                if let image = preview.imageURL {
                    OrganicImage(url: image, seed: seed + 3, radius: 12, fill: Tokens.terracottaLight.opacity(0.4))
                        .aspectRatio(1.91, contentMode: .fit)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(preview.title)
                        .font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.text)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    if let description = preview.description, !description.isEmpty {
                        Text(description)
                            .font(AppFonts.body(12.5)).foregroundStyle(Tokens.textMuted)
                            .lineLimit(2).multilineTextAlignment(.leading)
                    }
                    HStack(spacing: 4) {
                        OrganicIcon(.link, size: 11, color: Tokens.textMuted)
                        Text(link.host.replacingOccurrences(of: "www.", with: "", options: .anchored))
                            .font(AppFonts.body(11)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                    }
                }
                .padding(.horizontal, 4).padding(.bottom, 2)
            }
            .padding(10)
            .frame(width: 280, alignment: .leading)
            .background {
                let shape = WobRectShape(radius: 16, seed: seed)
                shape.fill(Tokens.cream)
                shape.stroke(Tokens.fieldBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}
