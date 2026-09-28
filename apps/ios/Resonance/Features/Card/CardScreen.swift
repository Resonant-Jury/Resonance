import DesignSystem
import ResonanceKit
import SwiftUI

/// A card's page (card/[slug]/page.tsx, phone layout): byline, cover, title,
/// the story, tags; then the resonance and related sections on their bands.
struct CardScreen: View {
    let key: String
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute
    @Environment(\.openURL) private var openURL
    @State private var model: CardModel?

    var body: some View {
        ScrollView {
            switch model?.phase ?? .loading {
            case .loading:
                SketchLoader(size: 48).frame(maxWidth: .infinity).padding(.top, 120)
            case .notFound:
                OrganicEmptyState(L10n.Card.NotFound.title, actionTitle: L10n.Card.NotFound.back) { openRoute.dismissToRoot() }
                    .padding(.top, 80)
            case .failed:
                OrganicEmptyState(L10n.Native.loadError, actionTitle: L10n.Native.retry) { Task { await model?.load() } }
                    .padding(.top, 80)
            case .loaded:
                if let model, let detail = model.detail { page(model, detail) }
            }
        }
        .scrollIndicators(.hidden)
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            OrganicInlineBar("", backLabel: L10n.App.Nav.back) {
                if let detail = model?.detail, !detail.isOwner, let authorId = detail.anonymous ? nil : detail.card.author?.value1.id ?? nil {
                    SafetyMenu(target: .card(id: detail.card.id, authorId: authorId), handle: detail.card.author?.value1.handle)
                }
                if let detail = model?.detail {
                    ShareLink(item: session.config.origin.appending(path: "card/\(detail.card.routeKey)")) {
                        OrganicIcon(.share, size: 22).foregroundStyle(Tokens.text).frame(width: 44, height: 44)
                    }
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if model == nil { model = CardModel(key: key, api: session.reading) }
            // Also resumes a load that was cut short when the page left mid-way.
            if let model, model.detail == nil { await model.load() }
        }
    }

    private func page(_ model: CardModel, _ detail: CardDetail) -> some View {
        let card = detail.card
        let hue = card.accentHue ?? 55
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                byline(card, anonymous: detail.anonymous)
                    .padding(.bottom, 24)
                if let url = card.imageUrl.flatMap(URL.init(string:)) {
                    OrganicImage(url: url, seed: hue + 11, fill: Tokens.creamDark)
                        .aspectRatio(1 / 0.52, contentMode: .fit)
                        .padding(.bottom, 20)
                        .accessibilityLabel(card.imageLabel ?? card.title)
                }
                Text(card.title)
                    .font(AppFonts.heading(28))
                    .tracking(-0.015 * 28)
                    .foregroundStyle(Tokens.text)
                    .lineSpacing(28 * 0.2)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.bottom, 28)
                StoryMarkdownView(blocks: model.blocks, onOpenURL: open) { href, title in
                    CardEmbedView(href: href, title: title)
                }
                .padding(.bottom, 32)
                if !card.tags.isEmpty {
                    FlowRow(spacing: 8) {
                        ForEach(card.tags, id: \.self) { TagPill($0, fill: Tokens.terracottaLight) }
                    }
                    .padding(.bottom, 40)
                }
                if !model.links.isEmpty {
                    Text(L10n.Card.linkedCards).font(AppFonts.heading(20)).foregroundStyle(Tokens.text).padding(.bottom, 16)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            if !model.links.isEmpty { StoryCardList(cards: model.links).padding(.bottom, 40) }

            let resonance = model.resonanceSection
            if !resonance.isEmpty {
                section(L10n.Card.ResonanceSection.title, cards: resonance, background: Tokens.creamDark)
            }
            if !model.related.isEmpty {
                section(L10n.Card.related, cards: model.related, background: resonance.isEmpty ? Tokens.creamDark : Tokens.cream)
            }
            Color.clear.frame(height: 40)
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

    private func section(_ title: String, cards: [FeedCard], background: Color) -> some View {
        VStack(spacing: 0) {
            Text(title)
                .font(AppFonts.heading(22))
                .tracking(-0.22)
                .foregroundStyle(Tokens.text)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            StoryCardList(cards: cards)
        }
        .padding(.top, 72)
        .padding(.bottom, 56)
        .background(background)
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
            } else {
                Text(title)
                    .font(AppFonts.body(17))
                    .underline()
                    .foregroundStyle(Tokens.terracotta)
                    .opacity(failed ? 1 : 0.6)
                    .frame(maxWidth: .infinity, minHeight: failed ? nil : 88, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
        .task(id: href) {
            do { card = try await ReadingAPI(client: session.api).card(key).card } catch { failed = true }
        }
    }
}
