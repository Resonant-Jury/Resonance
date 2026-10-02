import DesignSystem
import ResonanceKit
import SwiftUI

/// Messages (MessagesPage.tsx, phone): your conversations, newest first, then
/// the people you're connected with but haven't talked to yet. Live: the rows
/// and the tab's badge follow Firestore as messages arrive.
struct ConversationsScreen: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        let store = session.conversations
        TabScreen(L10n.App.Nav.messages, headerSpacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                if store.loaded, store.conversations.isEmpty, store.starters.isEmpty {
                    CSSText(L10n.Messages.empty, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.7,
                            color: UIColor(Tokens.textMuted))
                        .padding(.top, 10)
                } else if !store.loaded, store.failed {
                    // Nothing read, and a listener failed: a retry rather than an empty page.
                    OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                        store.resume()
                    }
                }
                ForEach(store.conversations) { convo in
                    ConversationRow(person: convo.other, preview: preview(convo), time: convo.sentAt.map(Self.time),
                                    unread: convo.unread)
                }
                if !store.starters.isEmpty {
                    Text(L10n.Messages.startSection.uppercased())
                        .font(AppFonts.body(11))
                        .tracking(11 * 0.08)
                        .foregroundStyle(Tokens.textMuted)
                        .padding(.top, 16)
                        .padding(.bottom, 4)
                        .padding(.horizontal, 14)
                    ForEach(store.starters) { person in
                        ConversationRow(person: person, preview: L10n.Messages.noMessagesYet, time: nil, unread: 0)
                    }
                }
            }
            // The page's 14 plus the list pane's own 2 / 4.
            .padding(.leading, 16)
            .padding(.trailing, 18)
        }
    }

    private func preview(_ convo: ConversationsStore.Conversation) -> String {
        guard let text = convo.lastText else { return L10n.Messages.noMessagesYet }
        return (convo.lastFromMe ? L10n.Messages.youPrefix : "") + text
    }

    /// Today: the time, two-digit hour as the web's Intl (下午03:04); earlier: the date (9/29).
    static func time(_ date: Date) -> String {
        let style = Date.FormatStyle(locale: Strings.shared.locale)
        return Calendar.current.isDateInToday(date)
            ? date.formatted(style.hour(.twoDigits(amPM: .abbreviated)).minute(.twoDigits))
            : date.formatted(style.month(.defaultDigits).day(.defaultDigits))
    }
}

/// One row: the avatar, the pen name over the last line, the time and the
/// unread badge on the right; a faint hand-drawn wash while pressed.
private struct ConversationRow: View {
    let person: Person
    let preview: String
    let time: String?
    let unread: Int

    var body: some View {
        NavigationLink(value: Route.thread(handle: person.handle, uid: person.id, note: nil)) {
            HStack(spacing: 12) {
                HandDrawnAvatar(initials: person.initials, imageURL: person.avatarURL,
                                color: person.accentColor.flatMap(OKLCHColor.parse) ?? Tokens.terracottaLight,
                                size: 40, seed: person.avatarSeed.flatMap(Double.init).flatMap { $0 == 0 ? nil : $0 } ?? 5)
                VStack(alignment: .leading, spacing: 3) {
                    Text(person.handle).font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.text)
                    Text(preview).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 5) {
                    if let time { Text(time).font(AppFonts.body(11)).foregroundStyle(Tokens.textMuted) }
                    if unread > 0 { UnreadBadge(count: unread) }
                }
                .fixedSize()
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowWashStyle(seed: Double(seedFromString(person.id))))
    }
}

/// RowWash: the row's hand-drawn wash (R h·0.28, three turns across), shown while pressed.
private struct RowWashStyle: ButtonStyle {
    let seed: Double

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background {
            GeometryReader { geo in
                let h = Double(geo.size.height)
                WobRectShape(radius: h * 0.28, seed: seed, mag: 2.4, options: WobRectOptions(
                    curve: 1.3, cornerJitter: 2.4, cornerOffset: h * 0.05, segmentsH: .count(3), segmentsV: .count(1)))
                    .fill(Color.black.opacity(configuration.isPressed ? 0.045 : 0))
            }
        }
    }
}
