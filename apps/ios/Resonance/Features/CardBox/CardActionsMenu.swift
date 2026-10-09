import DesignSystem
import ResonanceKit
import SwiftUI

/// The owner's ⋯ on a card (CardActionsMenu.tsx): 編輯 / 轉為公開·私人 /
/// 取消共振 (a card that resonates with another) / 刪除, in the shared
/// OrganicMenu. Deleting, and taking a resonance back, ask first, in the web's
/// own small dialogs. Visibility, deleting and the resonance go through the
/// server (PATCH / DELETE /api/v1/cards/{id}, DELETE …/resonances/{id}), which
/// also refreshes the site's cached pages — never straight to Firestore, whose
/// rules refuse both on a published card. A change that didn't go through says
/// so, and the card stays where it was.
///
/// On a resonance each of them can end the connection with the original's
/// author: the change names the card it answered (its page reads again), and
/// the connection's screens hear of it from the live connections list.
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
    /// The visibility change didn't go through: a small dialog says so, with a retry.
    @State private var visibilityFailed = false
    /// The answered card's title, asked for when the page didn't have it.
    @State private var asked = AnsweredTitle()

    private var isPrivate: Bool { visibility == "private" }

    var body: some View {
        OrganicMenu(items: items, label: L10n.Me.Actions.menuLabel, seed: seed, hue: hue, trigger: trigger)
            .opacity(busy && !confirming ? 0.6 : 1)
            // Deleting can't be undone: the verb in red. A refusal is said in the dialog (offline, or refused: the
            // card stays, in the list too), which stays to try again.
            .organicConfirm(isPresented: $confirming, title: L10n.Me.Actions.deleteConfirmTitle,
                            message: L10n.Me.Actions.deleteConfirmBody, cancelLabel: L10n.Me.Actions.deleteCancel,
                            confirmLabel: L10n.Me.Actions.deleteConfirm, closeLabel: L10n.Me.Actions.deleteCancel, busy: busy,
                            error: failed ? L10n.Safety.actionError : nil, destructive: true, seed: seed + 5) {
                Task { await delete() }
            }
            // The card stays: nothing here can't be undone, so the verb is the plain solid fill.
            .organicConfirm(isPresented: $unresonating, title: unresonateTitle, message: L10n.Me.Actions.unresonateConfirmBody,
                            cancelLabel: L10n.Me.Actions.deleteCancel, confirmLabel: L10n.Me.Actions.unresonateConfirm,
                            closeLabel: L10n.Me.Actions.deleteCancel, busy: busy, error: failed ? L10n.Safety.actionError : nil,
                            titlePending: asked.looking, seed: seed + 9) {
                Task { await unresonate() }
            }
            // Turning public or private didn't go through: the card is as it was; say so, and offer it again.
            .organicConfirm(isPresented: $visibilityFailed, title: visibilityLabel, message: L10n.Safety.actionError,
                            cancelLabel: L10n.Safety.Report.close, confirmLabel: L10n.Native.retry,
                            closeLabel: L10n.Safety.Report.close, busy: busy, seed: seed + 11) {
                Task { await toggleVisibility() }
            }
            .task(id: unresonating) {
                guard unresonating, asked.looking, let answering else { return }
                await AnsweredTitle.lookUp {
                    try await session.reading.cards(keys: [answering]).first { $0.id == answering }?.title
                } then: { asked.found($0) }
            }
    }

    /// 「不再與〈title〉共振？」 — or the plain words when the title can't be read.
    private var unresonateTitle: String { asked.heading }

    private var items: [OrganicMenuItem] {
        [
            OrganicMenuItem(id: "edit", title: L10n.Me.Actions.edit, icon: .pen) { writer.edit(cardId, showsCard: showsCardAfterEdit) },
            OrganicMenuItem(id: "visibility", title: visibilityLabel, icon: isPrivate ? .globe : .lock) { Task { await toggleVisibility() } },
        ] + (answering == nil ? [] : [
            OrganicMenuItem(id: "unresonate", title: L10n.Me.Actions.unresonate, icon: .wave) {
                failed = false
                // The title before the question shows, when the page or the session has it; else it is asked for,
                // the heading held back meanwhile — never words that change under the reader.
                asked.open(page: answeringTitle, kept: answering.flatMap { session.cardPreviews.card(for: $0)?.title })
                unresonating = true
            },
        ]) + [
            OrganicMenuItem(id: "delete", title: L10n.Me.Actions.delete, icon: .trash, danger: true) {
                failed = false
                confirming = true
            },
        ]
    }

    private var visibilityLabel: String { isPrivate ? L10n.Me.Actions.makePublic : L10n.Me.Actions.makePrivate }

    /// What changed: this card, and on a resonance the card it answers (its page lists it).
    private var change: WriteLauncher.Change { .init(cardId: cardId, referenceCardId: answering) }

    private func toggleVisibility() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        guard let card = try? await session.writing.updateCard(cardId, visibility: isPrivate ? ._public : ._private) else {
            visibilityFailed = true
            return
        }
        visibilityFailed = false
        session.cardPreviews.remember(card)
        writer.noteChange(change)
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
        writer.noteChange(change)
        onChanged()
    }

    private func delete() async {
        guard !busy else { return }
        busy = true
        failed = false
        defer { busy = false }
        guard (try? await session.writing.deleteCard(cardId)) != nil else {
            failed = true
            return
        }
        session.cardPreviews.forget(cardId)
        confirming = false
        writer.noteChange(change)
        onDeleted()
    }
}

/// The title of the card a resonance answers, for the question that takes the resonance back
/// (「不再與〈title〉共振？」), as far as it is known — known before the question shows when the page
/// or the session has it, else looked for while its heading is held back (`looking`), as the web
/// and Android hold it. A title that can't be read leaves the plain 「取消共振」.
struct AnsweredTitle: Equatable {
    private(set) var title: String?
    /// Being looked for: the question's heading keeps its line, unwritten.
    private(set) var looking = false

    /// The question opens: the page's title, else one already known or kept; none, it is looked for.
    mutating func open(page: String?, kept: String?) {
        title = page ?? title ?? kept
        looking = title == nil
    }

    /// The lookup's answer (nil: it found nothing, or failed).
    mutating func found(_ found: String?) {
        if title == nil { title = found }
        looking = false
    }

    var heading: String {
        title.map { L10n.Me.Actions.unresonateConfirmTitle(title: $0) } ?? L10n.Me.Actions.unresonate
    }

    /// Reads the answered card's title (`read`) and hands it over (`found`) — unless the question was
    /// closed meanwhile: the lookup left behind (its read refused as cancelled, which `try?` makes a
    /// "none") must not settle the question opened again since, whose heading would then show the
    /// plain words and change to the title under the reader.
    static func lookUp(_ read: () async throws -> String?, then found: (String?) -> Void) async {
        let title = try? await read()
        guard !Task.isCancelled else { return }
        found(title)
    }
}
