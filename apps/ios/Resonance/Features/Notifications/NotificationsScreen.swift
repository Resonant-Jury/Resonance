import DesignSystem
import ResonanceKit
import SwiftUI

/// Notifications, live (web: NotificationBell). Each one says who did what;
/// a note shows its words; tapping opens where it happened and marks it read.
struct NotificationsScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute

    var body: some View {
        let store = session.notifications
        TabScreen(L10n.App.Nav.notifications) {
            if store.loaded && store.items.isEmpty {
                OrganicEmptyState(L10n.App.Notifications.empty)
            } else if !store.loaded {
                SketchLoader(size: 48).frame(maxWidth: .infinity).padding(.top, 60)
            } else {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(store.items.enumerated()), id: \.element.id) { i, item in
                        if i > 0 { WavyDivider(seed: Double(29 + i * 7)).padding(.horizontal, 20) }
                        row(item)
                    }
                }
            }
        }
    }

    private func row(_ item: NotificationsStore.Item) -> some View {
        Button {
            session.notifications.markRead(item)
            if let route = Self.route(for: item) { openRoute(route) }
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(Self.text(for: item))
                        .font(AppFonts.body(15, weight: item.isUnread ? .semibold : .regular))
                        .foregroundStyle(item.isUnread ? Tokens.text : Tokens.textMuted)
                        .multilineTextAlignment(.leading)
                    if item.isUnread {
                        Circle().fill(Tokens.terracotta).frame(width: 6, height: 6).accessibilityLabel("unread")
                    }
                }
                if item.type == "note", let preview = item.preview, !preview.isEmpty {
                    Text("「\(preview)」").font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    static func text(for item: NotificationsStore.Item) -> String {
        let handle = item.fromHandle ?? ""
        switch item.type {
        case "invite": return L10n.App.Notifications.invite(handle: handle)
        case "invite_accepted": return L10n.App.Notifications.inviteAccepted(handle: handle)
        case "message": return L10n.App.Notifications.message(handle: handle)
        case "resonance_summary": return L10n.App.Notifications.resonanceSummary(count: item.count ?? 0)
        case "translation_done": return L10n.App.Notifications.translationDone
        case "resonance": return L10n.App.Notifications.resonance(handle: handle)
        case "note": return L10n.App.Notifications.note(handle: handle)
        case "card_link": return L10n.App.Notifications.cardLink(handle: handle)
        default: return item.type
        }
    }

    /// Where a notification leads (the web's hrefs). Conversations arrive in
    /// M4; until then the person's page stands in for them.
    static func route(for item: NotificationsStore.Item) -> Route? {
        switch item.type {
        case "translation_done", "card_link": return item.cardId.map(Route.card)
        case "invite_accepted", "message", "resonance", "note": return item.fromHandle.map(Route.author)
        default: return nil
        }
    }
}
