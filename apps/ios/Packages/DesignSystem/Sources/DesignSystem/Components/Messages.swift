import NukeUI
import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// MessageBubble's seedFromId: a Java-style string hash over UTF-16 units
/// (Int32 wrapping), folded into 1…9973. Bubbles start from 7; a shared
/// card's embed starts from 11. ("m1" → 183, "card-77" from 11 → 6326.)
public nonisolated func seedFromId(_ id: String, start: Int32 = 7) -> Double {
    var h = start
    for unit in id.utf16 { h = h &* 31 &+ Int32(unit) }
    return Double(abs(Int(h) % 9973) + 1)
}

/// A bubble's measures, the same on the web and Android: 15/1.4 words, 9 × 14 of air round them,
/// a full corner radius of 18 (a one-line bubble takes h·0.42 of it: nearly a pill) and 4 for a
/// corner tucked against its neighbour in a run.
public nonisolated enum BubbleMetrics {
    public static let textSize: CGFloat = 15
    public static let lineHeight: CGFloat = 1.4
    public static let padX: CGFloat = 14
    public static let padY: CGFloat = 9
    static let radius: Double = 18
    static let tucked: Double = 4
    /// The quoted message over a reply: one shape on its own, a little rounder-cornered than a bubble is tall.
    static let quoteRadius: Double = 16
    /// How far a reply's bubble lies over the foot of the message it quotes.
    public static let replyOverlap: CGFloat = 14
    /// How long a message is held before its menu comes (a part of it that leads somewhere gives
    /// the tap up a moment sooner, so the hold is the menu's and never also an open).
    public static let menuHold: TimeInterval = 0.4
}

/// MessageBubble's outline — the same recipe on the web and Android: its wobble follows its own
/// size — radius min(18, h·0.42), swing min(2.6, h·0.05), a turn per 80 across (2–6) and per 52
/// down (1–8), bow 1.3, corner jitter 1.6, corners pulled in 4%.
///
/// A bubble in a run of messages from one person (Messenger's stacking) tucks the corners that
/// face its neighbours to a radius of 4, on the sender's side — the right for your own, the left
/// for theirs: the first of a run tucks its bottom one (`tuckBottom`), a middle one both, the last
/// its top one (`tuckTop`). A bubble that carries a preview or a card is still one shape, and
/// tucks the same.
public nonisolated struct MessageBubbleShape: Shape {
    public let seed: Double
    public var mine: Bool
    public var tuckTop: Bool
    public var tuckBottom: Bool
    public var maxRadius: Double

    public init(seed: Double, mine: Bool = true, tuckTop: Bool = false, tuckBottom: Bool = false, maxRadius: Double = 18) {
        self.seed = seed
        self.mine = mine
        self.tuckTop = tuckTop
        self.tuckBottom = tuckBottom
        self.maxRadius = maxRadius
    }

    public func path(in rect: CGRect) -> Path {
        let w = Double(rect.width), h = Double(rect.height)
        guard w > 0, h > 0 else { return Path() }
        let across = min(6, max(2, jsRound(w / 80)))
        let down = min(8, max(1, jsRound(h / 52)))
        let radius = min(maxRadius, h * 0.42)
        let tucked = min(BubbleMetrics.tucked, radius)
        let top = tuckTop ? tucked : radius
        let bottom = tuckBottom ? tucked : radius
        let radii = mine
            ? CornerRadii(topLeft: radius, topRight: top, bottomRight: bottom, bottomLeft: radius)
            : CornerRadii(topLeft: top, topRight: radius, bottomRight: radius, bottomLeft: bottom)
        return WobRectShape(radius: radius, seed: seed, mag: min(2.6, h * 0.05), options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.6, cornerOffset: min(w, h) * 0.04, segmentsH: .count(across), segmentsV: .count(down),
            cornerRadii: tuckTop || tuckBottom ? radii : nil
        )).path(in: rect)
    }
}

/// The bubble's stand-in while what it carries is read (a shared card): a plain rounded box of the
/// same footprint and corners — never a wobble drawn before its content is there.
private func plainBubbleShape(mine: Bool, tuckTop: Bool, tuckBottom: Bool) -> UnevenRoundedRectangle {
    let r = BubbleMetrics.radius, t = BubbleMetrics.tucked
    let top = tuckTop ? t : r, bottom = tuckBottom ? t : r
    return mine
        ? UnevenRoundedRectangle(topLeadingRadius: r, bottomLeadingRadius: r, bottomTrailingRadius: bottom, topTrailingRadius: top)
        : UnevenRoundedRectangle(topLeadingRadius: top, bottomLeadingRadius: bottom, bottomTrailingRadius: r, topTrailingRadius: r)
}

/// A bubble's paper: your own a warm terracotta wash, theirs a deeper paper than the page — both opaque.
public func bubbleFill(mine: Bool) -> Color { mine ? Tokens.bubbleMine : Tokens.bubbleTheirs }

/// The wash behind a search match: the hit being looked at stronger than the others in view.
public func highlightWash(strong: Bool) -> Color { Tokens.terracotta.opacity(strong ? 0.5 : 0.24) }

/// Where a link sits in a message's text (UTF-16 units) and where it goes.
public struct MessageLinkRange: Equatable, Sendable {
    public let range: NSRange
    public let url: URL

    public init(range: NSRange, url: URL) {
        self.range = range
        self.url = url
    }
}

// MARK: - Bubble

/// A message's bubble (MessageBubble.tsx): 15/1.4 words, padding 9 × 14, your own on
/// `bubbleMine`, theirs on `bubbleTheirs`, no outline (Messenger's flat bubbles, in the paper's own
/// colours). It hugs its words, unless it carries more (`attachment`: a link's preview, a shared
/// card), which makes it one bubble of a fixed `width` — the words, then what it carries edge to
/// edge, clipped by the bubble's own wobbly outline. A reply to a note wears a small italic header
/// (`quoteLabel`).
///
/// The words are drawn by ``ChatText``: `links` are underlined, terracotta-deep in your own bubble
/// and terracotta in theirs, and a tap on one goes to `onLinkTap`; `highlights` are the matches of
/// a search, washed (stronger when `highlightStrong`: the hit being looked at); `flash` (0…1)
/// washes the whole bubble terracotta — the message a reply's quote jumped to. `plain` draws the
/// bubble's stand-in (a plain rounded box) while what it carries is still being read.
public struct MessageBubble<Attachment: View>: View {
    let text: String
    let mine: Bool
    let seed: Double
    let quoteLabel: String?
    let tuckTop: Bool
    let tuckBottom: Bool
    let links: [MessageLinkRange]
    let highlights: [NSRange]
    let highlightStrong: Bool
    let flash: Double
    let width: CGFloat?
    let plain: Bool
    let carries: Bool
    let onLinkTap: ((URL) -> Void)?
    let attachment: Attachment

    /// `carries` says whether `attachment` draws anything (it is decided while drawing, so the type can't tell).
    public init(text: String, mine: Bool, seed: Double, quoteLabel: String? = nil, tuckTop: Bool = false, tuckBottom: Bool = false,
                links: [MessageLinkRange] = [], highlights: [NSRange] = [], highlightStrong: Bool = false, flash: Double = 0,
                width: CGFloat? = nil, plain: Bool = false, carries: Bool = true, onLinkTap: ((URL) -> Void)? = nil,
                @ViewBuilder attachment: () -> Attachment) {
        self.text = text
        self.mine = mine
        self.seed = seed
        self.quoteLabel = quoteLabel
        self.tuckTop = tuckTop
        self.tuckBottom = tuckBottom
        self.links = links
        self.highlights = highlights
        self.highlightStrong = highlightStrong
        self.flash = flash
        self.width = width
        self.plain = plain
        self.carries = carries && Attachment.self != EmptyView.self
        self.onLinkTap = onLinkTap
        self.attachment = attachment()
    }

    public var body: some View {
        let shape = plain
            ? AnyShape(plainBubbleShape(mine: mine, tuckTop: tuckTop, tuckBottom: tuckBottom))
            : AnyShape(MessageBubbleShape(seed: seed, mine: mine, tuckTop: tuckTop, tuckBottom: tuckBottom))
        VStack(alignment: .leading, spacing: 0) {
            if !text.isEmpty || quoteLabel != nil {
                VStack(alignment: .leading, spacing: 4) {
                    if let quoteLabel {
                        HStack(spacing: 5) {
                            OrganicIcon(.note, size: 13, color: Tokens.textMuted)
                            Text(quoteLabel).font(AppFonts.body(12, oblique: true)).foregroundStyle(Tokens.textMuted)
                        }
                    }
                    if !text.isEmpty {
                        ChatText(text, links: links,
                                 // The terracotta of a link would sink into your own bubble's wash.
                                 linkColor: mine ? Tokens.terracottaDeep : Tokens.terracotta,
                                 highlights: highlights, highlightColor: highlightWash(strong: highlightStrong),
                                 onLinkTap: onLinkTap)
                    }
                }
                .padding(.horizontal, BubbleMetrics.padX)
                .padding(.top, BubbleMetrics.padY)
                // What it carries brings its own air above it.
                .padding(.bottom, carries ? 0 : BubbleMetrics.padY)
                .frame(maxWidth: width == nil ? nil : .infinity, alignment: .leading)
            }
            attachment
        }
        .frame(width: width, alignment: .leading)
        .background {
            shape.fill(bubbleFill(mine: mine))
            shape.fill(Tokens.terracotta.opacity(0.3)).opacity(flash)
        }
        .clipShape(shape)
        .contentShape(shape)
    }
}

extension MessageBubble where Attachment == EmptyView {
    public init(text: String, mine: Bool, seed: Double, quoteLabel: String? = nil, tuckTop: Bool = false, tuckBottom: Bool = false,
                links: [MessageLinkRange] = [], highlights: [NSRange] = [], highlightStrong: Bool = false, flash: Double = 0,
                onLinkTap: ((URL) -> Void)? = nil) {
        self.init(text: text, mine: mine, seed: seed, quoteLabel: quoteLabel, tuckTop: tuckTop, tuckBottom: tuckBottom, links: links,
                  highlights: highlights, highlightStrong: highlightStrong, flash: flash, onLinkTap: onLinkTap) { EmptyView() }
    }
}

// MARK: - Replies

/// The message a reply answers, quoted over the reply (Messenger's): a muted bubble of its own on
/// `bubbleQuote`, no outline, 13.5 words in two lines at most, hugging them. Its foot is
/// `BubbleMetrics.replyOverlap` deeper than its words need: the reply's bubble lies over it there.
public struct QuoteBubble: View {
    let text: String
    let seed: Double
    let onTap: (() -> Void)?

    public init(text: String, seed: Double, onTap: (() -> Void)? = nil) {
        self.text = text
        self.seed = seed
        self.onTap = onTap
    }

    public var body: some View {
        let shape = MessageBubbleShape(seed: seed, maxRadius: BubbleMetrics.quoteRadius)
        ChatText(text, size: 13.5, color: Tokens.textMuted, maxLines: 2)
            .padding(.horizontal, 13)
            .padding(.top, 8)
            .padding(.bottom, 8 + BubbleMetrics.replyOverlap)
            .background { shape.fill(Tokens.bubbleQuote) }
            .contentShape(shape)
            .modifier(BubblePartAction(action: onTap, trait: .isButton))
            // The press's wash keeps to the quote's own outline.
            .clipShape(shape)
    }
}

/// Who answered whom over a reply's quote — or, over a note, that it answers the card: plain in a
/// one-to-one thread, so never shown, only read out by VoiceOver before the quote (the web's
/// `.quoteSpoken`). It takes no room: a point of clear text, laid over the line's top.
public struct SpokenCaption: View {
    let text: String

    public init(_ text: String) {
        self.text = text
    }

    public var body: some View {
        Text(text)
            .font(AppFonts.body(1))
            .foregroundStyle(.clear)
            .frame(width: 1, height: 1)
            .clipped()
            .padding(.bottom, -1)
            .accessibilityLabel(text)
            .accessibilityAddTraits(.isStaticText)
    }
}

/// The card a note was left on, over the note's words: Messenger's quote holding a shared card —
/// ``SharedCardSection`` (or its skeleton, `plain`, while the card is read) on `bubbleQuote` at
/// `width`, no outline, its foot `BubbleMetrics.replyOverlap` deeper than the card: the note's
/// bubble lies over it there, as a reply lies over what it quotes. The card inside is what a tap
/// opens; a hold is the message's menu.
public struct CardQuote<Card: View>: View {
    let seed: Double
    let width: CGFloat
    let plain: Bool
    let card: Card

    public init(seed: Double, width: CGFloat, plain: Bool = false, @ViewBuilder card: () -> Card) {
        self.seed = seed
        self.width = width
        self.plain = plain
        self.card = card()
    }

    public var body: some View {
        // A stand-in is never a wobble drawn before its content is there.
        let shape = plain
            ? AnyShape(RoundedRectangle(cornerRadius: BubbleMetrics.quoteRadius, style: .continuous))
            : AnyShape(MessageBubbleShape(seed: seed, maxRadius: BubbleMetrics.quoteRadius))
        VStack(spacing: 0) {
            card
            Color.clear.frame(height: BubbleMetrics.replyOverlap)
        }
        .frame(width: width)
        .background { shape.fill(Tokens.bubbleQuote) }
        .clipShape(shape)
        .contentShape(shape)
    }
}

// MARK: - What a bubble carries

/// How much wider than the bubble a picture inside it is drawn on each side: past its wobbly
/// edge's widest swing, so the clip, not the picture, ends it.
private let pictureBleed: CGFloat = 4

/// A picture edge to edge across a bubble at 1.91:1 (the share-image ratio); `onError` when it won't load.
private struct BubblePicture: View {
    let url: URL
    let onError: () -> Void

    var body: some View {
        Color.clear
            .aspectRatio(1.91, contentMode: .fit)
            .background(Tokens.text.opacity(0.06))
            .overlay {
                LazyImage(url: url) { state in
                    if let image = state.image {
                        image.resizable().scaledToFill()
                    } else if state.error != nil {
                        Color.clear.onAppear(perform: onError)
                    }
                }
            }
            .clipped()
            // Wider than the bubble: its wobbly outline cuts it, not the picture's own edge.
            .padding(.horizontal, -pictureBleed)
            .accessibilityHidden(true)
    }
}

/// A part of a bubble that leads somewhere — a link's page, a shared card, the quote over a reply.
/// A tap opens it; a press held is the whole message's (its menu), and a finger that moves is the
/// thread's (its scroll, a swipe to reply). A SwiftUI Button here would keep the message's own
/// press from ever starting, so the tap is a UIKit recognizer like that press, and gives up just
/// before the hold would bring the menu. Under the finger, a light wash over the part, which the
/// bubble's own outline cuts. Assistive tech activates it like a link (or a button: `trait`).
private struct BubblePartAction: ViewModifier {
    let action: (() -> Void)?
    var trait: AccessibilityTraits = .isLink
    @State private var pressed = false

    func body(content: Content) -> some View {
        if let action {
            content
                .overlay { Tokens.terracotta.opacity(pressed ? 0.1 : 0).allowsHitTesting(false) }
                .animation(.easeOut(duration: pressed ? 0.08 : 0.22), value: pressed)
                .gesture(PartTap(onPress: { pressed = $0 }, onTap: action))
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(trait)
                .accessibilityAction(.default, action)
        } else {
            content
        }
    }
}

private struct PartTap: UIGestureRecognizerRepresentable {
    let onPress: (Bool) -> Void
    let onTap: () -> Void

    func makeUIGestureRecognizer(context: Context) -> PartTapRecognizer {
        PartTapRecognizer()
    }

    func updateUIGestureRecognizer(_ recognizer: PartTapRecognizer, context: Context) {
        recognizer.onPress = onPress
    }

    func handleUIGestureRecognizerAction(_ recognizer: PartTapRecognizer, context: Context) {
        if recognizer.state == .ended { onTap() }
    }
}

/// One finger down and up again where it went down, sooner than a hold. The wash shows only once
/// the finger has stayed a moment (one that is starting a scroll never flashes it).
final class PartTapRecognizer: UIGestureRecognizer {
    var onPress: ((Bool) -> Void)?
    private var start: CGPoint = .zero
    /// Each touch's timers know whether they are still the current touch's.
    private var touch = 0
    private var down = false {
        didSet { if down != oldValue { onPress?(down) } }
    }
    private let slop: CGFloat = 10

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        guard touches.count == 1, (event.allTouches?.count ?? 1) == 1, let first = touches.first else { return fail() }
        start = first.location(in: nil)
        touch += 1
        let current = touch
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(90))
            guard let self, self.touch == current, self.state == .possible else { return }
            self.down = true
            try? await Task.sleep(for: .seconds(BubbleMetrics.menuHold - 0.05 - 0.09))
            // Held: the message's menu is coming, not this.
            if self.touch == current { self.fail() }
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        guard let first = touches.first else { return }
        let p = first.location(in: nil)
        if hypot(p.x - start.x, p.y - start.y) > slop { fail() }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        down = false
        state = state == .possible ? .ended : .failed
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        fail()
    }

    override func reset() {
        super.reset()
        touch += 1
        down = false
    }

    private func fail() {
        down = false
        if state == .possible { state = .failed }
    }
}

/// A link's unfurled page inside its message's bubble (Messenger's): after the words, the page's
/// picture edge to edge at 1.91:1 — when it has one and it loads; one that won't takes its section
/// with it — then the title (14.5 semibold, two lines), a description (12.5, two) and the host
/// with the link glyph. `host` is the ASCII host the tap leads to, as the confirm would name it.
/// `afterWords`: the message's words are above it (the picture keeps a step from them; without
/// them it starts at the bubble's top edge). A tap opens the link; a hold is the message's menu.
public struct LinkPreviewSection: View {
    let title: String
    let description: String?
    let host: String
    let imageURL: URL?
    let afterWords: Bool
    let onOpen: (() -> Void)?
    @State private var pictureFailed = false

    public init(title: String, description: String?, host: String, imageURL: URL?, afterWords: Bool, onOpen: (() -> Void)?) {
        self.title = title
        self.description = description
        self.host = host
        self.imageURL = imageURL
        self.afterWords = afterWords
        self.onOpen = onOpen
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let imageURL, !pictureFailed {
                if afterWords { Color.clear.frame(height: BubbleMetrics.padY) }
                BubblePicture(url: imageURL) { pictureFailed = true }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(AppFonts.body(14.5, weight: .semibold)).foregroundStyle(Tokens.text)
                    .lineLimit(2).multilineTextAlignment(.leading)
                if let description, !description.isEmpty {
                    Text(description)
                        .font(AppFonts.body(12.5)).foregroundStyle(Tokens.textMuted)
                        .lineLimit(2).multilineTextAlignment(.leading)
                }
                HStack(spacing: 5) {
                    OrganicIcon(.link, size: 12, color: Tokens.textMuted)
                    Text(host).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                }
                .padding(.top, 3)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentShape(Rectangle())
        .modifier(BubblePartAction(action: onOpen))
    }
}

/// Who wrote a shared card: their face and pen name — or, for a card posted anonymously, the mark
/// the card page shows (a dot on paper) beside the anonymous name, never the author.
public struct CardByline: Equatable {
    public let name: String
    public let initials: String
    public let imageURL: URL?
    public let color: Color
    public let avatarSeed: Double
    public let isAnonymous: Bool

    public init(name: String, initials: String, imageURL: URL?, color: Color, avatarSeed: Double, isAnonymous: Bool = false) {
        self.name = name
        self.initials = initials
        self.imageURL = imageURL
        self.color = color
        self.avatarSeed = avatarSeed
        self.isAnonymous = isAnonymous
    }

    public static func anonymous(_ name: String) -> CardByline {
        CardByline(name: name, initials: "·", imageURL: nil, color: Tokens.creamDark, avatarSeed: 97, isAnonymous: true)
    }
}

/// A Resonance card shared in a message, inside its bubble — Messenger's shared post, so it reads
/// at a glance as a card of this site and what it is about: the author (avatar 32, pen name, and
/// `source` · the read time under it), the cover edge to edge at 1.91:1 (or, without one, a band of
/// the card's own colour with the wave mark), the title in the heading face (16 bold, three lines),
/// the excerpt (two) and a source line — the wave and `source`, like the "Facebook" under a shared
/// post. A tap opens the card; a hold is the message's menu.
public struct SharedCardSection: View {
    let byline: CardByline
    let readTime: String
    let title: String
    let excerpt: String?
    let imageURL: URL?
    let accentHue: Double?
    let source: String
    let onOpen: (() -> Void)?
    @State private var coverFailed = false

    public init(byline: CardByline, readTime: String, title: String, excerpt: String?, imageURL: URL?, accentHue: Double?,
                source: String, onOpen: (() -> Void)?) {
        self.byline = byline
        self.readTime = readTime
        self.title = title
        self.excerpt = excerpt
        self.imageURL = imageURL
        self.accentHue = accentHue
        self.source = source
        self.onOpen = onOpen
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                HandDrawnAvatar(initials: byline.initials, imageURL: byline.imageURL, color: byline.color, size: 32, seed: byline.avatarSeed)
                VStack(alignment: .leading, spacing: 1) {
                    Text(byline.name)
                        .font(AppFonts.body(14, weight: .semibold))
                        .foregroundStyle(byline.isAnonymous ? Tokens.textMuted : Tokens.text)
                        .lineLimit(1)
                    Text("\(source) · \(readTime)")
                        .font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            if let imageURL, !coverFailed {
                BubblePicture(url: imageURL) { coverFailed = true }
            } else {
                let palette = CardPalette(accentHue: accentHue, position: 0)
                ZStack {
                    palette.fill
                    GrainLayer(shape: Rectangle(), mode: .tile, opacity: 0.08, tile: "grain-overlay")
                    OrganicIcon(.wave, size: 40, color: palette.border.opacity(0.32))
                }
                .frame(height: 96)
                .padding(.horizontal, -pictureBleed)
                .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(AppFonts.heading(16, weight: .bold)).foregroundStyle(Tokens.text)
                    .lineLimit(3).multilineTextAlignment(.leading)
                if let excerpt, !excerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(excerpt)
                        .font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                        .lineLimit(2).multilineTextAlignment(.leading)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            HStack(spacing: 6) {
                OrganicIcon(.wave, size: 14, color: Tokens.terracotta)
                Text(source).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .modifier(BubblePartAction(action: onOpen))
    }
}

/// ``SharedCardSection`` while the card is read: its footprint in plain shimmering blocks (no
/// wobble, nothing measured).
public struct SharedCardSkeleton: View {
    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                SkeletonBlock(height: 32, circle: true)
                VStack(alignment: .leading, spacing: 6) {
                    SkeletonBlock(width: 88, height: 12)
                    SkeletonBlock(width: 64, height: 10)
                }
            }
            .padding(12)
            Tokens.text.opacity(0.06).aspectRatio(1.91, contentMode: .fit)
            VStack(alignment: .leading, spacing: 8) {
                SkeletonBlock(fraction: 0.85, height: 15)
                SkeletonBlock(fraction: 0.6, height: 15)
                SkeletonBlock(fraction: 0.9, height: 11)
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)
            SkeletonBlock(width: 56, height: 11)
                .padding(.leading, 12).padding(.top, 12).padding(.bottom, 14)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel("Loading")
    }
}

// MARK: - Composer

/// The composer's Send: a wobbly terracotta rounded rectangle — one lopsided turn a side and
/// drifting corners, on one seed on every platform — with the paper plane in cream. It is the verb
/// of the bar, so it is a solid face with the buttons' grain and no pen line of its own. Dimmed
/// and deaf until there is something to send — never held by a send in flight.
public struct OrganicSendButton: View {
    let label: String
    let enabled: Bool
    var width: CGFloat
    var height: CGFloat
    let action: () -> Void

    public init(label: String, enabled: Bool, width: CGFloat = 52, height: CGFloat = 44, action: @escaping () -> Void) {
        self.label = label
        self.enabled = enabled
        self.width = width
        self.height = height
        self.action = action
    }

    public var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            SendFace(width: width, height: height)
        }
        .buttonStyle(SendPressStyle())
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
        .animation(.easeOut(duration: 0.15), value: enabled)
        .accessibilityLabel(label)
    }
}

private struct SendFace: View {
    let width: CGFloat
    let height: CGFloat
    @Environment(\.sendPressed) private var pressed

    var body: some View {
        // The web's 48×40 wobRect(…, 12, 23, 1.0, …) at the apps' size: the same seed, so the same hand.
        let shape = WobRectShape(radius: 13, seed: 23, mag: 1.1, options: WobRectOptions(
            curve: 1.3, cornerJitter: 2.4, cornerOffset: 2.2, segmentsH: .count(1), segmentsV: .count(1)))
        // The plane is drawn optically centred in its own box: it sits in the middle as it is.
        OrganicIcon(.send, size: 20, color: Tokens.cream)
            .frame(width: width, height: height)
            .background {
                shape.fill(Tokens.terracotta)
                GrainLayer(shape: shape, mode: .tile, opacity: 0.38, tile: "grain-button")
                shape.fill(Color.black.opacity(pressed ? 0.14 : 0))
            }
            .contentShape(shape)
    }
}

private struct SendPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .environment(\.sendPressed, configuration.isPressed)
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private extension EnvironmentValues {
    @Entry var sendPressed = false
}

/// A reply's rule in the composer: a short vertical pen line in terracotta, wavy like the headers' edges.
public struct ReplyRule: View {
    var seed: Double

    public init(seed: Double = 31) {
        self.seed = seed
    }

    public var body: some View {
        ReplyRuleShape(seed: seed)
            .stroke(Tokens.terracotta, style: StrokeStyle(lineWidth: 2, lineCap: .round))
            .frame(width: 6)
            .accessibilityHidden(true)
    }
}

private nonisolated struct ReplyRuleShape: Shape {
    let seed: Double

    func path(in rect: CGRect) -> Path {
        let h = Double(rect.height)
        guard h > 0 else { return Path() }
        return wavyVertical(h, seed: seed, amp: 1.1, steps: max(3, Int(h / 9)))
            .path(offsetX: Double(rect.midX), offsetY: Double(rect.minY))
    }
}

// MARK: - Words

/// A bubble's words on CSS line boxes (the twin of Android's ChatText; `CSSText` has no spans):
/// `links` are coloured and underlined, `highlights` washed behind the glyphs on rounded rects (the
/// matches of a search; `highlightWeight` sets them in a heavier face too), and a tap on a link goes
/// to `onLinkTap`. Takes its words' own width when they wrap (a bubble hugs its words), and at most
/// `maxLines` lines (cut with …). A press anywhere else is left to the bubble.
public struct ChatText: UIViewRepresentable {
    let text: String
    var size: CGFloat
    var weight: UIFont.Weight
    var lineHeight: CGFloat
    var color: Color
    var links: [MessageLinkRange]
    var linkColor: Color
    var highlights: [NSRange]
    var highlightColor: Color
    var highlightWeight: UIFont.Weight?
    var maxLines: Int
    var onLinkTap: ((URL) -> Void)?

    public init(_ text: String, size: CGFloat = BubbleMetrics.textSize, weight: UIFont.Weight = .regular,
                lineHeight: CGFloat = BubbleMetrics.lineHeight, color: Color = Tokens.text,
                links: [MessageLinkRange] = [], linkColor: Color = Tokens.terracotta,
                highlights: [NSRange] = [], highlightColor: Color = highlightWash(strong: false), highlightWeight: UIFont.Weight? = nil,
                maxLines: Int = 0, onLinkTap: ((URL) -> Void)? = nil) {
        self.text = text
        self.size = size
        self.weight = weight
        self.lineHeight = lineHeight
        self.color = color
        self.links = links
        self.linkColor = linkColor
        self.highlights = highlights
        self.highlightColor = highlightColor
        self.highlightWeight = highlightWeight
        self.maxLines = maxLines
        self.onLinkTap = onLinkTap
    }

    public func makeUIView(context: Context) -> ChatTextView {
        let view = ChatTextView()
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }

    public func updateUIView(_ view: ChatTextView, context: Context) {
        let font = AppFonts.scaledUIFont(.body, size: size, weight: weight)
        let out = NSMutableAttributedString(string: text, attributes: [.font: font, .foregroundColor: UIColor(color)])
        let all = NSRange(location: 0, length: out.length)
        for link in links {
            let r = NSIntersectionRange(link.range, all)
            guard r.length > 0 else { continue }
            out.addAttributes([
                .foregroundColor: UIColor(linkColor),
                .underlineStyle: NSUnderlineStyle.single.rawValue,
                .underlineColor: UIColor(linkColor),
            ], range: r)
        }
        if let highlightWeight {
            let heavier = AppFonts.scaledUIFont(.body, size: size, weight: highlightWeight)
            for range in highlights {
                let r = NSIntersectionRange(range, all)
                if r.length > 0 { out.addAttribute(.font, value: heavier, range: r) }
            }
        }
        view.set(text: out, font: font, lineHeight: lineHeight, maxLines: maxLines, links: links, highlights: highlights,
                 highlightColor: UIColor(highlightColor), onLinkTap: onLinkTap)
        view.accessibilityLabel = text
    }

    public func sizeThatFits(_ proposal: ProposedViewSize, uiView: ChatTextView, context: Context) -> CGSize? {
        var width = proposal.width ?? 320
        if !width.isFinite { width = 320 }
        return uiView.measure(width: max(1, width))
    }
}

/// ``ChatText``'s view: TextKit 1 on exact CSS line boxes (``CSSLineBoxes``), drawn by hand so the
/// search's washes can lie under the glyphs. It takes a tap only on a link; everything else falls
/// through to the bubble (and a long-press over a link asks it which: `link(at:)`).
public final class ChatTextView: UIView, UIGestureRecognizerDelegate {
    private let storage = NSTextStorage()
    private let layout = NSLayoutManager()
    private let container = NSTextContainer(size: CGSize(width: 320, height: CGFloat.greatestFiniteMagnitude))
    /// The layout manager holds its delegate weakly.
    private var lineBoxes: CSSLineBoxes?
    private var links: [MessageLinkRange] = []
    private var highlights: [NSRange] = []
    private var highlightColor: UIColor = .clear
    /// How tall a highlight is: the glyphs' height, centred on the line box.
    private var glyphHeight: CGFloat = 0
    private var onLinkTap: ((URL) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        isOpaque = false
        backgroundColor = .clear
        contentMode = .redraw
        isAccessibilityElement = true
        accessibilityTraits = .staticText
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        tap.delegate = self
        addGestureRecognizer(tap)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func set(text: NSAttributedString, font: UIFont, lineHeight: CGFloat, maxLines: Int, links: [MessageLinkRange],
             highlights: [NSRange], highlightColor: UIColor, onLinkTap: ((URL) -> Void)?) {
        if lineBoxes?.font != font || lineBoxes?.lineBox != font.pointSize * lineHeight {
            let boxes = CSSLineBoxes(font: font, lineHeight: lineHeight)
            lineBoxes = boxes
            layout.delegate = boxes
        }
        container.maximumNumberOfLines = maxLines
        container.lineBreakMode = maxLines > 0 ? .byTruncatingTail : .byWordWrapping
        if !storage.isEqual(to: text) {
            storage.setAttributedString(text)
            invalidateIntrinsicContentSize()
        }
        self.links = links
        self.highlights = highlights
        self.highlightColor = highlightColor
        self.onLinkTap = onLinkTap
        // Words without a link to tap leave every touch to what they sit in (a bubble, a row of results).
        isUserInteractionEnabled = onLinkTap != nil && !links.isEmpty
        glyphHeight = font.pointSize * 1.3
        setNeedsDisplay()
    }

    /// The words laid out across `width`: as wide as their longest line, as tall as their lines.
    /// Drawn at the width it took, the lines break where they did (none of them is wider).
    func measure(width: CGFloat) -> CGSize {
        lay(width)
        let used = layout.usedRect(for: container)
        return CGSize(width: min(width, ceil(used.width)), height: ceil(used.height))
    }

    private func lay(_ width: CGFloat) {
        if container.size.width != width { container.size = CGSize(width: width, height: .greatestFiniteMagnitude) }
        layout.ensureLayout(for: container)
    }

    public override func draw(_ rect: CGRect) {
        guard storage.length > 0, bounds.width > 0 else { return }
        lay(bounds.width)
        if !highlights.isEmpty {
            highlightColor.setFill()
            for box in highlightRects() { UIBezierPath(roundedRect: box, cornerRadius: 4).fill() }
        }
        let glyphs = layout.glyphRange(for: container)
        layout.drawBackground(forGlyphRange: glyphs, at: .zero)
        layout.drawGlyphs(forGlyphRange: glyphs, at: .zero)
    }

    /// Where each highlighted range falls: one rect per line it crosses, as tall as the glyphs,
    /// centred on the line box, 2 wider than the words at each end.
    private func highlightRects() -> [CGRect] {
        var out: [CGRect] = []
        let all = NSRange(location: 0, length: storage.length)
        for range in highlights {
            let r = NSIntersectionRange(range, all)
            guard r.length > 0 else { continue }
            let glyphs = layout.glyphRange(forCharacterRange: r, actualCharacterRange: nil)
            layout.enumerateLineFragments(forGlyphRange: glyphs) { [layout, container, glyphHeight] line, _, _, lineGlyphs, _ in
                let part = NSIntersectionRange(glyphs, lineGlyphs)
                guard part.length > 0 else { return }
                let box = layout.boundingRect(forGlyphRange: part, in: container)
                guard box.width > 0.5 else { return }
                out.append(CGRect(x: box.minX - 2, y: line.midY - glyphHeight / 2, width: box.width + 4, height: glyphHeight))
            }
        }
        return out
    }

    /// The link under `point` (in this view's space), if any; a little room round its words still counts.
    public func link(at point: CGPoint) -> URL? {
        guard !links.isEmpty, storage.length > 0 else { return nil }
        lay(bounds.width)
        var fraction: CGFloat = 0
        let glyph = layout.glyphIndex(for: point, in: container, fractionOfDistanceThroughGlyph: &fraction)
        let box = layout.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container)
        guard box.insetBy(dx: -6, dy: -6).contains(point) else { return nil }
        let at = layout.characterIndexForGlyph(at: glyph)
        return links.first { NSLocationInRange(at, $0.range) }?.url
    }

    public override func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard g.delegate === self else { return super.gestureRecognizerShouldBegin(g) }
        return onLinkTap != nil && link(at: g.location(in: self)) != nil
    }

    @objc private func tapped(_ g: UITapGestureRecognizer) {
        if let url = link(at: g.location(in: self)) { onLinkTap?(url) }
    }
}
