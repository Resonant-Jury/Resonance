import ResonanceGeometry
import SwiftUI

struct SampleStory: Identifiable, Hashable {
    let id: Int
    let title: String
    let excerpt: String
    let author: String
    let tags: [String]
    let hue: Int // index into the card palette

    static let all: [SampleStory] = (0..<60).map { i in
        let t = templates[i % templates.count]
        return SampleStory(id: i, title: t.0, excerpt: t.1, author: t.2, tags: t.3, hue: i % 6)
    }

    private static let templates: [(String, String, String, [String])] = [
        ("一場雨後的散步", "雨停的時候，巷口的積水映出整排路燈。我突然想起小時候，也是這樣踩著水窪回家。", "bob", ["日常", "散步"]),
        ("第一杯自己沖的咖啡", "水溫太高，粉也磨得太細，但那是第一次覺得早晨是屬於自己的。", "bob", ["日常", "咖啡"]),
        ("寫給十年前的自己", "你以為的失敗，後來都變成了轉彎的地方。Keep going — the detour is the road.", "alice", ["成長"]),
        ("陌生人的一句話", "在車站有人對我說辛苦了，那天就被接住了。", "carol", ["溫柔", "城市"]),
        ("The quiet after moving out", "Boxes everywhere, and for the first time the silence felt like mine.", "dana", ["home", "change"]),
        ("外婆的手寫食譜", "她的字歪歪斜斜，份量寫著「一點點」，我照著做了三次才做出那個味道。", "erin", ["家人", "料理"]),
    ]
}

/// Native StoryCard (src/components/molecules/StoryCard): pastel organic
/// surface with grain + ink outline, organic image, tags, Playfair title,
/// DM Sans excerpt, wavy divider, avatar byline.
struct StoryCardView: View {
    let story: SampleStory
    var grain: GrainMode = .tile
    var clipImage: Bool = true

    var body: some View {
        let fill = Tokens.cardFills[story.hue]
        let border = Tokens.cardBorders[story.hue]
        let seed = Double(story.id * 17 + 3)
        VStack(alignment: .leading, spacing: 12) {
            StoryImagePlaceholder(fill: fill, label: story.title, seed: seed + 11, clip: clipImage, grain: grain)
                .frame(height: 170)
            HStack(spacing: 6) {
                ForEach(Array(story.tags.enumerated()), id: \.offset) { i, tag in
                    TagPill(text: tag, fill: fill, stroke: border, seed: seed + Double(i) * 5)
                }
            }
            Text(story.title)
                .font(AppFonts.heading(18))
                .foregroundStyle(Tokens.text)
                .lineSpacing(18 * 0.3)
            Text(story.excerpt)
                .font(AppFonts.body(14))
                .foregroundStyle(Tokens.textMuted)
                .lineSpacing(14 * 0.65)
                .lineLimit(3)
            WavyDivider(color: border.opacity(0.5), seed: seed + 17)
            HStack(spacing: 10) {
                HandDrawnAvatar(initials: String(story.author.prefix(2)).uppercased(), color: fill, size: 30, seed: seed + 29)
                VStack(alignment: .leading, spacing: 0) {
                    Text(story.author).font(AppFonts.body(13, weight: .semibold)).foregroundStyle(Tokens.text)
                    Text("3 min").font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
                }
                Spacer()
                Image(systemName: "arrow.right").font(.system(size: 13)).foregroundStyle(Tokens.textMuted)
            }
        }
        .padding(18)
        .organicSurface(fill: fill.opacity(0.55), stroke: border, radius: 22, seed: seed, grain: grain)
    }
}

/// The web's striped image placeholder, clipped to a wobbly rectangle.
struct StoryImagePlaceholder: View {
    let fill: Color
    let label: String
    let seed: Double
    var clip: Bool = true
    var grain: GrainMode = .tile

    var body: some View {
        let shape = WobRectShape(radius: 16, seed: seed)
        ZStack {
            fill
            Canvas { ctx, size in
                // 22 diagonal hatch lines, like StoryCard's placeholder svg.
                for i in 0..<22 {
                    var p = Path()
                    let x = Double(i) * size.width / 14 - size.width / 2
                    p.move(to: CGPoint(x: x, y: 0))
                    p.addLine(to: CGPoint(x: x + size.width, y: size.height))
                    ctx.stroke(p, with: .color(Tokens.text.opacity(0.08)), lineWidth: Tokens.inkLight)
                }
            }
            Text(label).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(Tokens.text.opacity(0.42))
            // GrainOverlay opacity 0.055: black ink, alpha = 1 − noise luminance
            // (mean ½), drawn at 2 × opacity so the mean darkening is 5.5%.
            GrainLayer(shape: Rectangle(), mode: grain, opacity: 0.11, tile: "grain-overlay")
        }
        .clipShape(clip ? AnyShape(shape) : AnyShape(RoundedRectangle(cornerRadius: 16)))
    }
}
