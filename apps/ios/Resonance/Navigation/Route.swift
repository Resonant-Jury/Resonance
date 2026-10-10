import DesignSystem
import ResonanceKit
import SwiftUI

/// Screens pushed onto a tab's stack.
enum Route: Hashable {
    /// A card by its URL segment (slug, or id for older cards).
    case card(String)
    /// A person by pen name.
    case author(String)
    case settings
    case settingsSection(SettingsSection)
    /// A conversation, by the other person's pen name and, when the place it's
    /// opened from knows it, their uid (which outlasts a change of pen name);
    /// `note` quotes a note to answer.
    case thread(handle: String, uid: String? = nil, note: MessagingAPI.NoteRef?)
    /// My thought map (me/thought-map).
    case thoughtMap
    /// The writing page: a new card, a draft, a published card's revision, a resonance.
    case write(WriteLauncher.Request)
}

extension Route {
    /// This route is the conversation `top` already shows, with nothing more to do there: opening it
    /// again would only stack a second copy over it (a note to go to still opens).
    func reopens(_ top: Route) -> Bool {
        guard case let .thread(handle, uid, nil) = self, case let .thread(topHandle, topUid, _) = top else { return false }
        if let uid, let topUid { return uid == topUid }
        return handle.caseInsensitiveCompare(topHandle) == .orderedSame
    }
}

/// Pushes a route onto the current tab's stack (for taps that aren't
/// NavigationLinks, e.g. a card link inside a story).
struct OpenRouteAction {
    let push: (Route) -> Void
    var popToRoot: () -> Void = {}
    var replaceTop: (Route) -> Void = { _ in }
    func callAsFunction(_ route: Route) { push(route) }
    func dismissToRoot() { popToRoot() }
    /// The page on top gives way to `route` (a published card takes the writer's place).
    func replacingTop(with route: Route) { replaceTop(route) }
}

extension EnvironmentValues {
    @Entry var openRoute = OpenRouteAction(push: { _ in })
}

extension Route {
    /// Site URLs the app can show itself: /card/{slug} and /u/{handle},
    /// with or without a locale prefix, relative or on the site's host (the
    /// origin's, or the one it had before: `StoryLink.isSiteHost`).
    init?(url: URL, origin: URL) {
        if let host = url.host(), !StoryLink.isSiteHost(host, origin: origin) { return nil }
        var parts = url.pathComponents.filter { $0 != "/" }
        if let first = parts.first, ["en", "zh-TW"].contains(first) { parts.removeFirst() }
        guard parts.count == 2 else { return nil }
        switch parts[0] {
        case "card": self = .card(parts[1])
        case "u": self = .author(parts[1])
        case "me" where parts[1] == "thought-map": self = .thoughtMap
        case "messages":
            // /messages/{handle}?note={noteId}&card={cardId} (a note's reply link) keeps its query.
            let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let value = { (name: String) in query.first { $0.name == name }?.value }
            let note = value("card").flatMap { card in value("note").map { MessagingAPI.NoteRef(cardId: card, noteId: $0) } }
            self = .thread(handle: parts[1], note: note)
        default: return nil
        }
    }
}

extension View {
    /// Where each route leads; attach inside every tab's NavigationStack.
    func appRoutes() -> some View {
        navigationDestination(for: Route.self) { route in
            switch route {
            case let .card(key): CardScreen(key: key)
            case let .author(handle): AuthorScreen(handle: handle)
            case .settings: SettingsScreen()
            case let .settingsSection(section): SettingsSectionScreen(section: section)
            case let .thread(handle, uid, note): ThreadScreen(handle: handle, uid: uid, note: note)
            case .thoughtMap: ThoughtMapScreen()
            // The writer has its own bar and covers the header's tabs: it keeps no room for them.
            case let .write(request): WriteScreen(request: request).environment(\.headerChrome, nil)
            }
        }
    }
}
