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
    @FocusState private var focused: Bool

    static let maxLength = 2000
    static let upgradeThreshold = 200

    /// The web counts the trimmed text in UTF-16 units.
    private var count: Int { text.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count }
    private var valid: Bool { count > 0 && count <= Self.maxLength && session.me != nil }

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
                OrganicButton(pending ? "…" : L10n.Card.Note.send, variant: .solid, size: .sm) { Task { await send() } }
                    .opacity(valid && !pending ? 1 : 0.5)
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
        do {
            _ = try await session.messaging.sendNote(cardId: cardId, text: text.trimmingCharacters(in: .whitespacesAndNewlines))
            sent = true
            PushCenter.shared.reachedOut()
        } catch let failure as APIFailure {
            error = failure.status == 403 ? failure.message : L10n.Messages.sendError
        } catch {
            self.error = L10n.Messages.sendError
        }
    }
}
