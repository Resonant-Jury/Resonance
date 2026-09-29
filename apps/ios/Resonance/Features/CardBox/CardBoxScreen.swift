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
            header.padding(.horizontal, 20).padding(.bottom, 24)
            tabs.padding(.bottom, 28)
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
                // The phone's settings entry: the pen (the app's settings glyph) in a small ghost chip.
                OrganicButton(icon: .pen, label: L10n.Me.editProfile) { openRoute(.settings) }
            }
        } else if case .missing = session.profile {
            OrganicEmptyState(message: L10n.Auth.stepHandle)
        } else if case .failed = session.profile {
            OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                Task { await session.loadMe() }
            }
        }
    }

    /// OrganicTabs' surface variant: the active shelf sits on a hand-drawn
    /// wash in a terracotta rim (seeded per tab key, as on the web).
    private var tabs: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Self.order, id: \.self) { s in
                    let active = s == shelf
                    Button { shelf = s } label: {
                        Text(Self.title(s))
                            .font(AppFonts.body(14, weight: active ? .semibold : .medium))
                            .foregroundStyle(active ? Tokens.terracotta : Tokens.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.top, 10)
                            .padding(.bottom, 14)
                            .background {
                                if active {
                                    let shape = WobRectShape(radius: 12, seed: Double(23 + Self.webKey(s).count * 7))
                                    shape.fill(Tokens.terracottaLight.opacity(0.45))
                                    shape.stroke(Tokens.terracotta, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                                }
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
                }
            }
            // Room for the wobble, which bleeds a few points past the tab.
            .padding(.horizontal, 20)
            .padding(.vertical, 7)
        }
        .scrollIndicators(.hidden)
        .sensoryFeedback(.selection, trigger: shelf)
    }

    @ViewBuilder private var shelfContent: some View {
        if let cards = shelves[shelf] {
            if cards.isEmpty {
                // An empty shelf is a line of muted text; the empty published
                // shelf also points at the first story (ux §4).
                VStack(spacing: 18) {
                    EmptyNote(Self.empty(shelf), size: 16, centered: true)
                    if shelf == .published {
                        OrganicButton(L10n.Me.emptyPublishedCta) { writer.open() }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 40)
            } else if shelf == .linked {
                MiniCardList(cards: cards)
            } else {
                StoryCardList(cards: cards)
            }
        } else if failed {
            OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                Task { await load(shelf, force: true) }
            }
        } else {
            FeedSkeleton(count: 6)
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

    /// The web's tab key, which seeds the active tab's outline.
    static func webKey(_ s: ReadingAPI.CardBoxShelf) -> String {
        switch s {
        case .published: "published"
        case ._private: "private"
        case .draft: "draft"
        case .resonated: "resonated"
        case .linked: "linked"
        case .bookmarks: "bookmarks"
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
