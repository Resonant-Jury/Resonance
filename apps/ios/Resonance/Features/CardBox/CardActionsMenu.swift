import DesignSystem
import ResonanceKit
import SwiftUI

/// The owner's ⋯ on a card (CardActionsMenu.tsx): 編輯 / 轉為公開·私人 /
/// 取消共振 (a card that resonates with another) / 刪除, in the shared
/// OrganicMenu. Deleting, and taking a resonance back, ask first, in the web's
/// own small dialogs. Visibility, deleting and the resonance go through the
/// server (PATCH / DELETE /api/v1/cards/{id}, DELETE …/resonances/{id}), which
/// also refreshes the site's cached pages.
struct CardActionsMenu: View {
    let cardId: String
    let visibility: String
    var seed: Double = 7
    var hue: Double?
    /// The card this one resonates with, if any — and its title, when the page has it (else it is
    /// asked for when the question is).
    var answering: String?
    var answeringTitle: String?
    /// Whether the card opens once edited (false on the card's own page, which is already underneath).
    var showsCardAfterEdit = true
    var onChanged: () -> Void = {}
    var onDeleted: () -> Void = {}
    /// A chip over a card's cover (the card box), bare in the card page's bar.
    var trigger: MenuTrigger = .chip
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @State private var confirming = false
    @State private var unresonating = false
    @State private var busy = false
    @State private var failed = false
    /// The answered card's title, asked for when the page didn't have it.
    @State private var askedTitle: String?

    private var isPrivate: Bool { visibility == "private" }

    var body: some View {
        OrganicMenu(items: items, label: L10n.Me.Actions.menuLabel, seed: seed, hue: hue, trigger: trigger)
            .opacity(busy && !confirming ? 0.6 : 1)
            .organicModal(isPresented: $confirming, seed: seed + 5, maxWidth: 400, closeLabel: L10n.Me.Actions.deleteCancel,
                          dismissible: !busy) {
                confirm
            }
            // The card stays: nothing here can't be undone, so the verb is the plain solid fill.
            .organicConfirm(isPresented: $unresonating, title: unresonateTitle, message: L10n.Me.Actions.unresonateConfirmBody,
                            cancelLabel: L10n.Me.Actions.deleteCancel, confirmLabel: L10n.Me.Actions.unresonateConfirm,
                            closeLabel: L10n.Me.Actions.deleteCancel, busy: busy, error: failed ? L10n.Safety.actionError : nil,
                            seed: seed + 9) {
                Task { await unresonate() }
            }
            .task(id: unresonating) {
                guard unresonating, let answering, answeringTitle == nil, askedTitle == nil else { return }
                if let kept = session.cardPreviews.card(for: answering) { return askedTitle = kept.title }
                let cards = try? await session.reading.cards(keys: [answering])
                askedTitle = cards?.first { $0.id == answering }?.title
            }
    }

    /// 「不再與〈title〉共振？」 — or the plain words while the title isn't known (or can't be read).
    private var unresonateTitle: String {
        (answeringTitle ?? askedTitle).map { L10n.Me.Actions.unresonateConfirmTitle(title: $0) } ?? L10n.Me.Actions.unresonate
    }

    private var items: [OrganicMenuItem] {
        [
            OrganicMenuItem(id: "edit", title: L10n.Me.Actions.edit, icon: .pen) { writer.edit(cardId, showsCard: showsCardAfterEdit) },
            OrganicMenuItem(id: "visibility", title: isPrivate ? L10n.Me.Actions.makePublic : L10n.Me.Actions.makePrivate,
                            icon: isPrivate ? .globe : .lock) { Task { await toggleVisibility() } },
        ] + (answering == nil ? [] : [
            OrganicMenuItem(id: "unresonate", title: L10n.Me.Actions.unresonate, icon: .wave) {
                failed = false
                unresonating = true
            },
        ]) + [
            OrganicMenuItem(id: "delete", title: L10n.Me.Actions.delete, icon: .trash, danger: true) { confirming = true },
        ]
    }

    /// The delete confirmation: 20pt heading, the muted note, then Keep it / Delete card on the right.
    private var confirm: some View {
        VStack(alignment: .leading, spacing: 0) {
            CSSText(L10n.Me.Actions.deleteConfirmTitle, font: AppFonts.scaledUIFont(.heading, size: 20, weight: .bold), lineHeight: 1.3)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 10)
            CSSText(L10n.Me.Actions.deleteConfirmBody, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.6,
                    color: UIColor(Tokens.textMuted))
                .padding(.bottom, 24)
            HStack(spacing: 10) {
                Spacer(minLength: 0)
                // The modal is the frame: "keep it" is plain text, and deleting — which can't be undone — is red.
                OrganicButton(L10n.Me.Actions.deleteCancel, variant: .text, size: .sm) { confirming = false }
                OrganicButton(busy ? "…" : L10n.Me.Actions.deleteConfirm, variant: .danger, size: .sm) { Task { await delete() } }
            }
            .opacity(busy ? 0.6 : 1)
            .allowsHitTesting(!busy)
        }
    }

    private func toggleVisibility() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        guard let card = try? await session.writing.updateCard(cardId, visibility: isPrivate ? ._public : ._private) else { return }
        session.cardPreviews.remember(card)
        writer.noteChange(.init(cardId: cardId))
        onChanged()
    }

    /// The card stays, answering nothing; the server lets go of its link to the card it answered.
    private func unresonate() async {
        guard let answering, !busy else { return }
        busy = true
        failed = false
        defer { busy = false }
        do {
            try await session.writing.unresonate(from: answering, cardId: cardId)
        } catch {
            failed = true
            return
        }
        unresonating = false
        // This card's page, the page of the card it answered, and the card box's shelves read again.
        writer.noteChange(.init(cardId: cardId, referenceCardId: answering))
        onChanged()
    }

    private func delete() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        guard (try? await session.writing.deleteCard(cardId)) != nil else { return }
        session.cardPreviews.forget(cardId)
        confirming = false
        writer.noteChange(.init(cardId: cardId))
        onDeleted()
    }
}
