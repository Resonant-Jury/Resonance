import DesignSystem
import ResonanceKit
import SwiftUI

// The thread's list: the messages newest at the bottom, stacked in runs the way Messenger stacks
// them — their face beside the last of each of their runs — with the day and time labels, the
// quotes replies lie over, links' previews and shared cards inside their bubbles, the lines under
// messages that are on their way or didn't go, and — at the top — older messages as they are read
// in. The list is drawn upside down (and each row the right way up again), as Android's reversed
// list is laid out: it starts at the newest, and what is read in above never moves what is on
// screen. The twin of Android's ThreadList.

/// Everything a row of the thread needs from the screen around it.
struct ThreadContext {
    let model: ThreadModel
    /// A bubble's widest: 72% of the row (their face's column not counted), as on the web and Android.
    let rowMax: CGFloat
    /// The matches of the search being looked at, by message id; none when not looking.
    let highlights: [String: [NSRange]]
    /// The message id of the hit being looked at.
    let currentHit: String?
    let flash: ThreadFlash
    let frames: FrameBook
    /// The key of the message the long-press menu has lifted out of the thread: its place stays empty under the scrim.
    let lifted: String?
    let onMenu: (MessageMenu) -> Void
    let onReply: (ChatMessage) -> Void
    /// The quote of a reply was tapped: the id of the message it quotes.
    let onQuote: (String) -> Void
    /// A link in a message was tapped: a card of this site opens in the app, anything else by the link rules.
    let openLink: (URL) -> Void
    let openRoute: (Route) -> Void
}

/// The message the thread just jumped to from a reply's quote pulses once.
@MainActor @Observable
final class ThreadFlash {
    private(set) var key: String?
    private(set) var level: Double = 0
    @ObservationIgnored private var token = 0

    func pulse(_ key: String) {
        token += 1
        let mine = token
        self.key = key
        level = 0
        withAnimation(.easeOut(duration: 0.14)) { level = 1 }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(140))
            guard token == mine else { return }
            withAnimation(.easeOut(duration: 0.76)) { level = 0 }
        }
    }

    func level(of key: String) -> Double { self.key == key ? level : 0 }
}

/// Where each message on screen is (by key), for a long-press to lift it from. Written as the list
/// moves, read only when a message is pressed: nothing draws from it.
@MainActor
final class FrameBook {
    var frames: [String: CGRect] = [:]
}

/// A message pressed and held: the row, where it is on the screen, and the link it offers.
struct MessageMenu {
    let row: ThreadRow
    let frame: CGRect
    let link: URL?
}

/// How far up the thread is scrolled (in screens) before "latest messages" offers the way back down.
private let farUpScreens: CGFloat = 1.5
/// How close to the oldest message held the list comes (in messages) before the next page is read.
private let olderAhead = 6
/// How tall the fade is where the thread meets its foot (the composer, the reply bar over it, a line in its place).
private let edgeFade: CGFloat = 12
private let runGap: CGFloat = 2
private let betweenRuns: CGFloat = 12
/// Their face beside their messages: the column every one of their bubbles is indented by.
private let face: CGFloat = 28
private let faceGap: CGFloat = 8
/// A bubble carrying a link's preview is this wide (or the row's widest); one carrying a card, `cardWidth`.
private let previewWidth: CGFloat = 280
private let cardWidth: CGFloat = 300

struct MessageList: View {
    let rows: [ThreadRow]
    let ctx: ThreadContext
    /// Where the list is: it holds still on the row it was on while rows come and go around it (a
    /// message arriving while the thread is scrolled up doesn't move what is being read).
    @Binding var position: ScrollPosition
    /// The bar lies over the top of the list: what scrolls shows right up to its pen line.
    let topMargin: CGFloat
    /// The floating pill (new messages, back to the latest) is for the list alone, not under search results.
    let pillVisible: Bool
    /// Whether messages are scrolled under the bar (its pen line darkens).
    @Binding var underBar: Bool
    @State private var atBottom = true
    @State private var farUp = false
    @State private var unseen = 0

    var body: some View {
        let model = ctx.model
        let newestFirst = Array(rows.reversed())
        let oldest = Set(rows.prefix(olderAhead).map(\.id))
        ZStack(alignment: .bottom) {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(Array(newestFirst.enumerated()), id: \.element.id) { i, row in
                        // A run still on its way says so once, under its newest message: the stack stays one stack.
                        let sendingBelow = row.position.joinsBelow && i > 0 && newestFirst[i - 1].message.delivery == .sending
                        ThreadRowView(row: row, ctx: ctx, deliveryLine: !sendingBelow)
                            .upsideDown()
                            .id(row.id)
                            // Scrolled up to within a few messages of the oldest held: the next page of older ones is read.
                            .onAppear { if oldest.contains(row.id) { model.loadOlder() } }
                    }
                    if model.threadReady && model.messages.isEmpty {
                        // Not "no messages yet" when they couldn't be read, nor "say hello" where nothing can be said.
                        if model.listenFailed {
                            QuietNote(L10n.Native.loadError).upsideDown()
                        } else if model.access.canWrite {
                            QuietNote(L10n.Messages.noMessagesYet).upsideDown()
                        }
                    } else if model.threadReady && !rows.isEmpty {
                        OlderRow(model: model).upsideDown()
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, 16)
                // Exactly as wide as the list: a vertical list never has anything to move sideways to.
                .containerRelativeFrame(.horizontal)
            }
            .scrollPosition($position, anchor: .center)
            .upsideDown()
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            // Upside down, the list's bottom margin is the room under the bar, its top the air over the
            // composer — with the fade's height besides, so the newest message rests clear of it.
            .contentMargins(.bottom, topMargin + 4, for: .scrollContent)
            .contentMargins(.top, 10 + edgeFade, for: .scrollContent)
            .onScrollGeometryChange(for: ListPlace.self) { geo in
                // The container is what lies between the insets: upside down, the air over the
                // composer below it and the bar (with the status bar) above it.
                let fromNewest = geo.contentOffset.y + geo.contentInsets.top
                let seenTo = fromNewest + geo.containerSize.height
                return ListPlace(atBottom: fromNewest <= 120, farUp: fromNewest > geo.containerSize.height * farUpScreens,
                                 underBar: geo.contentSize.height - seenTo > 1)
            } action: { _, place in
                if atBottom != place.atBottom { atBottom = place.atBottom }
                if farUp != place.farUp { farUp = place.farUp }
                if underBar != place.underBar { underBar = place.underBar }
                if place.atBottom { unseen = 0 }
            }
            .onChange(of: rows.last?.id) { before, now in
                // A newer message under the one that was newest (not the first read, nor a failed one taken away).
                guard let before, now != nil, let newest = rows.last?.message, rows.contains(where: { $0.id == before }) else { return }
                // What you send always brings you to the bottom; so does anything that arrives while you are there.
                if model.isMine(newest) || atBottom {
                    toLatest()
                } else {
                    unseen += 1
                }
            }
            // Over the messages, under the pill: what scrolls down to the foot dissolves into the paper.
            FootEdge()
            if pillVisible && (unseen > 0 || farUp) && !atBottom {
                ThreadPill(icon: .chevronDown, text: unseen > 0 ? L10n.Messages.newMessages : L10n.Messages.jumpToLatest) {
                    unseen = 0
                    toLatest()
                }
                .padding(.bottom, 10)
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .animation(.easeOut(duration: 0.16), value: pillVisible && (unseen > 0 || farUp) && !atBottom)
    }
}

extension MessageList {
    /// Back to the newest message (upside down, the list's top edge is the newest end). From far up
    /// the way is over rows the list has only guessed the height of, and an animation along it
    /// lands short: it goes at once, then settles exactly.
    private func toLatest() {
        guard farUp else {
            withAnimation(.easeInOut(duration: 0.3)) { position.scrollTo(edge: .top) }
            return
        }
        position.scrollTo(edge: .top)
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(80))
            position.scrollTo(edge: .top)
        }
    }
}

/// The thread's edge over its foot: no rule (it would be busy) but a narrow band of the paper fading
/// up into the messages, eased so neither of its own edges shows — the foot dissolving upward, not a
/// shadow. It catches no touch; the pill, the search results and the long-press layer lie over it.
private struct FootEdge: View {
    var body: some View {
        LinearGradient(stops: [
            .init(color: Tokens.cream, location: 0),
            .init(color: Tokens.cream.opacity(0.75), location: 0.35),
            .init(color: Tokens.cream.opacity(0.3), location: 0.7),
            .init(color: Tokens.cream.opacity(0), location: 1),
        ], startPoint: .bottom, endPoint: .top)
        .frame(height: edgeFade)
        .frame(maxWidth: .infinity)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Where the list is: at the newest (or near it), far up, and whether messages are under the bar.
private struct ListPlace: Equatable {
    let atBottom: Bool
    let farUp: Bool
    let underBar: Bool
}

extension View {
    /// Drawn upside down: the thread's list, and each of its rows the right way up again.
    func upsideDown() -> some View {
        scaleEffect(x: 1, y: -1, anchor: .center)
    }
}

/// One row: the day or time label that leads it, if any, and the message on its side.
private struct ThreadRowView: View {
    let row: ThreadRow
    let ctx: ThreadContext
    let deliveryLine: Bool

    var body: some View {
        // Between runs the air is wide; inside one the bubbles nearly touch. A label brings its own.
        let gap: CGFloat = row.dayLabel || row.timeLabel ? 0 : row.joinsAbove ? runGap : betweenRuns
        VStack(spacing: 0) {
            if row.dayLabel {
                DayLabel(text: ThreadScreen.day(row.message.sentAt))
            } else if row.timeLabel {
                DayLabel(text: ThreadScreen.time(row.message.sentAt))
            }
            MessageItem(row: row, ctx: ctx, deliveryLine: deliveryLine)
        }
        .padding(.top, gap)
    }
}

/// A day or time label between messages.
private struct DayLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(AppFonts.body(11.5)).foregroundStyle(Tokens.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.top, 14).padding(.bottom, 6)
    }
}

private struct QuietNote: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 14)
    }
}

/// Above the oldest message: the next page being read, a read that failed, or the start of the conversation.
private struct OlderRow: View {
    let model: ThreadModel

    var body: some View {
        VStack(spacing: 6) {
            if model.loadingOlder {
                SketchLoader(size: 22)
                note(L10n.Messages.loadingOlder)
            } else if model.olderError {
                note(L10n.Messages.loadOlderError)
                OrganicButton(L10n.Native.retry, variant: .textAccent, size: .sm) { model.loadOlder() }
            } else if !model.hasOlder {
                note(L10n.Messages.beginning)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 22)
        .padding(.top, 18).padding(.bottom, 6)
        .onAppear { if !model.olderError { model.loadOlder() } }
    }

    private func note(_ text: String) -> some View {
        Text(text).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).multilineTextAlignment(.center)
    }
}

/// The small pill over the composer: the way back to the latest message — or, without an action,
/// a word that something was done ("Copied"). Organic, terracotta-light, no outline.
struct ThreadPill: View {
    let icon: IconName
    let text: String
    var action: (() -> Void)?

    var body: some View {
        let face = HStack(spacing: 6) {
            OrganicIcon(icon, size: 14, color: Tokens.terracottaInk)
            Text(text).font(AppFonts.body(12.5, weight: .semibold)).foregroundStyle(Tokens.terracottaInk)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .background {
            let shape = WobRectShape(radius: 18, seed: 41, mag: 1.2)
            shape.fill(Tokens.cream)
            shape.fill(Tokens.terracottaLight.opacity(0.9))
        }
        .contentShape(Rectangle())
        if let action {
            Button(action: action) { face }.buttonStyle(.plain)
        } else {
            face.accessibilityAddTraits(.updatesFrequently)
        }
    }
}

// MARK: - One message

/// One message on its side of the thread: on theirs, their face beside the last bubble of each run
/// (and the column it stands in beside every one of theirs); the quote it answers over it, its
/// bubble — carrying a link's preview or a shared card — and a line if it is still on its way or
/// didn't go (`deliveryLine`: not when the next in its run is on its way too). Dragged toward the
/// middle it asks to be replied to.
private struct MessageItem: View {
    let row: ThreadRow
    let ctx: ThreadContext
    let deliveryLine: Bool

    var body: some View {
        let message = row.message
        let model = ctx.model
        let mine = model.isMine(message)
        // A card the viewer can't see, sent alone: nothing to draw (not even a face beside it).
        if model.carried(message) != .nothing {
            SwipeToReply(enabled: model.canReply(message), mine: mine, onReply: { ctx.onReply(message) }) {
                HStack(alignment: .bottom, spacing: 0) {
                    if mine { Spacer(minLength: 0) } else { TheirFace(shown: !row.position.joinsBelow, ctx: ctx) }
                    VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
                        MessageCore(row: row, ctx: ctx, interactive: true)
                        if deliveryLine { DeliveryLine(message: message, model: model) }
                    }
                    .frame(maxWidth: ctx.rowMax, alignment: mine ? .trailing : .leading)
                    if !mine { Spacer(minLength: 0) }
                }
            }
        }
    }
}

/// Their face, bottom-aligned beside the last bubble of their run (`shown`); else the empty column. A tap goes to their page.
private struct TheirFace: View {
    let shown: Bool
    let ctx: ThreadContext

    var body: some View {
        Group {
            if shown, let other = ctx.model.other {
                Button { ctx.openRoute(.author(other.handle)) } label: {
                    HandDrawnAvatar(initials: other.initials, imageURL: other.avatarUrl.flatMap(URL.init(string:)), color: other.accent,
                                    size: face, seed: other.avatarSeed.flatMap(Double.init).flatMap { $0 == 0 ? nil : $0 } ?? 3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.Messages.viewProfile)
            } else {
                Color.clear
            }
        }
        .frame(width: face, height: face)
        .padding(.trailing, faceGap)
    }
}

/// The message itself — the quote it answers and its bubble with all it carries — which a
/// long-press lifts: drawn again, without gestures, by the menu.
struct MessageCore: View {
    let row: ThreadRow
    let ctx: ThreadContext
    let interactive: Bool

    var body: some View {
        let message = row.message
        let model = ctx.model
        let mine = model.isMine(message)
        let carried = model.carried(message)
        let words = carried.words(of: message)
        let found = ChatLinks.links(in: words)
        let links = found.map { MessageLinkRange(range: $0.range, url: $0.url) }
        let pulse = ctx.flash.level(of: message.key)
        // A search hit in words the bubble doesn't show (a card's link, standing for the card) washes the whole bubble.
        let wholeHit = words != message.text && message.id == ctx.currentHit
        // A note carries its card above its words, not inside its bubble.
        let note = message.isNote
        let core = VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
            if note {
                NotedCard(message: message, carried: carried, mine: mine, ctx: ctx, interactive: interactive)
            } else if let quote = message.replyTo {
                QuotedReply(quote: quote, mine: mine, ctx: ctx, interactive: interactive)
            }
            MessageBubble(
                text: words, mine: mine, seed: seedFromId(message.key),
                quoteLabel: message.noteRef == nil ? nil : L10n.Messages.quotedNote,
                tuckTop: row.position.joinsAbove, tuckBottom: row.position.joinsBelow,
                links: links,
                highlights: words == message.text ? ctx.highlights[message.id] ?? [] : [],
                highlightStrong: message.id == ctx.currentHit,
                flash: wholeHit ? max(pulse, 0.5) : pulse,
                width: note ? nil : width(carried),
                plain: !note && carried.isCard && carried.card == nil,
                carries: !note && carried.carriesMore,
                onLinkTap: interactive ? { ctx.openLink($0) } : nil
            ) {
                if !note {
                    CarriedPart(carried: carried, afterWords: !words.isEmpty || message.noteRef != nil, ctx: ctx, interactive: interactive)
                }
            }
            // A reply lies over the foot of what it quotes, a note over the foot of its card.
            .padding(.top, message.replyTo == nil && !note ? 0 : -BubbleMetrics.replyOverlap)
        }
        .opacity(message.delivery == .failed ? 0.6 : 1)
        if interactive {
            core
                // Lifted into the menu's layer, it isn't left behind under the scrim (a ghost a step off the copy).
                .opacity(ctx.lifted == message.key ? 0 : 1)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { ctx.frames.frames[message.key] = $0 }
                .gesture(MessagePress { link in press(link, carried: carried) })
                // The press-and-hold is the message's whole menu: assistive tech reaches it (and Reply) as actions —
                // and each link in its words, which a finger finds by where it lies and VoiceOver can't.
                .accessibilityAction(named: L10n.Messages.reply) { if ctx.model.canReply(message) { ctx.onReply(message) } }
                .accessibilityActions {
                    ForEach(Array(zip(found, Self.linkActionLabels(found)).enumerated()), id: \.offset) { _, pair in
                        Button(pair.1) { ctx.openLink(pair.0.url) }
                    }
                }
                .accessibilityAction(named: L10n.Messages.moreMenu) { press(nil, carried: carried) }
        } else {
            core
        }
    }

    /// What VoiceOver calls the action of each link in a message's words: "Open link: host" (without
    /// www., as a story's link card names it) — or, for links sharing a host, the link as written.
    static func linkActionLabels(_ links: [ChatLinks.Link]) -> [String] {
        let hosts = links.map { $0.host.replacingOccurrences(of: "www.", with: "", options: .anchored) }
        return zip(links, hosts).map { link, host in
            L10n.Card.LinkPreview.open(host: hosts.count(where: { $0 == host }) > 1 ? link.text : host)
        }
    }

    private func width(_ carried: Carried<FeedCard>) -> CGFloat? {
        switch carried {
        case .preview: min(previewWidth, ctx.rowMax)
        case .card, .cardLoading: min(cardWidth, ctx.rowMax)
        case .words, .nothing: nil
        }
    }

    /// Held: the menu, offering the link under the finger — or, pressed elsewhere, the one the message leads to.
    private func press(_ link: URL?, carried: Carried<FeedCard>) {
        let message = row.message
        let frame = ctx.frames.frames[message.key] ?? .zero
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        ctx.onMenu(MessageMenu(row: row, frame: frame, link: link ?? carried.link(of: message)))
    }
}

extension Carried<FeedCard> {
    /// The card it carries, once read.
    var card: FeedCard? {
        if case let .card(card, _) = self { return card }
        return nil
    }

    /// It carries a preview or a card (or the card's stand-in) under its words.
    var carriesMore: Bool {
        switch self {
        case .preview, .card, .cardLoading: true
        case .words, .nothing: false
        }
    }

    /// The link a message leads to as a whole: its preview's, the card page it links to, else the first link in its words.
    func link(of message: ChatMessage) -> URL? {
        switch self {
        case let .preview(preview): preview.url
        case let .card(_, share), let .cardLoading(share): share.link?.url
        case .words, .nothing: ChatLinks.links(in: message.text).first?.url
        }
    }
}

/// What a bubble carries under its words: a link's page, a shared card, or the card's stand-in.
private struct CarriedPart: View {
    let carried: Carried<FeedCard>
    let afterWords: Bool
    let ctx: ThreadContext
    let interactive: Bool

    var body: some View {
        switch carried {
        case let .preview(preview):
            LinkPreviewSection(title: preview.title, description: preview.description,
                               host: preview.link.host.replacingOccurrences(of: "www.", with: "", options: .anchored),
                               imageURL: preview.imageURL, afterWords: afterWords,
                               onOpen: interactive ? { ctx.openLink(preview.url) } : nil)
        case let .card(card, _):
            SharedCard(card: card, ctx: ctx, interactive: interactive)
        case .cardLoading:
            SharedCardSkeleton()
        case .words, .nothing:
            EmptyView()
        }
    }
}

/// A shared card as the thread draws it (Messenger's shared post): its author — or the anonymous
/// mark —, cover, title, excerpt and the source line; a tap opens it.
private struct SharedCard: View {
    let card: FeedCard
    let ctx: ThreadContext
    let interactive: Bool

    var body: some View {
        let author = card.anonymous ? nil : card.author?.value1
        SharedCardSection(
            byline: author.map {
                CardByline(name: $0.handle, initials: $0.initials, imageURL: $0.avatarUrl.flatMap(URL.init(string:)),
                           color: $0.accent, avatarSeed: $0.avatarSeedValue)
            } ?? .anonymous(L10n.Card.anonymousAuthor),
            readTime: L10n.App.readMinutes(count: card.readMinutes),
            title: card.title, excerpt: card.excerpt, imageURL: card.imageUrl.flatMap(URL.init(string:)),
            accentHue: card.accentHue, source: L10n.Messages.cardSource,
            onOpen: interactive ? { ctx.openRoute(.card(card.routeKey)) } : nil)
    }
}

/// Over a note's words: whose card it was left on (the note glyph and "{handle} left a note on
/// your card" / "You left a note on {handle}'s card", inset on the sender's side), then that card in
/// a quote the note's bubble lies over — its skeleton while it is read, and, when the reader may
/// not see it (any more), the plain quote of "a card", which leads nowhere.
private struct NotedCard: View {
    let message: ChatMessage
    let carried: Carried<FeedCard>
    let mine: Bool
    let ctx: ThreadContext
    let interactive: Bool

    var body: some View {
        let handle = ctx.model.displayHandle
        let width = min(cardWidth, ctx.rowMax)
        let seed = seedFromId(message.key, start: 19)
        VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
            ReplyCaption(mine ? L10n.Messages.youLeftNote(handle: handle) : L10n.Messages.noteOnYourCard(handle: handle), icon: .note)
                .padding(mine ? .trailing : .leading, 12)
                .padding(.bottom, 4)
            switch carried {
            case let .card(card, _):
                CardQuote(seed: seed, width: width) { SharedCard(card: card, ctx: ctx, interactive: interactive) }
            case .cardLoading:
                CardQuote(seed: seed, width: width, plain: true) { SharedCardSkeleton() }
            case .words, .preview, .nothing:
                QuoteBubble(text: L10n.Messages.replyCard, seed: seed)
            }
        }
    }
}

/// The caption over a reply and the message it quotes, which the reply's bubble lies over; tapping it goes to the original.
private struct QuotedReply: View {
    let quote: ReplyQuote
    let mine: Bool
    let ctx: ThreadContext
    let interactive: Bool

    var body: some View {
        let model = ctx.model
        let handle = model.displayHandle
        let quotedMine = quote.senderId == model.me
        let caption = mine
            ? (quotedMine ? L10n.Messages.youRepliedToYourself : L10n.Messages.youRepliedTo(handle: handle))
            : (quotedMine ? L10n.Messages.repliedToYou(handle: handle) : L10n.Messages.repliedToThemselves(handle: handle))
        VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
            // Inset from the bubble's outer edge, on its side.
            ReplyCaption(caption)
                .padding(mine ? .trailing : .leading, 12)
                .padding(.bottom, 4)
            QuoteBubble(text: quote.text.isEmpty ? L10n.Messages.replyCard : quote.text, seed: seedFromId(quote.id, start: 19),
                        onTap: interactive ? { ctx.onQuote(quote.id) } : nil)
        }
    }
}

/// The line under a message on its way or one that didn't go (its bubble above is dimmed).
private struct DeliveryLine: View {
    let message: ChatMessage
    let model: ThreadModel
    /// Most sends are over before anyone looks; the line is for the ones that take a moment.
    @State private var slow = false

    var body: some View {
        switch message.delivery {
        case .failed:
            Button { model.retry(message.key) } label: {
                Text(L10n.Messages.sendFailed).font(AppFonts.body(11.5)).foregroundStyle(Tokens.terracotta)
            }
            .buttonStyle(.plain)
            .padding(.top, 4).padding(.horizontal, 4)
            .accessibilityHint(L10n.Messages.retry)
        case .sending:
            Text(L10n.Messages.sending).font(AppFonts.body(11.5)).foregroundStyle(Tokens.textMuted)
                .padding(.top, 4).padding(.horizontal, 4)
                .opacity(slow ? 1 : 0)
                .frame(height: slow ? nil : 0, alignment: .top)
                .task(id: message.key) {
                    try? await Task.sleep(for: .seconds(1))
                    withAnimation(.easeOut(duration: 0.2)) { slow = true }
                }
        case .delivered, .sent:
            EmptyView()
        }
    }
}

// MARK: - Swipe to reply

/// How far a message is dragged before letting go replies.
private let swipeToReply: CGFloat = 56

/// Drag a message toward the middle of the screen (theirs to the right, yours to the left) and the
/// reply glyph grows in behind it; past `swipeToReply` a tick says it will take, and letting go
/// replies. It always springs back. A sideways drag only, so scrolling the thread is not fought.
private struct SwipeToReply<Content: View>: View {
    let enabled: Bool
    let mine: Bool
    let onReply: () -> Void
    @ViewBuilder let content: Content
    @State private var pulled: CGFloat = 0
    @State private var ticked = false

    var body: some View {
        // Past the threshold the message gives, but with resistance.
        let shown = pulled <= swipeToReply ? pulled : swipeToReply + (pulled - swipeToReply) * 0.3
        let progress = min(1, pulled / swipeToReply)
        let row = content
            .offset(x: mine ? -shown : shown)
            .frame(maxWidth: .infinity)
            .background(alignment: mine ? .trailing : .leading) {
                if pulled > 0 {
                    OrganicIcon(.reply, size: 20, color: progress >= 1 ? Tokens.terracotta : Tokens.textMuted)
                        .opacity(progress)
                        .scaleEffect(0.6 + 0.4 * progress)
                        .padding(.horizontal, 6)
                        .accessibilityHidden(true)
                }
            }
        if enabled {
            row.gesture(ReplySwipe(direction: mine ? -1 : 1, onDrag: drag, onEnd: end))
        } else {
            row
        }
    }

    private func drag(_ distance: CGFloat) {
        pulled = min(distance, swipeToReply * 2.4)
        let past = pulled >= swipeToReply
        if past != ticked {
            ticked = past
            if past { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        }
    }

    private func end() {
        if pulled >= swipeToReply { onReply() }
        ticked = false
        withAnimation(.spring(response: 0.35, dampingFraction: 0.62)) { pulled = 0 }
    }
}
