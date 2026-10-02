import DesignSystem
import ResonanceKit
import SwiftUI

/// The home feed (home/page.tsx): the heading and its line, today's picks,
/// then "load more" for the latest cards, and the prompt to write. Picks
/// that come after the latest cards are showing wait behind a hint.
struct FeedScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @State private var model: FeedModel?
    private static let listTop = "feed.top"

    var body: some View {
        ScrollViewReader { proxy in
            TabScreen(L10n.Home.heading, headerSpacing: 12, banner: { picksHint(proxy) }) {
                CSSText(L10n.Home.subheading, font: AppFonts.scaledUIFont(.body, size: 15), lineHeight: 1.6, color: UIColor(Tokens.textMuted))
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                content.id(Self.listTop)
            }
            .animation(.easeInOut(duration: 0.25), value: model?.picksReady ?? false)
        }
        .refreshable {
            // Asked for by hand: the server answers, not the HTTP cache.
            session.httpCache.freshness.invalidate()
            await model?.refresh()
        }
        .task {
            if model == nil { model = makeModel() }
            if model?.phase == .idle { await model?.load() }
        }
        // Back after a while: the feed asks again behind what it shows.
        .onChange(of: session.awayRefreshes) {
            Task { await model?.revalidate() }
        }
    }

    /// Picks that came after the latest cards were showing: they head the feed
    /// once asked for, and the feed goes up to meet them.
    @ViewBuilder private func picksHint(_ proxy: ScrollViewProxy) -> some View {
        if let model, model.picksReady {
            OrganicButton(L10n.Home.Recommended.ready, icon: .sparkle, size: .sm) {
                withAnimation(.easeInOut(duration: 0.25)) {
                    model.revealPicks()
                    proxy.scrollTo(Self.listTop, anchor: .top)
                }
            }
            .padding(.top, 10)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private func makeModel() -> FeedModel {
        let api = session.reading
        // The last run's feed for this account, drawn at once on a cold start; blocked people left out.
        let keeping = session.uid.map { FeedKeeping(session.kept, uid: $0) }
        let blocked = { [session] in session.blockedIds }
        #if DEBUG
        // `-feedPicksDelay <seconds>` holds today's picks back (screen checks of the late-picks hint).
        let delay = UserDefaults.standard.double(forKey: "feedPicksDelay")
        if delay > 0 {
            return FeedModel(feed: { try await api.feed(after: $0) }, recommended: {
                try? await Task.sleep(for: .seconds(delay))
                return try await api.recommended()
            }, keeping: keeping, blocked: blocked)
        }
        #endif
        return FeedModel(api: api, keeping: keeping, blocked: blocked)
    }

    @ViewBuilder private var content: some View {
        switch model?.phase ?? .idle {
        case .idle, .loading:
            FeedSkeleton(count: 6)
        case .failed:
            OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                Task { await model?.load() }
            }
        case .loaded:
            if let model, model.isEmpty {
                OrganicEmptyState(title: L10n.Home.Empty.title, message: L10n.Home.Empty.subtitle,
                                  actionTitle: L10n.Home.Empty.cta) { writer.open() }
            } else if let model {
                StoryCardList(cards: model.cards)
                footer(model)
            }
        }
    }

    private func footer(_ model: FeedModel) -> some View {
        VStack(spacing: 14) {
            if model.latestVisible && !model.canLoadMore {
                Text(L10n.Home.endOfDay)
                    .font(AppFonts.heading(22, weight: .regular))
                    .foregroundStyle(Tokens.text)
                    .multilineTextAlignment(.center)
            }
            if model.canLoadMore {
                OrganicButton(model.isLoadingMore ? L10n.Home.moreLoading : L10n.Home.moreBtn, variant: .textAccent) {
                    Task { await model.loadMore() }
                }
            }
            OrganicButton(L10n.Home.writeResponse) { writer.open() }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 64)
        .padding(.horizontal, 20)
    }
}
