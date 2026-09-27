import SwiftUI

/// Screens pushed onto a tab's stack.
enum Route: Hashable {
    /// A card by its URL segment (slug, or id for older cards).
    case card(String)
    /// A person by pen name.
    case author(String)
}

/// Pushes a route onto the current tab's stack (for taps that aren't
/// NavigationLinks, e.g. a card link inside a story).
struct OpenRouteAction {
    let push: (Route) -> Void
    var popToRoot: () -> Void = {}
    func callAsFunction(_ route: Route) { push(route) }
    func dismissToRoot() { popToRoot() }
}

extension EnvironmentValues {
    @Entry var openRoute = OpenRouteAction(push: { _ in })
}

extension Route {
    /// Site URLs the app can show itself: /card/{slug} and /u/{handle},
    /// with or without a locale prefix, relative or on the site's origin.
    init?(url: URL, origin: URL) {
        if let host = url.host(), host != origin.host() { return nil }
        var parts = url.pathComponents.filter { $0 != "/" }
        if let first = parts.first, ["en", "zh-TW"].contains(first) { parts.removeFirst() }
        guard parts.count == 2 else { return nil }
        switch parts[0] {
        case "card": self = .card(parts[1])
        case "u": self = .author(parts[1])
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
            }
        }
    }
}
