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
                OrganicEmptyState(title: L10n.App.Notifications.emptyTitle, message: L10n.App.Notifications.empty,
                                  icon: .bell, seed: 37, fills: true)
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
            NotificationRowLabel(text: Self.text(for: item),
                                 preview: item.type == "note" ? item.preview.flatMap { $0.isEmpty ? nil : $0 } : nil,
                                 unread: item.isUnread)
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

    /// Where a notification leads (the web's hrefs).
    ///
    /// A note or resonance on one of your anonymous cards opens that card and nothing else: opening
    /// the writer's thread would read it (zeroing an unread count they can watch) and set up a reply
    /// that answers the anonymous card under your name. No card to open is nowhere to go — never the
    /// thread instead.
    static func route(for item: NotificationsStore.Item) -> Route? {
        if item.anonymous, ["note", "resonance"].contains(item.type) { return item.cardId.map(Route.card) }
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

/// A bell row's words: who did what, and under a note the note's own words. Read and unread differ
/// by ink alone, and the unread dot ends the first line, beside who it is from — on a note's row
/// too, never after the note's words, where it would read as a mark on the note (the web's
/// NotificationBell, Android's NotificationRow). The words are drawn as written (`verbatim`) and the
/// dot apart from them, so their 「，」「。」 sit as in every other line of the app — a localized
/// `Text` interpolation around them set them the zh-TW way, centred, while the row was unread.
/// VoiceOver hears "Unread" as the row's value, never the glyph (the web hides it, Android names it).
struct NotificationRowLabel: View {
    let text: String
    let preview: String?
    let unread: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .center, spacing: 8) {
                Text(verbatim: text)
                    .font(AppFonts.body(14))
                    .foregroundStyle(unread ? Tokens.text : Tokens.textMuted)
                if unread {
                    // The web's 6px dot, 8 after the words, on their middle.
                    Circle().fill(Tokens.terracotta).frame(width: 6, height: 6)
                        .accessibilityHidden(true)
                }
            }
            if let preview {
                Text(verbatim: "「\(preview)」")
                    .font(AppFonts.body(13))
                    .foregroundStyle(Tokens.textMuted)
            }
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(unread ? L10n.App.Notifications.unread : "")
    }
}
