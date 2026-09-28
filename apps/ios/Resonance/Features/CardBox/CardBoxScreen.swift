import DesignSystem
import ResonanceKit
import SwiftUI

/// My card box (me/page.tsx): who I am, then my cards on six shelves —
/// published, private, drafts, the cards I resonated with, cards linking to
/// mine, bookmarks.
struct CardBoxScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute
    @Environment(WriteLauncher.self) private var writer
    @State private var shelf: ReadingAPI.CardBoxShelf = .published
    @State private var shelves: [ReadingAPI.CardBoxShelf: [FeedCard]] = [:]
    @State private var failed = false

    private static let order: [ReadingAPI.CardBoxShelf] = [.published, ._private, .draft, .resonated, .linked, .bookmarks]

    var body: some View {
        TabScreen(L10n.App.Nav.me) {
            OrganicIconButton(.sliders, label: L10n.Settings.title) { openRoute(.settings) }
        } content: {
            header.padding(.horizontal, 20)
            tabs
            shelfContent
        }
        .refreshable {
            await session.loadMe()
            await load(shelf, force: true)
        }
        .task(id: shelf) { await load(shelf) }
    }

    @ViewBuilder private var header: some View {
        if let me = session.me {
            HStack(spacing: 16) {
                Button { openRoute(.author(me.handle)) } label: {
                    HandDrawnAvatar(initials: me.initials, imageURL: me.avatarUrl.flatMap(URL.init(string:)),
                                    color: OKLCHColor.parse(me.accentColor) ?? Tokens.terracottaLight, size: 72,
                                    seed: Double(seedFromString(me.id)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.Me.viewPublicProfile)
                VStack(alignment: .leading, spacing: 4) {
                    Text(me.handle).font(AppFonts.heading(24)).foregroundStyle(Tokens.text)
                    Text(me.bio ?? L10n.Me.bioEmpty).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                }
                Spacer(minLength: 0)
            }
        } else if case .missing = session.profile {
            OrganicEmptyState(L10n.Auth.stepHandle)
        } else if case .failed = session.profile {
            OrganicEmptyState(L10n.Native.loadError, actionTitle: L10n.Native.retry) { Task { await session.loadMe() } }
        }
    }

    private var tabs: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                ForEach(Self.order, id: \.self) { s in
                    Button { shelf = s } label: {
                        Text(Self.title(s))
                            .font(AppFonts.body(14, weight: s == shelf ? .semibold : .regular))
                            .foregroundStyle(s == shelf ? Tokens.terracotta : Tokens.textMuted)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background {
                                if s == shelf {
                                    WobRectShape(radius: 14, seed: Double(Self.order.firstIndex(of: s) ?? 0) * 17 + 3, mag: 1.2)
                                        .fill(Tokens.terracottaLight.opacity(0.45))
                                }
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(s == shelf ? [.isSelected, .isButton] : .isButton)
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .sensoryFeedback(.selection, trigger: shelf)
    }

    @ViewBuilder private var shelfContent: some View {
        if let cards = shelves[shelf] {
            if cards.isEmpty {
                if shelf == .published {
                    OrganicEmptyState(L10n.Me.emptyPublished, actionTitle: L10n.Me.emptyPublishedCta) { writer.open() }
                } else {
                    OrganicEmptyState(Self.empty(shelf))
                }
            } else {
                StoryCardList(cards: cards)
            }
        } else if failed {
            OrganicEmptyState(L10n.Native.loadError, actionTitle: L10n.Native.retry) { Task { await load(shelf, force: true) } }
        } else {
            SketchLoader(size: 44).frame(maxWidth: .infinity).padding(.top, 40)
        }
    }

    private func load(_ s: ReadingAPI.CardBoxShelf, force: Bool = false) async {
        guard force || shelves[s] == nil else { return }
        do {
            shelves[s] = try await session.reading.cardBox(s)
            failed = false
        } catch {
            failed = true
        }
    }

    static func title(_ s: ReadingAPI.CardBoxShelf) -> String {
        switch s {
        case .published: L10n.Me.Tabs.published
        case ._private: L10n.Me.Tabs.`private`
        case .draft: L10n.Me.Tabs.draft
        case .resonated: L10n.Me.Tabs.resonated
        case .linked: L10n.Me.Tabs.linked
        case .bookmarks: L10n.Me.Tabs.bookmarks
        }
    }

    static func empty(_ s: ReadingAPI.CardBoxShelf) -> String {
        switch s {
        case .published: L10n.Me.emptyPublished
        case ._private: L10n.Me.emptyPrivate
        case .draft: L10n.Me.emptyDraft
        case .resonated: L10n.Me.emptyResonated
        case .linked: L10n.Me.emptyLinked
        case .bookmarks: L10n.Me.emptyBookmarks
        }
    }
}
