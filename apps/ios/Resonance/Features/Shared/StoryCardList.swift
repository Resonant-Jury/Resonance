import DesignSystem
import ResonanceKit
import SwiftUI

/// Cards as the web lists them: full-bleed bands on a phone (and down a medium
/// window's middle), the bordered cards in two or three columns on a wide one
/// (``CardColumns``), each a link to its page. A card on screen is remembered,
/// so its page opens with it drawn.
struct StoryCardList: View {
    let cards: [FeedCard]
    /// The first card's top edge is the bar's pen line (home: design §2).
    var underBar = false
    /// False keeps the bands at every width (a card page's related cards beside its article).
    var grid = true
    var onAppearLast: (() -> Void)? = nil
    @Environment(SessionStore.self) private var session

    var body: some View {
        // One colouring for the list as shown (round 5 B3): no card wears a neighbour's family.
        let palettes = CardPalette.palettes(cards.map(\.accentHue))
        CardColumns(count: cards.count, underBar: underBar, grid: grid) { i, bordered in
            let card = cards[i]
            NavigationLink(value: Route.card(card.routeKey)) {
                StoryCardView(card.story, position: i, isLast: i == cards.count - 1, underBar: underBar && i == 0, bordered: bordered,
                              palette: palettes[i])
            }
            .buttonStyle(.plain)
            .onAppear {
                session.cardPreviews.remember(card)
                if i == cards.count - 1 { onAppearLast?() }
            }
        }
    }
}

/// A story-card list's layout (design §10): one column of bands, or on an expanded window the
/// web's desktop grid — 2 or 3 columns by the content's width, row-major (card i in column i mod n,
/// each column stacking its own, as CardLinkGrid), 24 apart, within 1200 and the page's pads.
struct CardColumns<Item: View>: View {
    let count: Int
    var underBar = false
    var grid = true
    @ViewBuilder let item: (_ index: Int, _ bordered: Bool) -> Item
    @Environment(\.window) private var window
    /// The list's own width (a card page's column is narrower than the window).
    @State private var measured: CGFloat?

    var body: some View {
        let width = measured ?? window.contentWidth
        let content = max(0, min(width, 1200) - 2 * window.pad)
        let columns = grid ? LayoutClass.feedColumns(window.layoutClass, contentWidth: content) : 1
        Group {
            if columns > 1 {
                HStack(alignment: .top, spacing: Tokens.feedGap) {
                    ForEach(0..<columns, id: \.self) { column in
                        LazyVStack(spacing: Tokens.feedGap) {
                            ForEach(Array(stride(from: column, to: count, by: columns)), id: \.self) { i in
                                item(i, true)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .top)
                    }
                }
                .padding(.horizontal, window.pad)
                .frame(maxWidth: 1200)
                .frame(maxWidth: .infinity)
                // Under the bar a card's outline is never beneath it at rest (design §2).
                .padding(.top, underBar ? 28 : 4)
                .padding(.bottom, 8)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(0..<count, id: \.self) { i in item(i, false) }
                }
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { measured = $0 }
    }
}

/// MiniCardGrid on a phone: the pared-back bands for resonances and linked cards.
struct MiniCardList: View {
    let cards: [FeedCard]
    @Environment(SessionStore.self) private var session

    var body: some View {
        let palettes = CardPalette.palettes(cards.map(\.accentHue))
        LazyVStack(spacing: 0) {
            ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                NavigationLink(value: Route.card(card.routeKey)) {
                    MiniStoryCardView(card.mini, position: i, isLast: i == cards.count - 1, palette: palettes[i])
                }
                .buttonStyle(.plain)
                .onAppear { session.cardPreviews.remember(card) }
            }
        }
    }
}

/// FeedSkeleton: loading bands in the real card's chrome, so nothing jumps
/// when the cards arrive.
struct FeedSkeleton: View {
    var count = 6
    var underBar = false

    var body: some View {
        // Hue-less cards by position (the rule's answer for them).
        let palettes = CardPalette.palettes(Array(repeating: nil, count: count))
        CardColumns(count: count, underBar: underBar) { i, bordered in
            StoryCardSkeleton(position: i, isLast: i == count - 1, underBar: underBar && i == 0, bordered: bordered, palette: palettes[i])
        }
        .accessibilityElement()
        .accessibilityLabel("Loading")
    }
}
