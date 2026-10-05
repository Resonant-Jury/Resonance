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
    /// Your card answering this one, as far as it is known (`.found(nil)`: none).
    @State private var lookup = ResonanceLookup()
    @State private var writingNote = false
    @State private var picking = false
    @State private var resonating = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Group {
                if case let .found(mine?) = lookup.state, mine.published {
                    // Done: it says so, and opens the card that answers.
                    OrganicButton(L10n.Card.resonated, icon: .check, variant: .outline) { openRoute(.card(mine.id)) }
                } else if case let .found(mine?) = lookup.state {
                    OrganicButton(L10n.Card.modify, icon: .pen, variant: .outline) { writer.edit(mine.id) }
                } else {
                    OrganicButton(L10n.Card.resonate, icon: .wave) {
                        // Signed out there is nothing to pick from: the writer, as before.
                        guard let drafts = session.drafts else { return writer.open(.init(referenceCardId: cardId)) }
                        if lookup.state == .failed {
                            // Not known whether this card is answered already: asked now, the picker once it isn't.
                            Task { if await lookup.askOnTap({ try await drafts.myResonance(to: cardId) }) { picking = true } }
                        } else {
                            picking = true
                        }
                    }
                    .working(lookup.asking)
                }
            }
            // Wait for the lookup, so a second resonance can't be started by accident (one that failed is a tap away).
            .opacity(lookup.state == .looking ? 0.6 : 1)
            .allowsHitTesting(lookup.state != .looking)
            if lookup.tapFailed {
                Text(L10n.Native.loadError).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                    .padding(.top, -6)
            }
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
            // Signed out: nothing to find. A failed lookup is tried again, then left to a tap — never
            // a button dimmed for good (nor one that could begin a second resonance unasked).
            guard let drafts = session.drafts else { return await lookup.look { nil } }
            await lookup.look { try await drafts.myResonance(to: cardId) }
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
