import DesignSystem
import ResonanceKit
import SwiftUI

/// Cards as the web lists them on a phone: full-bleed bands, each a link to
/// its page. A card on screen is remembered, so its page opens with it drawn.
struct StoryCardList: View {
    let cards: [FeedCard]
    var onAppearLast: (() -> Void)? = nil
    @Environment(SessionStore.self) private var session

    var body: some View {
        LazyVStack(spacing: 0) {
            ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                NavigationLink(value: Route.card(card.routeKey)) {
                    StoryCardView(card.story, position: i, isLast: i == cards.count - 1)
                }
                .buttonStyle(.plain)
                .onAppear {
                    session.cardPreviews.remember(card)
                    if i == cards.count - 1 { onAppearLast?() }
                }
            }
        }
    }
}

/// MiniCardGrid on a phone: the pared-back bands for resonances and linked cards.
struct MiniCardList: View {
    let cards: [FeedCard]
    @Environment(SessionStore.self) private var session

    var body: some View {
        LazyVStack(spacing: 0) {
            ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                NavigationLink(value: Route.card(card.routeKey)) {
                    MiniStoryCardView(card.mini, position: i, isLast: i == cards.count - 1)
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

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<count, id: \.self) { i in
                StoryCardSkeleton(position: i, isLast: i == count - 1)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Loading")
    }
}
