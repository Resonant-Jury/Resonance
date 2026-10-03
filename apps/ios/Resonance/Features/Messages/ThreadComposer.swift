import DesignSystem
import ResonanceKit
import SwiftUI

/// The message being written: what is attached (the note being answered, a card), the reply it
/// carries and the field with Send beside it. Sending never holds the composer — a message goes to
/// the outbox and the field is empty for the next one, with its keyboard still up. The twin of
/// Android's ThreadComposer.
struct ThreadComposer: View {
    @Bindable var model: ThreadModel
    var composing: FocusState<Bool>.Binding
    let onPickCard: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if model.noteRef != nil || model.pendingCard != nil {
                FlowRow(spacing: 8) {
                    if model.noteRef != nil {
                        AttachmentChip(icon: .note, title: L10n.Messages.quotedNote) { model.noteRef = nil }
                    }
                    if let card = model.pendingCard {
                        AttachmentChip(icon: .cards, title: card.title) { model.pendingCard = nil }
                    }
                }
                .padding(.top, 10)
                .padding(.horizontal, 2)
            }
            if let quote = model.replyingTo { ReplyBar(model: model, quote: quote) }
            // Send is a disc a little shorter than the field: it stays at the foot of the field as that grows.
            HStack(alignment: .bottom, spacing: 8) {
                Button(action: onPickCard) {
                    OrganicIcon(.cards, size: 18, color: Tokens.textMuted)
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(OrganicPressStyle())
                .accessibilityLabel(L10n.Messages.attachCard)
                .padding(.bottom, 5)
                TextField(text: $model.draft, prompt: fieldPrompt(L10n.Messages.placeholder), axis: .vertical) {
                    Text(L10n.Messages.threadWith(handle: model.displayHandle))
                }
                .lineLimit(1...5)
                .lineSpacing(15 * 0.6)
                .font(AppFonts.body(15))
                .foregroundStyle(Tokens.text)
                .focused(composing)
                .padding(.horizontal, Tokens.fieldPadX)
                .padding(.vertical, 12)
                .modifier(FieldSurface(seed: 17, focused: composing.wrappedValue))
                .onChange(of: model.draft) { _, new in
                    if new.utf16.count > ThreadModel.maxLength { model.draft = String(new.utf16.prefix(ThreadModel.maxLength)) ?? new }
                }
                OrganicSendButton(label: L10n.Messages.send, enabled: model.canSend) { model.send() }
                    .padding(.bottom, 2)
            }
            .padding(.top, 12)
            if let error = model.error {
                Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta).padding(.top, 6)
            }
        }
    }
}

/// A calm line at the thread's foot, centred and muted: in the composer's place where there is
/// nothing to write (a note waiting for its answer, no connection), or over it.
struct ThreadFootNote: View {
    let text: String
    var size: CGFloat = 13

    var body: some View {
        Text(text)
            .font(AppFonts.body(size)).foregroundStyle(Tokens.textMuted)
            .lineSpacing(size * 0.35)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
    }
}

/// Over the field while replying: a wavy terracotta rule, whom to and a line of what, and a ✕.
private struct ReplyBar: View {
    let model: ThreadModel
    let quote: ReplyQuote

    var body: some View {
        let who = quote.senderId == model.me ? L10n.Messages.replyingToSelf : L10n.Messages.replyingTo(handle: model.displayHandle)
        let what = quote.text.isEmpty ? L10n.Messages.replyCard : quote.text.replacingOccurrences(of: "\n", with: " ")
        HStack(spacing: 10) {
            ReplyRule().frame(height: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(who).font(AppFonts.body(12, weight: .semibold)).foregroundStyle(Tokens.text).lineLimit(1)
                Text(what).font(AppFonts.body(12.5)).foregroundStyle(Tokens.textMuted).lineLimit(1)
            }
            Spacer(minLength: 0)
            Button { model.cancelReply() } label: {
                OrganicIcon(.close, size: 15, color: Tokens.textMuted)
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .buttonStyle(OrganicPressStyle())
            .accessibilityLabel(L10n.Messages.replyCancel)
        }
        .frame(minHeight: 36)
        .padding(.top, 12)
        .padding(.leading, 4)
        .accessibilityElement(children: .contain)
    }
}

/// A pending attachment above the composer: its glyph, its name, and a ✕.
private struct AttachmentChip: View {
    let icon: IconName
    let title: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            OrganicIcon(icon, size: 14, color: Tokens.text)
            Text(title).font(AppFonts.body(12)).foregroundStyle(Tokens.text).lineLimit(1).frame(maxWidth: 180, alignment: .leading)
                .fixedSize(horizontal: true, vertical: false)
            Button(action: onRemove) {
                OrganicIcon(.close, size: 13, color: Tokens.textMuted).padding(2)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.Messages.removeCard)
        }
        .padding(.leading, 10).padding(.trailing, 8).padding(.vertical, 5)
        .background(Tokens.terracottaLight.opacity(0.4),
                    in: UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 14, bottomTrailingRadius: 12, topTrailingRadius: 14))
    }
}
