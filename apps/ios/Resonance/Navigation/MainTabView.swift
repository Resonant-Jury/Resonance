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

    var symbol: String {
        switch self {
        case .feed: "sparkles"
        case .messages: "bubble.left.and.bubble.right"
        case .write: "pencil.line"
        case .notifications: "bell"
        case .cardBox: "tray.full"
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
                    OrganicTabItem(id: $0, title: $0.title, symbol: $0.symbol, isAction: $0 == .write,
                                   badge: $0 == .notifications ? session.notifications.unreadCount : 0)
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
        .fullScreenCover(isPresented: $writer.isPresented) { WriteScreen() }
        .onOpenURL(perform: open)
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

/// A tab's root screen: scrolling content under the large organic header,
/// with room at the bottom for the floating tab bar.
struct TabScreen<Trailing: View, Content: View>: View {
    let title: String
    let trailing: Trailing
    let content: Content

    init(_ title: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }, @ViewBuilder content: () -> Content) {
        self.title = title
        self.trailing = trailing()
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                OrganicLargeHeader(title) { trailing }
                content
            }
            .padding(.bottom, 110)
        }
        .scrollIndicators(.hidden)
        .background(Tokens.cream)
    }
}
