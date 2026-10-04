import DesignSystem
import ResonanceKit
import SwiftUI

enum AppTab: Hashable, CaseIterable {
    case feed, messages, write, notifications, cardBox

    var title: String {
        switch self {
        case .feed: L10n.Native.tabFeed
        case .messages: L10n.App.Nav.messages
        case .write: L10n.App.Nav.write
        case .notifications: L10n.App.Nav.notifications
        case .cardBox: L10n.App.Nav.me
        }
    }

    /// The web's glyphs for the same places (Subnavbar, NotificationBell, the header's write entry).
    var icon: IconName {
        switch self {
        case .feed: .sparkle
        case .messages: .chat
        case .write: .pen
        case .notifications: .bell
        case .cardBox: .cards
        }
    }
}

extension EnvironmentValues {
    /// Whether the tab a page is on is the one chosen. Every tab's stack stays mounted (unseen under
    /// the chosen one), so a page on another tab never disappears: what may only happen while it is
    /// seen (a conversation being read) asks this too.
    @Entry var isSelectedTab = true
}

/// Four tabs and the pen. Each tab keeps its own navigation stack alive, so
/// switching tabs preserves where you were; re-tapping the current tab pops
/// to its root. The bar hides on pushed screens, like the system one.
struct MainTabView: View {
    @Environment(SessionStore.self) private var session
    @State private var tab: AppTab = .feed
    @State private var paths: [AppTab: [Route]] = [:]
    @State private var writer = WriteLauncher()
    private let push = PushCenter.shared

    private let tabs: [AppTab] = [.feed, .messages, .notifications, .cardBox]
    #if DEBUG
    private static var openedLaunchRoute = false
    #endif

    var body: some View {
        ZStack(alignment: .bottom) {
            ForEach(tabs, id: \.self) { t in
                NavigationStack(path: path(t)) {
                    root(t)
                        .toolbar(.hidden, for: .navigationBar)
                        .appRoutes()
                }
                .environment(\.openRoute, OpenRouteAction(
                    push: { paths[t, default: []].append($0) },
                    popToRoot: { paths[t] = [] },
                    replaceTop: { route in
                        var path = paths[t] ?? []
                        if !path.isEmpty { path.removeLast() }
                        paths[t] = path + [route]
                    }
                ))
                .environment(\.isSelectedTab, t == tab)
                .opacity(t == tab ? 1 : 0)
                .allowsHitTesting(t == tab)
                .accessibilityHidden(t != tab)
            }
            if paths[tab]?.isEmpty ?? true {
                OrganicTabBar(items: AppTab.allCases.map {
                    OrganicTabItem(id: $0, title: $0.title, icon: $0.icon, isAction: $0 == .write,
                                   badge: $0 == .notifications ? session.notifications.unreadCount
                                       : $0 == .messages ? session.conversations.unreadTotal : 0)
                }, selection: tab, onSelect: select)
                    // In place, fading: back on a tab's first page it is simply there again (a slide up after
                    // the pop has finished read as arriving late), and on a push it gives way as quickly.
                    .transition(.opacity)
            }
        }
        // Content moves down under the banner rather than behind it.
        .safeAreaInset(edge: .top, spacing: 0) {
            if let date = session.deletionDate {
                AccountDeletionBanner(date: date).padding(.vertical, 6)
            }
        }
        .animation(.easeOut(duration: 0.12), value: paths[tab]?.isEmpty ?? true)
        .background(Tokens.cream)
        .environment(writer)
        .onAppear { writer.onChange = { [session] in session.noteOwnWrite() } }
        // The writer is a page on the current tab's stack, like the others.
        .onChange(of: writer.requested) { _, request in
            guard let request else { return }
            writer.requested = nil
            // A second tap on a pen while the first page is arriving must not stack another.
            if case .write? = paths[tab]?.last { return }
            paths[tab, default: []].append(.write(request))
        }
        .onOpenURL(perform: open)
        // A tapped push: its page, or the notifications when it has none (also after a cold start).
        .onChange(of: push.opened, initial: true) { _, opened in
            guard let opened else { return }
            push.opened = nil
            // A message sent to the account signed in before this one: nothing of it is opened here.
            guard opened.isFor(session.uid) else { return }
            if let id = opened.notificationId { session.notifications.markRead(id: id) }
            if let url = URL(string: opened.route, relativeTo: session.config.origin)?.absoluteURL,
               let route = Route(url: url, origin: session.config.origin) {
                let row = opened.notificationId.flatMap { id in session.notifications.items.first { $0.id == id } }
                open(Self.withSender(route, uid: opened.fromUserId, of: row))
            } else {
                tab = .notifications
            }
        }
        #if DEBUG
        // `-route /card/<slug>` or `-route /u/<handle>` opens that page at launch (screen checks); a query
        // comes along (`/messages/<handle>?note=…&card=…`, a bell's link).
        .task {
            // Once per launch: the tab view reappears (a language change), and must not push the page again.
            guard !Self.openedLaunchRoute, let path = UserDefaults.standard.string(forKey: "route") else { return }
            Self.openedLaunchRoute = true
            open(URL(string: path, relativeTo: session.config.origin)?.absoluteURL ?? session.config.origin.appending(path: path))
        }
        #endif
    }

    /// Site links (universal links, shared URLs) open on the current tab.
    private func open(_ url: URL) {
        guard let route = Route(url: url, origin: session.config.origin) else { return }
        open(route)
    }

    private func open(_ route: Route) {
        // A conversation belongs to the Messages tab's stack.
        if case .thread = route { tab = .messages }
        // Its message tapped while the conversation is open: it is on screen already, not opened again over itself.
        if let top = paths[tab]?.last, route.reopens(top) { return }
        paths[tab, default: []].append(route)
    }

    /// A push's link names the sender by pen name; a conversation opens by
    /// their uid, which the push carries (`data.fromUserId`) — even on a cold
    /// start, before any bell row has arrived. An older push without it takes
    /// the uid from its bell row, when that has arrived.
    static func withSender(_ route: Route, uid: String? = nil, of item: NotificationsStore.Item?) -> Route {
        guard case let .thread(handle, nil, note) = route else { return route }
        if let uid { return .thread(handle: handle, uid: uid, note: note) }
        guard let item, item.fromHandle == handle, let uid = item.fromUserId else { return route }
        return .thread(handle: handle, uid: uid, note: note)
    }

    @ViewBuilder private func root(_ t: AppTab) -> some View {
        switch t {
        case .feed: FeedScreen()
        case .messages: ConversationsScreen()
        case .notifications: NotificationsScreen()
        case .cardBox: CardBoxScreen()
        case .write: EmptyView()
        }
    }

    private func select(_ picked: AppTab) {
        if picked == .write {
            writer.open()
            return
        }
        if picked == tab { paths[tab] = [] }
        tab = picked
    }

    private func path(_ t: AppTab) -> Binding<[Route]> {
        Binding(get: { paths[t] ?? [] }, set: { paths[t] = $0 })
    }
}

/// A tab's root screen: the brand bar (the web's phone AppHeader), then the
/// page title and the content scrolling under the bar, with room at the
/// bottom for the tab bar. The brand bar has nothing to press, so it gives the
/// stories the room: it slides up under the status bar while reading down and
/// comes back on the way up (settling shown or hidden when the scroll stops).
/// A `banner` floats just under the bar, over the content, and moves with it.
/// Home keeps its title in the page; every other tab (`titleInBar`) names
/// itself in the bar where "Resonance" stood, with any `trailing` control at the
/// bar's end, and the content starts just under the bar's line.
struct TabScreen<Trailing: View, Banner: View, Content: View>: View {
    let title: String
    var headerSpacing: CGFloat
    var titleInBar: Bool
    let trailing: Trailing
    let banner: Banner
    let content: Content
    @State private var scrolled = false
    /// How far the brand bar has slid up (0…`travel`).
    @State private var hidden: CGFloat = 0
    /// The bar's row above its wavy edge: 4 of air and the 44 lockup.
    private let travel: CGFloat = 48

    init(_ title: String, headerSpacing: CGFloat = 20, titleInBar: Bool = false, @ViewBuilder trailing: () -> Trailing = { EmptyView() },
         @ViewBuilder banner: () -> Banner, @ViewBuilder content: () -> Content) {
        self.title = title
        self.headerSpacing = headerSpacing
        self.titleInBar = titleInBar
        self.trailing = trailing()
        self.banner = banner()
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if !titleInBar {
                    OrganicLargeHeader(title) { trailing }
                        .padding(.bottom, headerSpacing)
                }
                content
            }
            // --page-pad-top on a phone; with the title in the bar, 16 of air under its line.
            .padding(.top, titleInBar ? 16 : 40)
            .padding(.bottom, 110)
        }
        .onHeaderScroll($scrolled)
        // The offset within the scrollable range only: a rubber-band past either end must not move the bar.
        .onScrollGeometryChange(for: CGFloat.self) { geo in
            let limit = max(0, geo.contentSize.height + geo.contentInsets.top + geo.contentInsets.bottom - geo.containerSize.height)
            return min(max(geo.contentOffset.y + geo.contentInsets.top, 0), limit)
        } action: { old, new in
            hidden = new <= 0 ? 0 : min(travel, max(0, hidden + new - old))
        }
        .onScrollPhaseChange { _, phase, context in
            guard phase == .idle else { return }
            let y = context.geometry.contentOffset.y + context.geometry.contentInsets.top
            withAnimation(.easeOut(duration: 0.18)) { hidden = y < travel || hidden < travel / 2 ? 0 : travel }
        }
        .scrollIndicators(.hidden)
        .background(Tokens.cream)
        .overlay(alignment: .top) { banner.offset(y: -hidden) }
        .safeAreaInset(edge: .top, spacing: 0) {
            OrganicBrandBar(title: titleInBar ? title : nil, scrolled: scrolled) { if titleInBar { trailing } }
                .offset(y: -hidden)
        }
        // The status bar keeps its paper while the bar slides under it.
        .overlay(alignment: .top) {
            Color.clear.frame(height: 0).background(Tokens.cream.ignoresSafeArea(edges: .top))
        }
    }
}

extension TabScreen where Banner == EmptyView {
    init(_ title: String, headerSpacing: CGFloat = 20, titleInBar: Bool = false, @ViewBuilder trailing: () -> Trailing = { EmptyView() },
         @ViewBuilder content: () -> Content) {
        self.init(title, headerSpacing: headerSpacing, titleInBar: titleInBar, trailing: trailing, banner: { EmptyView() },
                  content: content)
    }
}
