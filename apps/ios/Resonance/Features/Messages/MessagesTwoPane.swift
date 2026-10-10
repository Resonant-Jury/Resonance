import DesignSystem
import ResonanceKit
import SwiftUI

/// How the Messages tab's one stack draws on an expanded window (design §9): the conversation at
/// its foot is the detail pane beside the list; only what is pushed over that conversation (a
/// profile, a card) is pushed, over the whole content area. Narrower, the same stack draws as it
/// always has — rotating or resizing never loses the place.
enum MessagesPanes {
    /// The conversation the detail pane shows (the stack's first page, when it is one) and the
    /// pages pushed over it.
    static func split(_ path: [Route]) -> (detail: Route?, pushed: [Route]) {
        guard let first = path.first, case .thread = first else { return (nil, path) }
        return (first, Array(path.dropFirst()))
    }

    static func merge(detail: Route?, pushed: [Route]) -> [Route] {
        (detail.map { [$0] } ?? []) + pushed
    }

    /// A conversation chosen in the list (or opened by a link or a push): it takes the detail pane's
    /// place, and what was pushed over the one before goes with it. The same one again, with nothing
    /// to do there, changes nothing.
    static func choose(_ route: Route, in path: [Route]) -> [Route] {
        if let detail = split(path).detail, route.reopens(detail) { return path }
        return [route]
    }
}

/// The conversation chosen in a two-pane Messages (a row wears the active wash), and how a row chooses.
struct ChosenThread {
    var route: Route?
    var choose: (Route) -> Void

    /// Whether the row for `person` is the one in the detail pane.
    func isChosen(_ person: Person) -> Bool {
        guard case let .thread(handle, uid, _)? = route else { return false }
        if let uid { return uid == person.id }
        return handle.caseInsensitiveCompare(person.handle) == .orderedSame
    }
}

extension EnvironmentValues {
    /// Set in a two-pane Messages: the rows choose rather than push.
    @Entry var chosenThread: ChosenThread? = nil
    /// The thread is the detail pane beside the list: no back arrow, the rule at its leading side.
    @Entry var inDetailPane = false
}

/// The list | rule | conversation of an expanded window's Messages.
struct MessagesTwoPane: View {
    let detail: Route?
    let choose: (Route) -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window

    var body: some View {
        HStack(spacing: 0) {
            ConversationsScreen()
                .environment(\.chosenThread, ChosenThread(route: detail, choose: choose))
                .frame(width: Tokens.msgListW)
            ZStack {
                if case let .thread(handle, uid, note)? = detail {
                    ThreadScreen(handle: handle, uid: uid, note: note)
                        .id(detail)
                        .transition(.opacity)
                } else {
                    EmptyDetailPane(noConversations: noConversations)
                        .transition(.opacity)
                }
            }
            .environment(\.inDetailPane, true)
            // Exactly what is left beside the list: nothing in the thread may widen its pane.
            .frame(width: max(0, window.contentWidth - Tokens.msgListW))
            .frame(maxHeight: .infinity)
            .animation(.easeInOut(duration: 0.16), value: detail)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Tokens.cream)
    }

    private var noConversations: Bool {
        let store = session.conversations
        return store.loaded && store.conversations.isEmpty && store.starters.isEmpty
    }
}

/// The detail pane with nothing chosen: the bar's paper, empty, and the empty state — pick a
/// conversation, or (none at all) how conversations begin.
private struct EmptyDetailPane: View {
    let noConversations: Bool
    @State private var height: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            OrganicInlineBar("", backLabel: L10n.Messages.back).backHidden(true)
            Group {
                if noConversations {
                    OrganicEmptyState(title: L10n.Messages.emptyTitle, message: L10n.Messages.empty, icon: .chat, seed: 23, fills: true)
                } else {
                    OrganicEmptyState(message: L10n.Messages.pickOne, icon: .chat, seed: 23, fills: true)
                }
            }
            .environment(\.emptyStateRegion, height)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
            .padding(.leading, PaneRule.gutter)
        }
        .background(alignment: .leading) { PaneRule() }
        .background(Tokens.cream)
    }
}

/// The web's wavy vertical rule between the panes (MessagesPage `vRule`): seed 71, a turn every 34
/// or so, `INK`, in the field border at 35 %, from under the bars' paper to past the bottom. It sits
/// in the detail pane's leading gutter (12 | rule | 12).
struct PaneRule: View {
    /// The detail pane's leading room for the rule.
    static let gutter: CGFloat = 24

    var body: some View {
        GeometryReader { geo in
            let h = Double(geo.size.height) + 40
            let steps = max(2, Int((h / 34).rounded()))
            wavyVertical(h, seed: 71, amp: 2, steps: steps)
                .path(offsetX: 12, offsetY: 0)
                .stroke(Tokens.fieldBorderHover.opacity(0.35), style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
        }
        .frame(width: Self.gutter)
        .ignoresSafeArea(edges: [.top, .bottom])
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
