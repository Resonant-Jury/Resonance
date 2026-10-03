import DesignSystem
import ResonanceKit
import SwiftUI

/// InsertCardModal: one of your public cards — dropped into a story as an
/// embedded card, or shared in a conversation. Rows carry a small cover
/// (the card's hue when it has none) and the title on two lines; a tap is the pick.
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
            CardPickList(cards: cards ?? [], onPick: onPick) {
                EmptyView()
            } empty: {
                Text(cards == nil ? "…" : L10n.Write.Editor.CardModal.empty)
                    .font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted).padding(.vertical, 12)
            }
            // A list to pick from: its one way out, centred under it (its rows carry their own 10).
            ModalCloseButton(L10n.Write.Editor.CardModal.cancel, action: onCancel)
        }
        // getCardsByAuthor(me, 'published'), public ones only.
        .task { cards = ((try? await session.reading.cardBox(.published)) ?? []).filter { $0.visibility == ._public && $0.publishedAt != nil } }
    }
}

/// The author's own cards as a list to pick from (CardPickList.tsx): a cover thumb and the title on
/// each row, rows parted by a wavy pen rule — no boxed press region; the ink answers instead. What
/// comes first (`lead`) scrolls with the rows; `empty` stands in for rows when there are none, and
/// `footnote` is a quiet line under them (why some cards aren't listed).
///
/// As a choice (`choosing`), a tap marks a row instead of being the pick — its cover washed in the
/// accent with a cream tick, its title in the accent — so the pick reads before the modal's verb
/// confirms it (VoiceOver hears which is chosen). `disabled` rests the rows while a request
/// is on its way (the chosen one stays as it was). An anonymous card carries `anonymousLabel`.
struct CardPickList<Lead: View, Empty: View>: View {
    let cards: [FeedCard]
    var choosing = false
    var selectedId: String?
    var disabled = false
    var anonymousLabel: String?
    var footnote: String?
    let onPick: (FeedCard) -> Void
    @ViewBuilder let lead: Lead
    @ViewBuilder let empty: Empty

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                lead
                if cards.isEmpty {
                    empty
                } else {
                    ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                        if i > 0 { WavyDivider(seed: Double(67 + i * 31)) }
                        row(card, at: i)
                    }
                }
                if let footnote {
                    Text(footnote)
                        .font(AppFonts.body(12.5)).foregroundStyle(Tokens.textMuted)
                        .lineSpacing(12.5 * 0.4)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 6).padding(.top, 10).padding(.bottom, 2)
                }
            }
        }
        .frame(maxHeight: UIScreen.main.bounds.height * 0.5)
        .fixedSize(horizontal: false, vertical: true)
        .scrollIndicators(.hidden)
        .padding(.bottom, choosing ? 18 : 0)
    }

    private func row(_ card: FeedCard, at i: Int) -> some View {
        let chosen = choosing && card.id == selectedId
        return Button { onPick(card) } label: {
            HStack(spacing: 12) {
                OrganicImage(url: card.imageUrl.flatMap(URL.init(string:)), seed: Double(i * 7 + 3),
                             fill: OKLCHColor.color(0.9, 0.06, card.accentHue ?? 55))
                    .overlay {
                        if chosen {
                            // Washed in the accent inside the thumb's own outline, with the tick on it.
                            ZStack {
                                OrganicImage(url: nil, seed: Double(i * 7 + 3), fill: Tokens.terracotta.opacity(0.82))
                                OrganicIcon(.check, size: 24, color: Tokens.cream)
                            }
                            .transition(.opacity)
                        }
                    }
                    .frame(width: 48, height: 48)
                VStack(alignment: .leading, spacing: 4) {
                    Text(card.title).font(AppFonts.body(15, weight: .semibold))
                        .foregroundStyle(chosen ? Tokens.terracotta : Tokens.text)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    if card.anonymous, let anonymousLabel {
                        TagPill(anonymousLabel, fill: Tokens.creamDark, size: .sm)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 10).padding(.horizontal, 6)
            .contentShape(Rectangle())
            .animation(.easeOut(duration: 0.18), value: chosen)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled && !chosen ? 0.5 : 1)
        .accessibilityAddTraits(choosing && chosen ? .isSelected : [])
    }
}
