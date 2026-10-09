import DesignSystem
import SwiftUI
import Testing
import UIKit

/// A story's links as the web draws them: the wave 0.29em under the baseline (clear of Chinese
/// glyphs' feet, under every platform's) and whole on a heading's last line too, and a standalone
/// link's card in the filled look — the chat card bubble's fill, no pen line, the picture flush
/// across its top, or the fill and its words alone when there is no picture; its description and
/// host in an ink that reads on that fill.
@MainActor @Suite struct StoryLinkLookTests {
    @Test func theWaveRunsAtTheSharedDepthClearOfTheGlyphs() {
        #expect(LinkWaves.depthEm == 0.29)
        #expect(abs(LinkWaves.drop(fontSize: 17) - 4.93) < 0.001)
        // Its highest crest stays below where Chinese ink ends (≈0.12em), at the reader's size and a heading's.
        for size: CGFloat in [17, 22] {
            #expect(LinkWaves.clearance(fontSize: size) > 0.12 * size, "\(size)pt")
        }
    }

    /// A line of `style` holding one link, drawn by the reader's text view in a window.
    func shown(_ style: ProseStyle) throws -> (window: UIWindow, view: UITextView) {
        let font = style.font
        let text = NSAttributedString(string: "九份 Jiufen", attributes: [.font: font, .link: URL(string: "https://example.com/jiufen")!])
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 400)
        window.rootViewController = UIHostingController(rootView: VStack(spacing: 0) {
            CSSTextView(text, font: font, lineHeight: style.lineHeight)
            Spacer(minLength: 0)
        })
        window.makeKeyAndVisible()
        window.layoutIfNeeded()
        let view = try #require(Self.textViews(in: window).first)
        view.layoutIfNeeded()
        return (window, view)
    }

    static func textViews(in view: UIView) -> [UITextView] {
        ((view as? UITextView).map { [$0] } ?? []) + view.subviews.flatMap { textViews(in: $0) }
    }

    @Test func aHeadingsLastLineShowsItsWholeWave() throws {
        var overhang: [String: CGFloat] = [:]
        for (name, style) in [("body", ProseStyle.body), ("h2", ProseStyle.h2), ("h3", ProseStyle.h3)] {
            let (window, view) = try shown(style)
            defer { window.isHidden = true }
            let waves = (view.layer.sublayers ?? []).compactMap { $0 as? CAShapeLayer }
            let wave = try #require(waves.first?.path?.boundingBoxOfPath, "\(name): the link draws its wave")
            // Its lowest point, half the pen included, against the foot of the line it underlines (the view's).
            overhang[name] = wave.maxY + Tokens.ink / 2 - view.bounds.maxY
            // No further than the wave can reach under its line.
            #expect(overhang[name]! <= LinkWaves.reach(fontSize: style.font.pointSize) - Self.roomUnderBaseline(style) + 0.5, "\(name)")
            // Whatever reaches past the foot is drawn, not cut off.
            #expect(overhang[name]! <= 0 || !view.clipsToBounds, "\(name): the wave is cut at the view's foot")
        }
        // The reader's line box holds its wave; a heading's tight one (1.3, 1.35) doesn't.
        #expect(overhang["body"]! <= 0)
        #expect(overhang["h2"]! > 0 && overhang["h3"]! > 0)
    }

    /// The line box's room under the baseline (CSSLineBoxes centres the content area in it).
    static func roomUnderBaseline(_ style: ProseStyle) -> CGFloat {
        let font = style.font
        let box = font.pointSize * style.lineHeight
        return box - (box + font.ascender + font.descender) / 2
    }

    @Test func aLinksCardIsTheChatBubblesFillWithNoPenLine() {
        #expect(StoryLinkCard.Look.fill == Tokens.bubbleTheirs)
        #expect(StoryLinkCard.Look.pressedFill == Tokens.bubbleQuote)
        #expect(StoryLinkCard.Look.bleed > 0)
    }

    @Test func aLinksCardsDescriptionAndHostReadOnItsFill() {
        // The web's --link-card-muted: text-muted on the card's fill was 4.3:1, under the 4.5:1 small words need.
        #expect(StoryLinkCard.Look.muted == Tokens.linkCardMeta)
        #expect(Tokens.linkCardMeta == OKLCHColor.color(0.45, 0.04, 70))
        #expect(Self.contrast(StoryLinkCard.Look.muted, on: StoryLinkCard.Look.fill) >= 4.5)
        #expect(Self.contrast(StoryLinkCard.Look.muted, on: StoryLinkCard.Look.pressedFill) >= 4.5)
        #expect(Self.contrast(Tokens.textMuted, on: StoryLinkCard.Look.fill) < 4.5)
    }

    /// WCAG contrast of two opaque colours, as the screen shows them (sRGB).
    static func contrast(_ a: Color, on b: Color) -> Double {
        func luminance(_ c: Color) -> Double {
            var r: CGFloat = 0, g: CGFloat = 0, bl: CGFloat = 0, alpha: CGFloat = 0
            UIColor(c).resolvedColor(with: UITraitCollection(userInterfaceStyle: .light)).getRed(&r, green: &g, blue: &bl, alpha: &alpha)
            func lin(_ v: CGFloat) -> Double {
                let x = Double(min(1, max(0, v)))
                return x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl)
        }
        let (x, y) = (luminance(a), luminance(b))
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
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
