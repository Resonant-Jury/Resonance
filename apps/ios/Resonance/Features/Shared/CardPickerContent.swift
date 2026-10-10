import DesignSystem
import ResonanceKit
import SwiftUI

/// InsertCardModal: one of your public cards — dropped into a story as an
/// embedded card, or shared in a conversation. Rows carry a small cover
/// (the card's hue when it has none), the title and when it came out; a tap is the pick.
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
            // A list to pick from: its one way out, centred under it.
            ModalCloseButton(L10n.Write.Editor.CardModal.cancel, action: onCancel)
        }
        // getCardsByAuthor(me, 'published'), public ones only.
        .task { cards = ((try? await session.reading.cardBox(.published)) ?? []).filter { $0.visibility == ._public && $0.publishedAt != nil } }
    }
}

/// The author's own cards as a list to pick from (CardPickList.tsx), quiet enough to scan: on each
/// row a 40pt cover thumb (the card's hue when it has none), the title on one line and one muted
/// line under it — when it came out, led by 匿名 for an anonymous card (`anonymousLabel`). No rule
/// between rows (the one wavy rule parts the lead from them) and no boxed press region. What comes first
/// (`lead`) scrolls with the rows; `empty` stands in for rows when there are none, and `footnote`
/// is a quiet line under them (why some cards aren't listed).
///
/// As a choice (`choosing`, named `label` for VoiceOver), a tap marks a row instead of being the
/// pick — its cover washed in the accent with a cream tick, its title in the deep accent — so the pick
/// reads before the modal's verb confirms it (VoiceOver hears which is chosen). `disabled` rests
/// the rows while a request is on its way (the chosen one stays as it was).
struct CardPickList<Lead: View, Empty: View>: View {
    let cards: [FeedCard]
    var choosing = false
    var selectedId: String?
    var disabled = false
    var label: String?
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
                    VStack(alignment: .leading, spacing: 0) {
                        // One wavy rule parts the way to write from the cards (the lead's); the rows
                        // themselves need none — their thumbs and titles line them up.
                        ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                            row(card, at: i)
                        }
                    }
                    // As a choice, its rows are one group, named by the modal's title.
                    .modifier(ChoiceGroup(label: choosing ? label : nil))
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

    /// A row's muted line: when the card came out (「10月5日」/ "Oct 5", the year too before this
    /// one), led by 「匿名 · 」/ "Anonymous · " for an anonymous card when the list marks them.
    static func meta(_ card: FeedCard, anonymousLabel: String?, now: Date = .now,
                     language: Strings.Language = Strings.shared.language) -> String {
        let locale = Locale(identifier: language == .zhTW ? "zh-Hant-TW" : "en")
        let date = card.publishedAt.flatMap(ISO8601.date).map { day in
            let thisYear = Calendar.current.component(.year, from: day) == Calendar.current.component(.year, from: now)
            return thisYear
                ? day.formatted(Date.FormatStyle(locale: locale).month(.abbreviated).day())
                : day.formatted(Date.FormatStyle(locale: locale).year().month(.abbreviated).day())
        }
        return [card.anonymous ? anonymousLabel : nil, date].compactMap { $0 }.joined(separator: " · ")
    }

    private func row(_ card: FeedCard, at i: Int) -> some View {
        let chosen = choosing && card.id == selectedId
        let meta = Self.meta(card, anonymousLabel: anonymousLabel)
        return Button { onPick(card) } label: {
            HStack(spacing: 12) {
                // The avatar's shape at a smaller radius (design §6); chosen, washed in the accent with the grain and a tick.
                HandDrawnThumb(url: card.imageUrl.flatMap(URL.init(string:)), fill: OKLCHColor.color(0.9, 0.06, card.accentHue ?? 55),
                               size: 40, seed: Double(i * 7 + 3), chosen: chosen)
                VStack(alignment: .leading, spacing: 3) {
                    // One line: a long title ends in an ellipsis rather than making its row taller.
                    Text(card.title).font(AppFonts.body(15, weight: .semibold))
                        .foregroundStyle(chosen ? Tokens.buttonOnTonal : Tokens.text)
                        .lineLimit(1).truncationMode(.tail)
                    if !meta.isEmpty {
                        Text(meta).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                            .lineLimit(1).truncationMode(.tail)
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
        // Named by its title, described by its line.
        .accessibilityLabel(card.title)
        .accessibilityValue(meta)
        .accessibilityAddTraits(choosing && chosen ? .isSelected : [])
    }
}

/// A choice's rows as one group VoiceOver names (the web's radiogroup `aria-label`).
private struct ChoiceGroup: ViewModifier {
    let label: String?

    func body(content: Content) -> some View {
        if let label {
            content.accessibilityElement(children: .contain).accessibilityLabel(label)
        } else {
            content
        }
    }
}
