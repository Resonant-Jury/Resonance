import DesignSystem
import ResonanceKit
import SwiftUI

/// InsertCardModal: one of your public cards — dropped into a story as an
/// embedded card, or shared in a conversation. Rows carry a small cover
/// (the card's hue when it has none) and the title on two lines.
struct CardPickerContent: View {
    let title: String
    let subtitle: String
    let onPick: (FeedCard) -> Void
    let onCancel: () -> Void
    @Environment(SessionStore.self) private var session
    @State private var cards: [FeedCard]?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(title).padding(.bottom, 4)
            Text(subtitle).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted).padding(.bottom, 12)
            if let cards {
                if cards.isEmpty {
                    Text(L10n.Write.Editor.CardModal.empty).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted).padding(.vertical, 12)
                } else {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                                if i > 0 { WavyDivider(seed: Double(67 + i * 31)) }
                                Button { onPick(card) } label: {
                                    HStack(spacing: 12) {
                                        OrganicImage(url: card.imageUrl.flatMap(URL.init(string:)), seed: Double(i * 7 + 3),
                                                     fill: OKLCHColor.color(0.9, 0.06, card.accentHue ?? 55))
                                            .frame(width: 48, height: 48)
                                        Text(card.title).font(AppFonts.body(15, weight: .semibold)).foregroundStyle(Tokens.text)
                                            .lineLimit(2).multilineTextAlignment(.leading)
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.vertical, 10).padding(.horizontal, 6)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .frame(maxHeight: UIScreen.main.bounds.height * 0.5)
                    .fixedSize(horizontal: false, vertical: true)
                    .scrollIndicators(.hidden)
                }
            } else {
                Text("…").font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted).padding(.vertical, 12)
            }
            ModalActions { OrganicButton(L10n.Write.Editor.CardModal.cancel, variant: .ghost, size: .sm, action: onCancel) }
        }
        // getCardsByAuthor(me, 'published'), public ones only.
        .task { cards = ((try? await session.reading.cardBox(.published)) ?? []).filter { $0.visibility == ._public && $0.publishedAt != nil } }
    }
}
