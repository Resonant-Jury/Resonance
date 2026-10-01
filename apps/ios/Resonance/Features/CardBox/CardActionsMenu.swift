import DesignSystem
import ResonanceKit
import SwiftUI

/// The owner's ⋯ on a card (CardActionsMenu.tsx): 編輯 / 轉為公開·私人 / 刪除,
/// in the shared OrganicMenu. Deleting asks first, in the web's own small
/// dialog. Visibility and deleting go through the server (PATCH / DELETE
/// /api/v1/cards/{id}), which also refreshes the site's cached pages.
struct CardActionsMenu: View {
    let cardId: String
    let visibility: String
    var seed: Double = 7
    var hue: Double?
    /// Whether the card opens once edited (false on the card's own page, which is already underneath).
    var showsCardAfterEdit = true
    var onChanged: () -> Void = {}
    var onDeleted: () -> Void = {}
    /// A chip over a card's cover (the card box), bare in the card page's bar.
    var trigger: MenuTrigger = .chip
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @State private var confirming = false
    @State private var busy = false

    private var isPrivate: Bool { visibility == "private" }

    var body: some View {
        OrganicMenu(items: items, label: L10n.Me.Actions.menuLabel, seed: seed, hue: hue, trigger: trigger)
            .opacity(busy && !confirming ? 0.6 : 1)
            .organicModal(isPresented: $confirming, seed: seed + 5, maxWidth: 400, closeLabel: L10n.Me.Actions.deleteCancel,
                          dismissible: !busy) {
                confirm
            }
    }

    private var items: [OrganicMenuItem] {
        [
            OrganicMenuItem(id: "edit", title: L10n.Me.Actions.edit, icon: .pen) { writer.edit(cardId, showsCard: showsCardAfterEdit) },
            OrganicMenuItem(id: "visibility", title: isPrivate ? L10n.Me.Actions.makePublic : L10n.Me.Actions.makePrivate,
                            icon: isPrivate ? .globe : .lock) { Task { await toggleVisibility() } },
            OrganicMenuItem(id: "delete", title: L10n.Me.Actions.delete, icon: .trash, danger: true) { confirming = true },
        ]
    }

    /// The delete confirmation: 20pt heading, the muted note, then Keep it / Delete card on the right.
    private var confirm: some View {
        VStack(alignment: .leading, spacing: 0) {
            CSSText(L10n.Me.Actions.deleteConfirmTitle, font: AppFonts.uiFont(.heading, size: 20, weight: .bold), lineHeight: 1.3)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 10)
            CSSText(L10n.Me.Actions.deleteConfirmBody, font: AppFonts.uiFont(.body, size: 14), lineHeight: 1.6,
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
        writer.noteChange()
        onChanged()
    }

    private func delete() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        guard (try? await session.writing.deleteCard(cardId)) != nil else { return }
        session.cardPreviews.forget(cardId)
        confirming = false
        writer.noteChange()
        onDeleted()
    }
}
