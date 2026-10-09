import DesignSystem
import ResonanceKit
import SwiftUI

/// The reader's actions under a story (ReadAfterArea → CardViewerActions): one segmented bar,
/// spanning the column in one row — 共振 (the verb, solid), opening the picker: write a new card in
/// answer, or pick one already written — or, once you have answered this card, 已共振 opening your
/// published resonance (修改 while it is a draft, back to the writer); then the note (寄小紙條, its
/// full words its name for VoiceOver) and the bookmark (tonal), which drops its words for its glyph
/// when the row has no room for them. Fades in once scrolled to.
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
    @State private var bookmark = BookmarkState()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SegmentedActionBar([resonateSegment, noteSegment, bookmarkSegment])
                // Wait for the lookup, so a second resonance can't be started by accident (one that failed is a tap away).
                .opacity(lookup.state == .looking ? 0.6 : 1)
                .allowsHitTesting(lookup.state != .looking)
                .sensoryFeedback(.selection, trigger: bookmark.active)
            if lookup.tapFailed {
                Text(L10n.Native.loadError).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
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
        .task(id: cardId) {
            bookmark.found((try? await session.bookmarks?.isBookmarked(cardId)) ?? false)
        }
        .onScrollVisibilityChange(threshold: 0.08) { visible in
            guard visible, !shown else { return }
            withAnimation(.easeOut(duration: 0.6)) { shown = true }
        }
    }

    /// 共振 — or what answers this card already: 已共振 opens it, 修改 takes its draft back to the writer.
    private var resonateSegment: SegmentSpec {
        if case let .found(mine?) = lookup.state, mine.published {
            return .verb(id: "resonate", icon: .check, label: L10n.Card.resonated) { openRoute(.card(mine.id)) }
        }
        if case let .found(mine?) = lookup.state {
            return .verb(id: "resonate", icon: .pen, label: L10n.Card.modify) { writer.edit(mine.id) }
        }
        return .verb(id: "resonate", icon: .wave, label: L10n.Card.resonate, working: lookup.asking) {
            // Signed out there is nothing to pick from: the writer, as before.
            guard let drafts = session.drafts else { return writer.open(.init(referenceCardId: cardId)) }
            if lookup.state == .failed {
                // Not known whether this card is answered already: asked now, the picker once it isn't.
                Task { if await lookup.askOnTap({ try await drafts.myResonance(to: cardId) }) { picking = true } }
            } else {
                picking = true
            }
        }
    }

    private var noteSegment: SegmentSpec {
        SegmentSpec(id: "note", icon: .note, label: L10n.Card.Note.entryShort, accessibilityLabel: L10n.Card.Note.entry) {
            writingNote = true
        }
    }

    /// Saved or not, optimistic, then reconciled with what the write returns.
    private var bookmarkSegment: SegmentSpec {
        SegmentSpec(id: "bookmark", icon: .bookmark, iconFilled: bookmark.active,
                    label: bookmark.active ? L10n.Card.Bookmark.remove : L10n.Card.Bookmark.add, collapsible: true) {
            guard let bookmarks = session.bookmarks else { return }
            let saving = bookmark.flip()
            Task { bookmark.settled(saving: saving, result: try? await bookmarks.toggle(cardId)) }
        }
    }
}

/// Whether the reader keeps this card: flipped at once on a tap, then set to what the write
/// returns (back as it was when it failed).
struct BookmarkState: Equatable {
    private(set) var active = false

    mutating func found(_ saved: Bool) { active = saved }

    /// The tap: shown flipped at once. Returns whether it is saving.
    mutating func flip() -> Bool {
        active.toggle()
        return active
    }

    /// The write's answer (`nil`: it failed, so it goes back).
    mutating func settled(saving: Bool, result: Bool?) {
        active = result ?? !saving
    }
}
