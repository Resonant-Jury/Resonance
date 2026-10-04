import DesignSystem
import ResonanceKit
import SwiftUI

/// The reader's actions under a story (ReadAfterArea → CardViewerActions, the
/// phone layout): 共振 as the one primary button — opening the picker: write a
/// new card in answer, or pick one already written — or, once you have
/// answered this card, 已共振 opening your published resonance (修改 in
/// outline while it is a draft, back to the writer); then the note as a quiet
/// text link and the bookmark as a bare glyph. Fades in once scrolled to.
struct CardViewerActions: View {
    let cardId: String
    /// The card this one answers itself: never offered in the picker.
    var referenceCardId: String?
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.openRoute) private var openRoute
    @State private var shown = false
    /// Your card answering this one; nil while looking (`looked` false) or when there is none.
    @State private var mine: DraftService.Resonance?
    @State private var looked = false
    @State private var writingNote = false
    @State private var picking = false
    @State private var resonating = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Group {
                if let mine, mine.published {
                    // Done: it says so, and opens the card that answers.
                    OrganicButton(L10n.Card.resonated, icon: .check, variant: .outline) { openRoute(.card(mine.id)) }
                } else if let mine {
                    OrganicButton(L10n.Card.modify, icon: .pen, variant: .outline) { writer.edit(mine.id) }
                } else {
                    OrganicButton(L10n.Card.resonate, icon: .wave) {
                        // Signed out there is nothing to pick from: the writer, as before.
                        if session.drafts == nil { writer.open(.init(referenceCardId: cardId)) } else { picking = true }
                    }
                }
            }
            // Wait for the lookup, so a second resonance can't be started by accident.
            .opacity(looked ? 1 : 0.6)
            .allowsHitTesting(looked)
            HStack {
                // The web's secondaryOutline with its frame hidden: a link.
                Button { writingNote = true } label: {
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
        .organicModal(isPresented: $writingNote, seed: 17, maxWidth: 520, closeLabel: L10n.Card.Note.close) {
            NoteComposer(cardId: cardId) { writingNote = false } onUpgrade: { text in
                writingNote = false
                // The note's words become the resonance's story (the web drops them; the apps keep them).
                writer.open(.init(referenceCardId: cardId, story: text))
            }
        }
        .organicModal(isPresented: $picking, seed: 53, maxWidth: 480, closeLabel: L10n.Card.ResonatePicker.cancel,
                      dismissible: !resonating) {
            ResonatePickerContent(targetId: cardId, targetReferenceId: referenceCardId, busy: $resonating) {
                picking = false
                writer.open(.init(referenceCardId: cardId))
            } onResonated: { card in
                picking = false
                // This page lists it among the resonances now, the button says 已共振, the card box moves it.
                writer.noteChange(.init(cardId: card.id, referenceCardId: cardId))
            } onCancel: {
                picking = false
            }
        }
        .task(id: "\(cardId)#\(writer.changes)") {
            // Signed out: nothing to find. A failed lookup stays dimmed, as on the web —
            // better than risking a second resonance.
            guard let drafts = session.drafts else {
                mine = nil
                looked = true
                return
            }
            do {
                mine = try await drafts.myResonance(to: cardId)
                looked = true
            } catch {
                looked = false
            }
        }
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
