import DesignSystem
import ResonanceKit
import SwiftUI

/// The owner's ⋯ on a card (CardActionsMenu.tsx): 編輯 / 轉為公開·私人 / 刪除,
/// in the shared OrganicMenu. Deleting asks first, in the web's own small
/// dialog. Changes are the author's own writes (as on the web), then the
/// site's cached card page is refreshed.
struct CardActionsMenu: View {
    let cardId: String
    let visibility: String
    /// Where its page lives (slug, or id) — the cache entry to refresh.
    let routeKey: String
    var seed: Double = 7
    var hue: Double?
    /// Whether the card opens once edited (false on the card's own page, which is already underneath).
    var showsCardAfterEdit = true
    var onChanged: () -> Void = {}
    var onDeleted: () -> Void = {}
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @State private var confirming = false
    @State private var busy = false

    private var isPrivate: Bool { visibility == "private" }

    var body: some View {
        OrganicMenu(items: items, label: L10n.Me.Actions.menuLabel, seed: seed, hue: hue)
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
                OrganicButton(L10n.Me.Actions.deleteCancel, variant: .ghost, size: .sm) { confirming = false }
                OrganicButton(busy ? "…" : L10n.Me.Actions.deleteConfirm, size: .sm) { Task { await delete() } }
            }
            .opacity(busy ? 0.6 : 1)
            .allowsHitTesting(!busy)
        }
    }

    private func toggleVisibility() async {
        guard !busy, let drafts = session.drafts else { return }
        busy = true
        defer { busy = false }
        guard (try? await drafts.setVisibility(cardId, isPrivate ? "public" : "private")) != nil else { return }
        // Visibility decides whether the share metadata carries real content.
        Task { await session.writing.revalidate(["/card/\(routeKey)"]) }
        writer.noteChange()
        onChanged()
    }

    private func delete() async {
        guard !busy, let drafts = session.drafts else { return }
        busy = true
        defer { busy = false }
        guard (try? await drafts.delete(cardId)) != nil else { return }
        // The cached page would keep serving the deleted card's metadata.
        Task { await session.writing.revalidate(["/card/\(routeKey)"]) }
        confirming = false
        writer.noteChange()
        onDeleted()
    }
}
