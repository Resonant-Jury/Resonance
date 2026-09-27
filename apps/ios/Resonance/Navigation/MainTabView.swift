import DesignSystem
import ResonanceKit
import SwiftUI

enum AppTab: Hashable, CaseIterable {
    case feed, messages, write, notifications, cardBox

    var title: String {
        switch self {
        case .feed: L10n.App.Nav.home
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
    @State private var tab: AppTab = .feed
    @State private var paths: [AppTab: NavigationPath] = [:]
    @State private var writing = false

    private let tabs: [AppTab] = [.feed, .messages, .notifications, .cardBox]

    var body: some View {
        ZStack(alignment: .bottom) {
            ForEach(tabs, id: \.self) { t in
                NavigationStack(path: path(t)) {
                    root(t)
                        .toolbar(.hidden, for: .navigationBar)
                }
                .opacity(t == tab ? 1 : 0)
                .allowsHitTesting(t == tab)
                .accessibilityHidden(t != tab)
            }
            if paths[tab]?.isEmpty ?? true {
                OrganicTabBar(items: AppTab.allCases.map { OrganicTabItem(id: $0, title: $0.title, symbol: $0.symbol, isAction: $0 == .write) },
                              selection: tab, onSelect: select)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: paths[tab]?.isEmpty ?? true)
        .background(Tokens.cream)
        .fullScreenCover(isPresented: $writing) { WriteScreen() }
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
            writing = true
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
