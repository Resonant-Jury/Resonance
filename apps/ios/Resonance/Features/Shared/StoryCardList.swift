import DesignSystem
import ResonanceKit
import SwiftUI

/// Cards as the web lists them on a phone: full-bleed bands, each a link to its page.
struct StoryCardList: View {
    let cards: [FeedCard]
    var onAppearLast: (() -> Void)? = nil

    var body: some View {
        LazyVStack(spacing: 0) {
            ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                NavigationLink(value: Route.card(card.routeKey)) {
                    StoryCardView(card.story, position: i, isLast: i == cards.count - 1)
                }
                .buttonStyle(.plain)
                .onAppear { if i == cards.count - 1 { onAppearLast?() } }
            }
        }
    }
}
