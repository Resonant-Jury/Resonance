import DesignSystem
import ResonanceKit
import SwiftUI

/// NoteComposer (the plain variant in its modal): a little note to the card's
/// author — the only reader it will ever have. Four lines to write in, the
/// privacy hint for the first few times, the count, and past 200 characters
/// an offer to make it a resonance card instead. Sending replaces the form
/// with a quiet confirmation.
struct NoteComposer: View {
    let cardId: String
    let onClose: () -> Void
    /// 紙條 → 共振: the text becomes the story of a resonance to this card.
    let onUpgrade: (String) -> Void
    @Environment(SessionStore.self) private var session
    @State private var text = ""
    @State private var pending = false
    @State private var sent = false
    @State private var error: String?
    @State private var showsHint = false
    /// The note on its way, under one client id until it is left: Send pressed again on the same
    /// words after a failure is a retry the server can recognise, never a second note.
    @State private var attempt = NoteAttempt()
    /// The words the server refused (three notes already wait, a block): the same words sent again
    /// would only be refused again, so Send waits for an edit (and the refusal stays said until then).
    @State private var refused: String?
    @FocusState private var focused: Bool

    static let maxLength = 2000
    static let upgradeThreshold = 200

    /// The web counts the trimmed text in UTF-16 units.
    private var count: Int { words.utf16.count }
    private var words: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var valid: Bool { count > 0 && count <= Self.maxLength && session.me != nil && words != refused }

    var body: some View {
        if sent {
            VStack(spacing: 14) {
                HStack(spacing: 10) {
                    OrganicIcon(.note, size: 18, color: Tokens.text)
                    Text(L10n.Card.Note.sent).font(AppFonts.body(14)).foregroundStyle(Tokens.text)
                    Spacer(minLength: 0)
                }
                // Said and done: the one way out, under the confirmation (a modal keeps no ✕ in its corner).
                ModalCloseButton(L10n.Card.Note.close, action: onClose)
            }
        } else {
            form
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            FieldLabel(text: L10n.Card.Note.label).padding(.bottom, 10)
            TextField(text: $text, prompt: fieldPrompt(L10n.Card.Note.placeholder), axis: .vertical) { Text(L10n.Card.Note.label) }
                .lineLimit(4...8)
                .lineSpacing(15 * 0.6)
                .font(AppFonts.body(15))
                .foregroundStyle(Tokens.text)
                .focused($focused)
                .padding(.horizontal, Tokens.fieldPadX)
                .padding(.vertical, Tokens.fieldPadY)
                .frame(minHeight: 96, alignment: .top)
                .modifier(FieldSurface(seed: 17, focused: focused))
                .onChange(of: text) { _, new in
                    if new.utf16.count > Self.maxLength { text = String(new.utf16.prefix(Self.maxLength)) ?? new }
                    // Other words: another note, which the server may take — the refusal is no longer theirs.
                    if let refused, words != refused {
                        self.refused = nil
                        error = nil
                    }
                }
            HStack(alignment: .top, spacing: 12) {
                if showsHint {
                    Text(L10n.Card.Note.hint).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).lineSpacing(12 * 0.5)
                }
                Spacer(minLength: 0)
                Text(verbatim: "\(count) / \(Self.maxLength)")
                    .font(AppFonts.body(11)).monospacedDigit()
                    .foregroundStyle(count > Self.maxLength ? Tokens.terracotta : Tokens.textMuted)
            }
            .padding(.top, 6)
            if count > Self.upgradeThreshold {
                Button { onUpgrade(text) } label: {
                    Text(L10n.Card.Note.upgrade).font(AppFonts.body(13)).foregroundStyle(Tokens.terracotta).underline()
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
                .padding(.bottom, 10)
            }
            if let error {
                Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta).padding(.bottom, 10)
            }
            HStack(spacing: 10) {
                Spacer(minLength: 0)
                OrganicButton(L10n.Card.Note.cancel, variant: .text, size: .sm, action: onClose)
                // While the server answers, the pen inks where the word was (the resonate picker's way): one size throughout.
                OrganicButton(L10n.Card.Note.send, variant: .solid, size: .sm) { Task { await send() } }
                    .working(pending)
                    .opacity(valid || pending ? 1 : 0.5)
                    .allowsHitTesting(valid && !pending)
            }
            .padding(.top, 18)
        }
        .task { showsHint = await session.hints?.claim("note-privacy") ?? false }
    }

    private func send() async {
        guard valid, !pending else { return }
        pending = true
        error = nil
        defer { pending = false }
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await attempt.send(cardId: cardId, text: words) { try await session.messaging.sendNote(cardId: cardId, text: words, clientId: $0) }
            sent = true
            PushCenter.shared.reachedOut()
        } catch {
            let failure = NoteFailure(error)
            self.error = failure.message
            if failure.refused { refused = words }
        }
    }
}

/// A note that didn't go, as the composer says it: in the app's words, never the server's (which
/// are English, and for a block would say more than the web's composer does) — three notes left
/// unanswered wait for the author's reply, a card gone (deleted, or hidden from the writer since,
/// its notes with it) can't be found, anything else is the send error (as the web's NoteComposer
/// says them). `refused`: the server answered no to these words (three notes waiting, a block, no
/// pen name, the card gone), which sending them again would only hear again; the rest (offline,
/// the server's trouble) is a retry.
struct NoteFailure: Equatable {
    let message: String
    let refused: Bool

    init(_ error: Error) {
        let failure = error as? APIFailure
        switch failure?.status {
        case 409: message = L10n.Card.Note.waitForReply
        case 404: message = L10n.Card.NotFound.title
        default: message = L10n.Messages.sendError
        }
        refused = [403, 404, 409].contains(failure?.status ?? 0)
    }
}
