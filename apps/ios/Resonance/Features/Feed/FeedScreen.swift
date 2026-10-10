import DesignSystem
import ResonanceKit
import SwiftUI

/// The home feed (home/page.tsx): today's picks right under the brand bar (no
/// page title: the first card's top edge is the bar's pen line), then "load
/// more" for the latest cards, a quiet end mark once nothing more can load, and
/// the prompt to write. Picks that come after the latest cards are showing wait
/// behind a hint.
struct FeedScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @State private var model: FeedModel?
    private static let listTop = "feed.top"

    var body: some View {
        ScrollViewReader { proxy in
            TabScreen("", banner: { picksHint(proxy) }) {
                content.id(Self.listTop)
            }
            .animation(.easeInOut(duration: 0.25), value: model?.picksReady ?? false)
            .animation(.easeInOut(duration: 0.25), value: model?.refreshFailure)
        }
        .refreshable {
            // Asked for by hand: the server answers, not the HTTP cache.
            session.httpCache.freshness.invalidate()
            await model?.refresh()
            // Nothing came back: the feed stayed; the quiet line over it says so, and so does VoiceOver.
            if let failure = model?.refreshFailure { AccessibilityNotification.Announcement(failure.message).post() }
        }
        // VoiceOver's Refresh further down the feed: the reader's place stays — the pages read with it, what's new above.
        .sketchRefreshInPlace {
            session.httpCache.freshness.invalidate()
            await model?.refreshInPlace()
            if let failure = model?.refreshFailure { AccessibilityNotification.Announcement(failure.message).post() }
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
            FeedSkeleton(count: 6, underBar: true)
        case .failed:
            OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                Task { await model?.load() }
            }
            .padding(.top, 40)
        case .loaded:
            if let model, model.isEmpty {
                OrganicEmptyState(title: L10n.Home.Empty.title, message: L10n.Home.Empty.subtitle,
                                  actionTitle: L10n.Home.Empty.cta) { writer.open() }
                    .padding(.top, 40)
            } else if let model {
                if let failure = model.refreshFailure {
                    // A pull that brought nothing back: the feed stays, and a quiet line over it says why
                    // (the first card then starts below it, with its own top rule).
                    RefreshNote(text: failure.message).padding(.top, 28)
                }
                StoryCardList(cards: model.cards, underBar: model.refreshFailure == nil)
                footer(model)
            }
        }
    }

    /// Under the last card: Load more while more can load (alone, no sentence); once nothing more
    /// can, the end mark (design §2), 48 below the last card.
    @ViewBuilder private func footer(_ model: FeedModel) -> some View {
        if model.canLoadMore {
            OrganicButton(model.isLoadingMore ? L10n.Home.moreLoading : L10n.Home.moreBtn, variant: .tonal) {
                Task { await model.loadMore() }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 64)
            .padding(.horizontal, 20)
        } else if model.latestVisible {
            FeedEndMark()
                .frame(maxWidth: .infinity)
                .padding(.top, 48)
                .padding(.horizontal, 20)
        }
    }
}

/// The end of the feed (design §2): a short pen wave with a terracotta dot just past its end —
/// the pen lifted — and one quiet line under it. Not a heading.
struct FeedEndMark: View {
    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 5) {
                PenWaveShape(seed: 307, amp: 1.2)
                    .stroke(Tokens.fieldBorderHover.opacity(0.7), style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                    .frame(width: 40, height: 8)
                Circle().fill(Tokens.terracotta).frame(width: 3.2, height: 3.2)
            }
            .accessibilityHidden(true)
            CSSText(L10n.Home.feedEnd, font: AppFonts.scaledUIFont(.body, size: 13.5), lineHeight: 1.5,
                    color: UIColor(Tokens.textMuted), alignment: .center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// A pull to refresh that brought nothing back, said quietly over what stayed on screen (never the
/// page's load error): a muted line, centred, gone with the next answer.
struct RefreshNote: View {
    let text: String

    var body: some View {
        EmptyNote(text, size: 13, centered: true)
            .padding(.horizontal, 20)
            .padding(.top, -12)
            .padding(.bottom, 24)
            .transition(.opacity)
    }
}
