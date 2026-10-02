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
        TabScreen(L10n.App.Nav.notifications, titleInBar: true) {
            if store.loaded && store.items.isEmpty {
                EmptyNote(L10n.App.Notifications.empty).padding(.horizontal, 20)
            } else if !store.loaded, store.failed {
                // Nothing read, and the listener failed: not a loader forever, a retry.
                OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                    store.resume()
                }
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
            // Read and unread differ by ink alone; the unread dot follows the
            // last line (after a note's words), as the web's inline dot does.
            let preview = item.type == "note" ? item.preview.flatMap { $0.isEmpty ? nil : $0 } : nil
            VStack(alignment: .leading, spacing: 5) {
                withDot(Text(Self.text(for: item)), if: item.isUnread && preview == nil)
                    .font(AppFonts.body(14))
                    .foregroundStyle(item.isUnread ? Tokens.text : Tokens.textMuted)
                if let preview {
                    withDot(Text("「\(preview)」"), if: item.isUnread)
                        .font(AppFonts.body(13))
                        .foregroundStyle(Tokens.textMuted)
                }
            }
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// The terracotta dot, 8 after the text on its last line.
    private func withDot(_ text: Text, if unread: Bool) -> Text {
        guard unread else { return text }
        let dot = Text(verbatim: "\u{25CF}").font(.system(size: 7)).foregroundStyle(Tokens.terracotta).baselineOffset(1.5)
        return Text("\(text)\u{2009}\u{2009}\(dot)")
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
        // NotificationBell: these open the conversation with that person; a note arrives quoted, ready to answer.
        case "note":
            let note = item.cardId.flatMap { card in item.noteId.map { MessagingAPI.NoteRef(cardId: card, noteId: $0) } }
            return item.fromHandle.map { Route.thread(handle: $0, uid: item.fromUserId, note: note) }
        case "invite_accepted", "message", "resonance": return item.fromHandle.map { Route.thread(handle: $0, uid: item.fromUserId, note: nil) }
        default: return nil
        }
    }
}
