import DesignSystem
import ResonanceKit
import SwiftUI

/// The reader's actions under a story (ReadAfterArea → CardViewerActions, the
/// phone layout): 共振 as the one primary button, then the note as a quiet
/// text link and the bookmark as a bare glyph. Fades in once scrolled to.
/// Writing a resonance or a note lands with the editor (M3); until then
/// both open the writer.
struct CardViewerActions: View {
    let cardId: String
    @Environment(WriteLauncher.self) private var writer
    @State private var shown = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            OrganicButton(L10n.Card.resonate, icon: .wave) { writer.open() }
            HStack {
                // The web's secondaryOutline with its frame hidden: a link.
                Button { writer.open() } label: {
                    HStack(spacing: 7) {
                        OrganicIcon(.note, size: 16)
                        Text(L10n.Card.Note.entry).font(AppFonts.body(15, weight: .semibold)).tracking(15 * 0.02)
                    }
                    .foregroundStyle(Tokens.terracotta)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Spacer(minLength: 12)
                BookmarkButton(cardId: cardId)
            }
        }
        .opacity(shown ? 1 : 0)
        .offset(y: shown ? 0 : 10)
        .onScrollVisibilityChange(threshold: 0.08) { visible in
            guard visible, !shown else { return }
            withAnimation(.easeOut(duration: 0.6)) { shown = true }
        }
    }
}

/// BookmarkButton.tsx: the ribbon alone — muted and outlined when off,
/// filled terracotta when on — and a brief "Saved" beside it after saving.
struct BookmarkButton: View {
    let cardId: String
    @Environment(SessionStore.self) private var session
    @State private var active = false
    @State private var justSaved = false
    @State private var savedTimer: Task<Void, Never>?

    var body: some View {
        HStack(spacing: 4) {
            Button(action: toggle) {
                OrganicIcon(.bookmark, size: 20, color: active ? Tokens.terracotta : Tokens.textMuted,
                            strokeWidth: active ? 2 : 1.6, fill: active ? Tokens.terracotta : nil)
                    .padding(6)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(active ? L10n.Card.Bookmark.remove : L10n.Card.Bookmark.add)
            .accessibilityAddTraits(active ? .isSelected : [])
            .sensoryFeedback(.selection, trigger: active)
            if justSaved && active {
                Text(L10n.Card.Bookmark.saved)
                    .font(AppFonts.body(13))
                    .foregroundStyle(Tokens.terracotta)
                    .transition(.opacity)
            }
        }
        // The glyph's own 6pt pad on the web, not the 44pt hit box, meets the edge.
        .padding(.trailing, -6)
        .animation(.easeInOut(duration: 0.4), value: justSaved && active)
        .task(id: cardId) {
            active = (try? await session.bookmarks?.isBookmarked(cardId)) ?? false
        }
    }

    /// Optimistic, then reconciled with what the write returns.
    private func toggle() {
        guard let bookmarks = session.bookmarks else { return }
        let saving = !active
        active = saving
        justSaved = saving
        savedTimer?.cancel()
        if saving {
            savedTimer = Task {
                try? await Task.sleep(for: .seconds(3))
                if !Task.isCancelled { justSaved = false }
            }
        }
        Task {
            if let result = try? await bookmarks.toggle(cardId) { active = result } else { active = !saving }
        }
    }
}
