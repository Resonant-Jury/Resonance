import DesignSystem
import ResonanceKit
import SwiftUI

/// A card's page (card/[slug]/page.tsx, phone layout): byline, cover, title
/// (with its ⋯), the story, tags, what a reader can do next; then the
/// resonance and related sections, set straight on the page.
struct CardScreen: View {
    let key: String
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.openRoute) private var openRoute
    @Environment(\.openURL) private var openURL
    @State private var model: CardModel?
    @State private var scrolled = false
    /// The byline has scrolled under the bar, which then names the author.
    @State private var bylineGone = false

    var body: some View {
        ScrollView {
            switch model?.phase ?? .loading {
            case .loading:
                CardDetailSkeleton()
            case .notFound:
                OrganicEmptyState(title: L10n.Card.NotFound.title, titleSize: 24, actionTitle: L10n.Card.NotFound.back,
                                  actionStyle: .link) { openRoute.dismissToRoot() }
            case .failed:
                OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                    Task { await model?.load() }
                }
            case .loaded:
                if let model, let detail = model.detail { page(model, detail) }
            }
        }
        .onHeaderScroll($scrolled)
        // Where the byline ends: its 16 of air and the 44 avatar.
        .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 60 } action: { _, gone in
            withAnimation(.easeOut(duration: 0.2)) { bylineGone = gone }
        }
        .scrollIndicators(.hidden)
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            OrganicInlineBar("", backLabel: L10n.App.Nav.back, scrolled: scrolled) {
                if let detail = model?.detail, model?.phase == .loaded, bylineGone {
                    BarAuthor(card: detail.card, anonymous: detail.anonymous)
                        .transition(.opacity.combined(with: .offset(y: 8)))
                }
            } trailing: {
                if let detail = model?.detail {
                    let card = detail.card
                    let hue = card.accentHue ?? 55
                    ShareLink(item: session.config.origin.appending(path: "card/\(card.routeKey)")) {
                        OrganicChipFace(.share, seed: hue + 5, trigger: .bare)
                    }
                    .buttonStyle(OrganicPressStyle())
                    .accessibilityLabel(L10n.Card.share)
                    // The ⋯ lives in the bar, as phone apps keep a page's actions: the owner's, or the reader's safety menu —
                    // anonymous cards included (App Store 1.2), whose author only the server knows: Report alone.
                    if detail.isOwner {
                        CardActionsMenu(cardId: card.id, visibility: card.visibility.rawValue, routeKey: card.routeKey, seed: hue + 3,
                                        showsCardAfterEdit: false, onDeleted: { openRoute.dismissToRoot() }, trigger: .bare)
                    } else {
                        let author = detail.anonymous ? nil : card.author?.value1
                        SafetyMenu(target: .card(id: card.id, authorId: author?.id), handle: author?.handle, seed: hue + 3)
                    }
                }
            }
        }
        // The web's pen sits on the card page too: bottom right, 20 in.
        .overlay(alignment: .bottomTrailing) {
            if let detail = model?.detail {
                // On your own card the pen edits it (FloatingWriteButton's editsOwnCard), then comes back here.
                FloatingWriteButton(label: detail.isOwner ? L10n.App.Nav.editThisCard : L10n.App.Nav.write) {
                    if detail.isOwner { writer.edit(detail.card.id, showsCard: false) } else { writer.open() }
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if model == nil { model = CardModel(key: key, api: session.reading) }
            // Also resumes a load that was cut short when the page left mid-way.
            if let model, model.detail == nil { await model.load() }
        }
        // Edited, published or re-shelved from the writer or the ⋯: read it again.
        .onChange(of: writer.changes) {
            Task { await model?.load() }
        }
    }

    private func page(_ model: CardModel, _ detail: CardDetail) -> some View {
        let card = detail.card
        let hue = card.accentHue ?? 55
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                byline(card, anonymous: detail.anonymous)
                    .padding(.bottom, 28)
                if let url = card.imageUrl.flatMap(URL.init(string:)) {
                    OrganicImage(url: url, seed: hue + 11, fill: Tokens.creamDark)
                        .aspectRatio(1 / 0.52, contentMode: .fit)
                        .padding(.bottom, 20)
                        .accessibilityLabel(card.imageLabel ?? card.title)
                }
                CSSText(card.title, font: AppFonts.uiFont(.heading, size: 28, weight: .bold), lineHeight: 1.2,
                        tracking: -0.015 * 28)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.bottom, 28)
                StoryMarkdownView(blocks: model.blocks, onOpenURL: open) { href, title in
                    CardEmbedView(href: href, title: title)
                }
                .padding(.bottom, 32)
                if !card.tags.isEmpty {
                    // Tags are app furniture: the theme colour, not the card's hue.
                    FlowRow(spacing: 8) {
                        ForEach(card.tags, id: \.self) { TagPill($0, fill: Tokens.terracottaLight) }
                    }
                    .padding(.bottom, 40)
                }
                if !detail.isOwner {
                    CardViewerActions(cardId: card.id).padding(.bottom, 40)
                }
                if !model.links.isEmpty {
                    Text(L10n.Card.linkedCards)
                        .font(AppFonts.heading(20))
                        .tracking(-0.01 * 20)
                        .foregroundStyle(Tokens.text)
                        .padding(.bottom, 24)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            if !model.links.isEmpty { MiniCardList(cards: model.links).padding(.bottom, 40) }
            // The article's own bottom padding.
            Color.clear.frame(height: 40)

            let resonance = model.resonanceSection
            if !resonance.isEmpty {
                section(L10n.Card.ResonanceSection.title, headingGap: 40) { MiniCardList(cards: resonance) }
            }
            if !model.related.isEmpty {
                section(L10n.Card.related, headingGap: 56) { StoryCardList(cards: model.related) }
            }
            // Room for the pen.
            Color.clear.frame(height: 96)
        }
    }

    /// The phone byline: avatar, pen name (→ their page), verified mark, region · date.
    private func byline(_ card: FeedCard, anonymous: Bool) -> some View {
        let author = card.author?.value1
        return HStack(spacing: 12) {
            if let author, !anonymous {
                HandDrawnAvatar(initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                                color: author.accent, size: 44, seed: author.avatarSeedValue)
            } else {
                HandDrawnAvatar(initials: "·", color: Tokens.creamDark, size: 44, seed: 97)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    if let author, !anonymous {
                        Button(author.handle) { openRoute(.author(author.handle)) }
                            .font(AppFonts.body(16, weight: .semibold))
                            .foregroundStyle(Tokens.text)
                            .buttonStyle(.plain)
                        if author.verified {
                            OrganicIcon(.verified, size: 14, color: Tokens.sage, strokeWidth: 1.8)
                                .accessibilityLabel(L10n.Card.verified)
                        }
                    } else {
                        Text(L10n.Card.anonymousAuthor).font(AppFonts.body(16, weight: .semibold)).foregroundStyle(Tokens.textMuted)
                    }
                }
                Text(subline(card, region: anonymous ? nil : author?.region))
                    .font(AppFonts.body(13))
                    .foregroundStyle(Tokens.textMuted)
            }
        }
    }

    private func subline(_ card: FeedCard, region: String?) -> String {
        let date = card.publishedAt.flatMap(ISO8601.date).map {
            $0.formatted(.dateTime.month(.abbreviated).day().locale(Strings.shared.locale))
        }
        return [region, date].compactMap { $0 }.joined(separator: " · ")
    }

    /// A section under the article. On phones the web drops the tinted band
    /// and its wavy edge — the cards' own bands are chrome enough — so the
    /// heading sits straight on the page.
    private func section<Cards: View>(_ title: String, headingGap: CGFloat, @ViewBuilder cards: () -> Cards) -> some View {
        VStack(spacing: 0) {
            Text(title)
                .font(AppFonts.heading(22))
                .tracking(-0.01 * 22)
                .foregroundStyle(Tokens.text)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.bottom, headingGap)
                .accessibilityAddTraits(.isHeader)
            cards()
        }
        .padding(.top, 32)
        .padding(.bottom, 16)
    }

    /// Links in the story: pages of this site open in the app, the rest in Safari.
    private func open(_ url: URL) {
        let absolute = url.host() == nil ? session.config.origin.appending(path: url.path()) : url
        if let route = Route(url: absolute, origin: session.config.origin) {
            openRoute(route)
        } else {
            openURL(absolute)
        }
    }
}

/// The author in the bar once the byline has scrolled away: the avatar small
/// and the pen name (→ their page); an anonymous card shows its dot and
/// "anonymous".
private struct BarAuthor: View {
    let card: FeedCard
    let anonymous: Bool
    @Environment(\.openRoute) private var openRoute

    var body: some View {
        if let author = card.author?.value1, !anonymous {
            Button { openRoute(.author(author.handle)) } label: {
                HStack(spacing: 8) {
                    HandDrawnAvatar(initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                                    color: author.accent, size: 28, seed: author.avatarSeedValue)
                    Text(author.handle)
                        .font(AppFonts.body(15, weight: .semibold))
                        .foregroundStyle(Tokens.text)
                        .lineLimit(1)
                }
                // The bar's other controls' 44pt target, and their ink on press.
                .padding(.horizontal, 6)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(OrganicPressStyle(inset: 2))
            .padding(.horizontal, -6)
        } else {
            HStack(spacing: 8) {
                HandDrawnAvatar(initials: "·", color: Tokens.creamDark, size: 28, seed: 97)
                Text(L10n.Card.anonymousAuthor)
                    .font(AppFonts.body(15, weight: .semibold))
                    .foregroundStyle(Tokens.textMuted)
                    .lineLimit(1)
            }
        }
    }
}

/// CardDetailSkeleton on a phone: the byline, cover, title, story and tags
/// as shimmering blocks where they will land.
private struct CardDetailSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                SkeletonBlock(width: 44, circle: true)
                VStack(alignment: .leading, spacing: 7) {
                    SkeletonBlock(width: 140, height: 15)
                    SkeletonBlock(width: 96, height: 13)
                }
            }
            .padding(.bottom, 28)
            SkeletonBlock(height: 180, radius: 18).padding(.bottom, 20)
            VStack(alignment: .leading, spacing: 12) {
                SkeletonBlock(fraction: 0.9, height: 38)
                SkeletonBlock(fraction: 0.55, height: 38)
            }
            .padding(.bottom, 28)
            VStack(alignment: .leading, spacing: 12) {
                SkeletonBlock(height: 17)
                SkeletonBlock(height: 17)
                SkeletonBlock(height: 17)
                SkeletonBlock(fraction: 0.65, height: 17)
            }
            .padding(.bottom, 32)
            HStack(spacing: 8) {
                SkeletonBlock(width: 64, height: 26, radius: 13)
                SkeletonBlock(width: 84, height: 26, radius: 13)
                SkeletonBlock(width: 56, height: 26, radius: 13)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .accessibilityElement()
        .accessibilityLabel("Loading")
    }
}

/// A card link standing alone in a story: the linked card as an embed, or the
/// plain link when the viewer can't see it (web: CardEmbedLink).
struct CardEmbedView: View {
    let href: String
    let title: String
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute
    @State private var card: FeedCard?
    @State private var failed = false

    private var key: String { String(href.split(separator: "/").last ?? "") }

    var body: some View {
        Button { openRoute(.card(key)) } label: {
            if let card {
                EmbedStoryCard(title: card.title, author: card.author?.value1.handle ?? L10n.Card.anonymousAuthor,
                               imageURL: card.imageUrl.flatMap(URL.init(string:)), hue: card.accentHue,
                               seed: Double(seedFromString(href)))
            } else if failed {
                Text(title)
                    .font(AppFonts.body(17))
                    .underline()
                    .foregroundStyle(Tokens.terracotta)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                EmbedStoryCardPlaceholder(title: title)
            }
        }
        .buttonStyle(.plain)
        .task(id: href) {
            do { card = try await ReadingAPI(client: session.api).card(key).card } catch { failed = true }
        }
    }
}
