import DesignSystem
import ResonanceKit
import SwiftUI

/// The home feed (home/page.tsx): the heading and its line, today's picks,
/// then "load more" for the latest cards, and the prompt to write.
struct FeedScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @State private var model: FeedModel?

    var body: some View {
        TabScreen(L10n.Home.heading) {
            CSSText(L10n.Home.subheading, font: AppFonts.uiFont(.body, size: 15), lineHeight: 1.6, color: UIColor(Tokens.textMuted))
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
            content
        }
        .refreshable { await model?.refresh() }
        .task {
            if model == nil { model = FeedModel(api: ReadingAPI(client: session.api)) }
            if model?.phase == .idle { await model?.load() }
        }
    }

    @ViewBuilder private var content: some View {
        switch model?.phase ?? .idle {
        case .idle, .loading:
            SketchLoader(size: 48).frame(maxWidth: .infinity).padding(.top, 60)
        case .failed:
            OrganicEmptyState(L10n.Native.loadError, actionTitle: L10n.Native.retry) { Task { await model?.load() } }
        case .loaded:
            if let model, model.isEmpty {
                OrganicEmptyState(L10n.Home.Empty.subtitle, actionTitle: L10n.Home.Empty.cta) { writer.open() }
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
                    .font(AppFonts.heading(20))
                    .foregroundStyle(Tokens.text)
                    .multilineTextAlignment(.center)
            }
            if model.canLoadMore {
                OrganicButton(model.isLoadingMore ? L10n.Home.moreLoading : L10n.Home.moreBtn, variant: .outline) {
                    Task { await model.loadMore() }
                }
            }
            OrganicButton(L10n.Home.writeResponse) { writer.open() }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 48)
        .padding(.horizontal, 20)
    }
}
