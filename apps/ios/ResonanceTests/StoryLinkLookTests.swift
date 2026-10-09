import DesignSystem
import SwiftUI
import Testing
import UIKit

/// A story's links as the web draws them: the wave 0.29em under the baseline (clear of Chinese
/// glyphs' feet, under every platform's), and a standalone link's card in the filled look — the
/// chat card bubble's fill, no pen line, the picture flush across its top, or the fill and its
/// words alone when there is no picture.
@MainActor @Suite struct StoryLinkLookTests {
    @Test func theWaveRunsAtTheSharedDepthClearOfTheGlyphs() {
        #expect(LinkWaves.depthEm == 0.29)
        #expect(abs(LinkWaves.drop(fontSize: 17) - 4.93) < 0.001)
        // Its highest crest stays below where Chinese ink ends (≈0.12em), at the reader's size and a heading's.
        for size: CGFloat in [17, 22] {
            #expect(LinkWaves.clearance(fontSize: size) > 0.12 * size, "\(size)pt")
        }
    }

    @Test func aLinksCardIsTheChatBubblesFillWithNoPenLine() {
        #expect(StoryLinkCard.Look.fill == Tokens.bubbleTheirs)
        #expect(StoryLinkCard.Look.pressedFill == Tokens.bubbleQuote)
        #expect(StoryLinkCard.Look.bleed > 0)
    }

    func height(_ card: StoryLinkCard, width: CGFloat = 360) -> CGFloat {
        UIHostingController(rootView: card.frame(width: width)).sizeThatFits(in: CGSize(width: width, height: 2000)).height
    }

    @Test func thePictureRunsAcrossTheTopAndWithoutOneTheWordsStandAlone() {
        func card(_ image: URL?) -> StoryLinkCard {
            StoryLinkCard(title: "Jiufen", description: "A mountain town", host: "en.wikipedia.org", imageURL: image, seed: 7,
                          openLabel: "Open link: en.wikipedia.org") {}
        }
        let plain = height(card(nil))
        let pictured = height(card(URL(string: "http://127.0.0.1:9/api/link-image?u=x&s=y")))
        // The picture takes the card's full width at 1.91:1, flush (the words' top pad shrinks from 16 to 12 under it).
        #expect(abs((pictured - plain) - (360 / 1.91 - 4)) < 1.5)
    }
}
