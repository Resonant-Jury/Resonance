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

    /// The web's glyphs for the same places (Subnavbar, NotificationBell, FloatingWriteButton).
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

/// Four tabs and the pen. Each tab keeps its own navigation stack alive, so
/// switching tabs preserves where you were; re-tapping the current tab pops
/// to its root. The bar hides on pushed screens, like the system one.
struct MainTabView: View {
    @Environment(SessionStore.self) private var session
    @State private var tab: AppTab = .feed
    @State private var paths: [AppTab: NavigationPath] = [:]
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
                    push: { paths[t, default: NavigationPath()].append($0) },
                    popToRoot: { paths[t] = NavigationPath() }
                ))
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
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        // Content moves down under the banner rather than behind it.
        .safeAreaInset(edge: .top, spacing: 0) {
            if let date = session.deletionDate {
                AccountDeletionBanner(date: date).padding(.vertical, 6)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: paths[tab]?.isEmpty ?? true)
        .background(Tokens.cream)
        .environment(writer)
        .fullScreenCover(isPresented: $writer.isPresented, onDismiss: {
            // A published card opens on the current tab once the writer is gone, as the web goes to it.
            if let key = writer.publishedCard {
                writer.publishedCard = nil
                paths[tab, default: NavigationPath()].append(Route.card(key))
            }
        }) { WriteScreen().environment(writer) }
        .onOpenURL(perform: open)
        // A tapped push: its page, or the notifications when it has none (also after a cold start).
        .onChange(of: push.opened, initial: true) { _, opened in
            guard let opened else { return }
            push.opened = nil
            if let id = opened.notificationId { session.notifications.markRead(id: id) }
            if let url = URL(string: opened.route, relativeTo: session.config.origin)?.absoluteURL,
               Route(url: url, origin: session.config.origin) != nil {
                open(url)
            } else {
                tab = .notifications
            }
        }
        #if DEBUG
        // `-route /card/<slug>` or `-route /u/<handle>` opens that page at launch (screen checks).
        .task {
            // Once per launch: the tab view reappears (after the writer's full-screen
            // cover, a language change), and must not push the page again.
            guard !Self.openedLaunchRoute, let path = UserDefaults.standard.string(forKey: "route") else { return }
            Self.openedLaunchRoute = true
            open(session.config.origin.appending(path: path))
        }
        #endif
    }

    /// Site links (universal links, shared URLs) open on the current tab.
    private func open(_ url: URL) {
        guard let route = Route(url: url, origin: session.config.origin) else { return }
        // A conversation belongs to the Messages tab's stack.
        if case .thread = route { tab = .messages }
        paths[tab, default: NavigationPath()].append(route)
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
        if picked == tab { paths[tab] = NavigationPath() }
        tab = picked
    }

    private func path(_ t: AppTab) -> Binding<NavigationPath> {
        Binding(get: { paths[t] ?? NavigationPath() }, set: { paths[t] = $0 })
    }
}

/// A tab's root screen: the brand bar (the web's phone AppHeader), then the
/// page title and the content scrolling under the bar, with room at the
/// bottom for the tab bar. The brand bar has nothing to press, so it gives the
/// stories the room: it slides up under the status bar while reading down and
/// comes back on the way up (settling shown or hidden when the scroll stops).
/// A `banner` floats just under the bar, over the content, and moves with it.
struct TabScreen<Trailing: View, Banner: View, Content: View>: View {
    let title: String
    var headerSpacing: CGFloat
    let trailing: Trailing
    let banner: Banner
    let content: Content
    @State private var scrolled = false
    /// How far the brand bar has slid up (0…`travel`).
    @State private var hidden: CGFloat = 0
    /// The bar's row above its wavy edge: 4 of air and the 44 lockup.
    private let travel: CGFloat = 48

    init(_ title: String, headerSpacing: CGFloat = 20, @ViewBuilder trailing: () -> Trailing = { EmptyView() },
         @ViewBuilder banner: () -> Banner, @ViewBuilder content: () -> Content) {
        self.title = title
        self.headerSpacing = headerSpacing
        self.trailing = trailing()
        self.banner = banner()
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                OrganicLargeHeader(title) { trailing }
                    .padding(.bottom, headerSpacing)
                content
            }
            // --page-pad-top on a phone.
            .padding(.top, 40)
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
        .safeAreaInset(edge: .top, spacing: 0) { OrganicBrandBar(scrolled: scrolled).offset(y: -hidden) }
        // The status bar keeps its paper while the bar slides under it.
        .overlay(alignment: .top) {
            Color.clear.frame(height: 0).background(Tokens.cream.ignoresSafeArea(edges: .top))
        }
    }
}

extension TabScreen where Banner == EmptyView {
    init(_ title: String, headerSpacing: CGFloat = 20, @ViewBuilder trailing: () -> Trailing = { EmptyView() },
         @ViewBuilder content: () -> Content) {
        self.init(title, headerSpacing: headerSpacing, trailing: trailing, banner: { EmptyView() }, content: content)
    }
}
