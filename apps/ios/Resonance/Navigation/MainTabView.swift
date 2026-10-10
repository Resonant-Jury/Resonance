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
    /// Counts the taps on a tab that is already chosen and at its root: each one takes the root's
    /// list back to its top.
    @Entry var scrollToTop = 0
}

/// Which navigation chrome a tab shows over its stack (round 5 C1), from the window and the pages
/// pushed over the tab's root.
enum TabChrome {
    /// A tablet's header carries the tab group and the pen on a tab's root only: a pushed page has
    /// its back arrow, its context and its actions — only "back" leads out.
    static func headerTabs(_ layout: LayoutClass, pushed: [Route]) -> Bool {
        layout.topTabs && pushed.isEmpty
    }

    /// A phone's bottom bar shows on a tab's root only, as the tablet's header tabs do: a pushed
    /// page has its back arrow, and only "back" leads out (the owner; Android draws the same).
    static func bottomBar(_ layout: LayoutClass, pushed: [Route]) -> Bool {
        !layout.topTabs && pushed.isEmpty
    }
}

/// What a tap on a tab does: the pen writes; another tab is chosen (where it was left); the chosen one
/// goes back to its root, or, already there, back to the top of its list.
enum TabTap: Equatable {
    case write, choose, popToRoot, scrollToTop

    static func of(_ picked: AppTab, current: AppTab, pushed: Int) -> TabTap {
        if picked == .write { return .write }
        if picked != current { return .choose }
        return pushed > 0 ? .popToRoot : .scrollToTop
    }
}

/// Four tabs and the pen. Each tab keeps its own navigation stack alive, so
/// switching tabs preserves where you were; re-tapping the current tab pops
/// to its root, and at its root takes its list back to the top. On a phone the
/// bar stays on pushed pages (the system's convention), giving way only to the
/// writer, the thought map and a conversation (``TabChrome``). A window medium
/// or wider (an iPad) carries the tabs in the middle of a full-width header
/// instead — one segmented group — and the pen at its end (round 5 B2, C:
/// iPadOS's top tabs, drawn our way), on a tab's root only: the root's bar
/// leaves them room (``HeaderChrome``), and a pushed page shows neither, its
/// own back arrow the way out. One navigation state, drawn either way, so
/// rotating or resizing the window never loses the place. On an expanded
/// window the Messages tab draws its conversation beside the list
/// (``MessagesPanes``). ⌘1…⌘4 choose a tab, ⌘N writes.
struct MainTabView: View {
    @Environment(SessionStore.self) private var session
    @State private var tab: AppTab = .feed
    @State private var paths: [AppTab: [Route]] = [:]
    @State private var writer = WriteLauncher()
    /// The window as measured here (never the screen: an iPad window can be any width).
    @State private var window = WindowLayout.phone
    /// The header's tab group as drawn (its width is what each page's bar leaves room for).
    @State private var groupWidth: CGFloat = 0
    /// Taps on each tab while it was chosen and at its root (``EnvironmentValues/scrollToTop``).
    @State private var toTop: [AppTab: Int] = [:]
    private let push = PushCenter.shared

    private let tabs: [AppTab] = [.feed, .messages, .notifications, .cardBox]
    #if DEBUG
    private static var openedLaunchRoute = false
    #endif

    /// The header's tabs and pen over the current tab: its root only.
    private var topTabs: Bool { TabChrome.headerTabs(window.layoutClass, pushed: path(tab).wrappedValue) }

    /// The phone's bottom bar over the current tab's page.
    private var bottomBar: Bool { TabChrome.bottomBar(window.layoutClass, pushed: path(tab).wrappedValue) }

    /// The conversation beside the list (expanded windows).
    private var twoPane: Bool { window.layoutClass == .expanded }

    private var tabItems: [OrganicTabItem<AppTab>] {
        Self.tabItems(notifications: session.notifications.unreadCount, messages: session.conversations.unreadTotal)
    }

    /// The bar's five items in its order, the pen among them as its action; the header's group takes
    /// the four tabs of them (``OrganicTopTabs/segments(_:)``).
    static func tabItems(notifications: Int, messages: Int) -> [OrganicTabItem<AppTab>] {
        AppTab.allCases.map {
            OrganicTabItem(id: $0, title: $0.title, icon: $0.icon, isAction: $0 == .write,
                           badge: $0 == .notifications ? notifications : $0 == .messages ? messages : 0)
        }
    }

    var body: some View {
        effects(chrome)
    }

    private var chrome: some View {
        stacks
            // Each page's bar spans the window and leaves the tabs and the pen their room.
            .environment(\.headerChrome, window.topTabs ? HeaderChrome(groupWidth: groupWidth) : nil)
            .overlay(alignment: .top) {
                if topTabs { headerTabs.transition(.opacity) }
            }
            .animation(.easeOut(duration: 0.16), value: topTabs)
        // The window's width: the root's own plus the safe areas at its sides (a landscape iPhone's notch).
        .onGeometryChange(for: WindowLayout.self) { geo in
            WindowLayout(width: geo.size.width + geo.safeAreaInsets.leading + geo.safeAreaInsets.trailing,
                         height: geo.size.height + geo.safeAreaInsets.top + geo.safeAreaInsets.bottom)
        } action: { window = $0 }
        .environment(\.window, window)
        // The hardware keyboard's ⌘N opens the writer, as the pen does; ⌘1…⌘4 choose a tab, as a tap does.
        .background {
            Button(L10n.App.Nav.write) { writer.open() }
                .keyboardShortcut("n", modifiers: .command)
                .opacity(0)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            ForEach(Array(tabs.enumerated()), id: \.element) { i, t in
                Button(t.title) { select(t) }
                    .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: .command)
                    .opacity(0)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
    }

    /// The tablet header's own chrome (round 5 B2, C), drawn once above the stacks over a tab's root:
    /// the tab group on the window's centre line, the pen at its trailing end, in the 72 row under the
    /// status bar that the root's bar shares. It fades as a page pushes over the root.
    private var headerTabs: some View {
        ZStack {
            OrganicTopTabs(items: tabItems, selection: tab, labels: window.layoutClass.tabLabels,
                           room: HeaderChrome.labelRoom(width: window.width), label: L10n.App.Nav.main,
                           onSelect: select) { groupWidth = $0 }
            HStack {
                Spacer(minLength: 0)
                OrganicPenButton(title: AppTab.write.title, icon: AppTab.write.icon) { writer.open() }
            }
            .padding(.trailing, window.pad)
        }
        .frame(height: HeaderChrome.rowHeight)
    }

    private var stacks: some View {
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
                .environment(\.scrollToTop, toTop[t] ?? 0)
                .opacity(t == tab ? 1 : 0)
                .allowsHitTesting(t == tab)
                .accessibilityHidden(t != tab)
            }
            if bottomBar {
                OrganicTabBar(items: tabItems, selection: tab, onSelect: select)
                    // A field's keyboard rises over it rather than carrying it up.
                    .ignoresSafeArea(.keyboard, edges: .bottom)
                    // In place, fading: back from a page it gave way to it is simply there again (a slide
                    // up after the pop has finished read as arriving late), and it gives way as quickly.
                    .transition(.opacity)
            }
        }
    }

    /// What the tab view does around its stacks: the banner, the writer's requests, links and pushes.
    private func effects(_ content: some View) -> some View {
        content
        // Content moves down under the banner rather than behind it.
        .safeAreaInset(edge: .top, spacing: 0) {
            if let date = session.deletionDate {
                AccountDeletionBanner(date: date).padding(.vertical, 6)
            }
        }
        .animation(.easeOut(duration: 0.12), value: bottomBar)
        .background(Tokens.cream)
        .environment(writer)
        .onAppear {
            writer.onChange = { [session] in
                session.noteOwnWrite()
                // A resonance made, changed or taken back can begin or end a connection: the live list says
                // so (`connectionsMoved`), so it should be listening — a failed listener listens again.
                session.conversations.resume()
            }
        }
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
        // Two panes: the conversation takes the detail pane's place, over nothing.
        if case .thread = route, twoPane {
            paths[.messages] = MessagesPanes.choose(route, in: paths[.messages] ?? [])
            return
        }
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
        case .messages:
            if twoPane {
                MessagesTwoPane(detail: MessagesPanes.split(paths[.messages] ?? []).detail) { route in
                    paths[.messages] = MessagesPanes.choose(route, in: paths[.messages] ?? [])
                }
            } else {
                ConversationsScreen()
            }
        case .notifications: NotificationsScreen()
        case .cardBox: CardBoxScreen()
        case .write: EmptyView()
        }
    }

    private func select(_ picked: AppTab) {
        switch TabTap.of(picked, current: tab, pushed: path(tab).wrappedValue.count) {
        case .write: writer.open()
        case .choose: tab = picked
        // In two panes the conversation beside the list stays; what was pushed over it goes.
        case .popToRoot: path(tab).wrappedValue = []
        case .scrollToTop: toTop[tab, default: 0] += 1
        }
    }

    /// The stack a tab's NavigationStack draws: in two panes, the Messages tab's conversation is the
    /// root's detail pane, so only what is pushed over it is.
    private func path(_ t: AppTab) -> Binding<[Route]> {
        guard t == .messages, twoPane else { return Binding(get: { paths[t] ?? [] }, set: { paths[t] = $0 }) }
        return Binding(get: { MessagesPanes.split(paths[.messages] ?? []).pushed },
                       set: { paths[.messages] = MessagesPanes.merge(detail: MessagesPanes.split(paths[.messages] ?? []).detail, pushed: $0) })
    }
}

/// A tab's root screen: the brand bar (the web's phone AppHeader), then the
/// page title and the content scrolling under the bar, with room at the
/// bottom for the tab bar. The brand bar has nothing to press, so it gives the
/// stories the room: it slides up under the status bar while reading down and
/// comes back on the way up (settling shown or hidden when the scroll stops).
/// A `banner` floats just under the bar, over the content, and moves with it.
/// A `.refreshable` given to it is pulled with the Resonance loader
/// (`sketchRefreshable`), never the system's spinner, and offered to VoiceOver
/// as a "Refresh" action on everything in the list (`sketchRefreshAction`).
/// Home has no page title (an empty `title`): the brand bar alone, and the
/// feed's first card begins right at the bar's line. Every other tab
/// (`titleInBar`) names itself in the bar where "Resonance" stood, with any
/// `trailing` control at the bar's end, and the content starts just under the
/// bar's line. The height between the bar and the tab bar is handed to a
/// filling ``OrganicEmptyState`` (`emptyStateRegion`).
struct TabScreen<Trailing: View, Banner: View, Content: View>: View {
    let title: String
    var headerSpacing: CGFloat
    var titleInBar: Bool
    let trailing: Trailing
    let banner: Banner
    let content: Content
    /// The screen's `.refreshable` (the feed, the card box), handed on to the scroll view drawn with the loader.
    @Environment(\.refresh) private var refresh
    /// With the tabs in the header there is no tab bar to keep room for, and the bar stays.
    @Environment(\.window) private var window
    /// The Messages list beside a conversation: the window's header is drawn above it, full width.
    @Environment(\.headerAbove) private var headerAbove
    /// A tap on this tab while it is chosen and here: back to the top.
    @Environment(\.scrollToTop) private var toTop
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var position = ScrollPosition(edge: .top)
    @State private var scrolled = false
    /// How far the brand bar has slid up (0…`travel`).
    @State private var hidden: CGFloat = 0
    /// The list's offset near its top (clamped: further down it doesn't matter), and the top it rests
    /// at — `RefreshPull`'s own measure of the gap a pull opens (`drawnDown`).
    @State private var nearTop: CGFloat = 0
    @State private var restingTop: CGFloat = 0
    /// What the scroll view shows between its insets (the bar above, the home indicator below).
    @State private var visibleHeight: CGFloat = 0
    /// How far the list is drawn down past its top (a pull, or the room a refresh keeps): the banner
    /// rides on the list, below the loader in that gap, never over it.
    private var drawnDown: CGFloat { max(0, -(nearTop + restingTop)) }
    /// The bar's row above its wavy edge: 4 of air and the 44 lockup. A tablet's header carries the
    /// navigation and never slides away.
    private var travel: CGFloat { window.topTabs ? 0 : 48 }
    private var topPadding: CGFloat { titleInBar ? 16 : title.isEmpty ? 0 : 40 }
    /// What the tab bar takes at the foot (nothing when the tabs are in the header).
    private var bottomRoom: CGFloat { window.topTabs ? 0 : OrganicTabBar<AppTab>.height + HeaderEdge.height }

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
                if !titleInBar, !title.isEmpty {
                    OrganicLargeHeader(title) { trailing }
                        .padding(.bottom, headerSpacing)
                }
                content
            }
            // An empty state fills what is left between the bar's line and the tab bar.
            .environment(\.emptyStateRegion, max(0, visibleHeight - topPadding - bottomRoom))
            // --page-pad-top on a phone; with the title in the bar, 16 of air under its line; none
            // without a title (home: the first card is the bar's edge).
            .padding(.top, topPadding)
            .padding(.bottom, window.topTabs ? 40 : 110)
            // For whoever can't pull, the same refresh is the list's "Refresh" action (among VoiceOver's actions on any of its rows).
            .sketchRefreshAction(named: L10n.Native.refresh)
        }
        .scrollPosition($position)
        .onChange(of: toTop) {
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.35)) { position.scrollTo(edge: .top) }
            withAnimation(.easeOut(duration: 0.18)) { hidden = 0 }
        }
        .onHeaderScroll($scrolled)
        .onChange(of: scrolled) { _, now in headerAbove?.scrolled(now) }
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
        .onScrollGeometryChange(for: CGFloat.self) { min($0.contentOffset.y, 0) } action: { _, y in nearTop = y }
        .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top } action: { restingTop = $0 }
        // The container is the scroll view's frame inside its insets: the bar above, the home indicator below.
        .onScrollGeometryChange(for: CGFloat.self) { $0.containerSize.height } action: { _, h in
            visibleHeight = h
        }
        .sketchRefreshable(refresh)
        .overlay(alignment: .top) { banner.offset(y: drawnDown - hidden) }
        .safeAreaInset(edge: .top, spacing: 0) {
            if headerAbove == nil {
                OrganicBrandBar(title: titleInBar ? title : nil, scrolled: scrolled) { if titleInBar { trailing } }
                    .offset(y: -hidden)
            }
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
