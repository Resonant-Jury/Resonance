import DesignSystem
import ResonanceKit
import SwiftUI

/// Report (web: ReportModal) — the inside of its dialog: a reason, optional
/// details, optionally block too; then a thank-you in place of the form.
struct ReportForm: View {
    let target: SafetyService.Target
    /// The person's pen name, or nil for an anonymous card's author.
    let handle: String?
    /// Offer "also block" (not when they're already blocked, nor for an anonymous card's author).
    var offerBlock = true
    @Binding var sending: Bool
    var onClose: () -> Void
    var onBlocked: () -> Void = {}
    @Environment(SessionStore.self) private var session
    // ReportModal opens on the first reason, as the web does.
    @State private var reason: SafetyService.Reason? = .spam
    @State private var detail = ""
    @State private var alsoBlock = false
    @State private var done = false
    @State private var blocked = false
    @State private var error: String?

    private var name: String { handle ?? L10n.Safety.anonymousAuthor }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if done {
                ModalTitle(L10n.Safety.Report.doneTitle)
                ModalBody(L10n.Safety.Report.doneBody)
                if blocked { ModalBody(L10n.Safety.Report.doneBlocked(handle: name)) }
                ModalActions { OrganicButton(L10n.Safety.Report.close, variant: .solid, size: .sm, action: onClose) }
            } else {
                ModalTitle(title)
                ModalBody(L10n.Safety.Report.intro)
                VStack(alignment: .leading, spacing: 10) {
                    Text(L10n.Safety.Report.reason.uppercased())
                        .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
                        .tracking(Tokens.labelSize * 0.06)
                        .foregroundStyle(Tokens.textMuted)
                    // Radios stand in for the web's organic select (see OrganicRadio).
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(Array(SafetyService.Reason.allCases.enumerated()), id: \.element) { i, r in
                            Button { reason = r } label: {
                                HStack(spacing: 12) {
                                    OrganicRadio(isOn: reason == r, seed: Double(21 + i * 7))
                                    Text(Self.label(r)).font(AppFonts.body(15)).foregroundStyle(Tokens.text)
                                    Spacer(minLength: 0)
                                }
                                .frame(minHeight: 40)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(reason == r ? .isSelected : [])
                        }
                    }
                }
                OrganicTextArea(L10n.Safety.Report.detail, text: $detail, placeholder: L10n.Safety.Report.detailPlaceholder,
                                maxLength: SafetyService.detailMax, seed: 89)
                if offerBlock {
                    // The web's blockRow: the label, then the switch at the far end.
                    HStack(spacing: 16) {
                        Text(L10n.Safety.Report.alsoBlock(handle: name)).font(AppFonts.body(14.5)).foregroundStyle(Tokens.text)
                            .accessibilityHidden(true)
                        Spacer(minLength: 0)
                        OrganicToggle(isOn: $alsoBlock, label: L10n.Safety.Report.alsoBlock(handle: name), seed: 91)
                    }
                }
                if let error { ModalError(error) }
                ModalActions {
                    OrganicButton(L10n.Safety.cancel, variant: .text, size: .sm, action: onClose)
                    OrganicButton(sending ? "…" : L10n.Safety.Report.submit, variant: .solid, size: .sm) { Task { await submit() } }
                        .disabled(reason == nil)
                }
                .disabled(sending)
                .padding(.top, 4)
            }
        }
    }

    private var title: String {
        switch target {
        case .card: L10n.Safety.Report.titleCard
        case .user: L10n.Safety.Report.titleUser(handle: name)
        case .message: L10n.Safety.Report.titleMessage(handle: name)
        }
    }

    static func label(_ r: SafetyService.Reason) -> String {
        switch r {
        case .spam: L10n.Safety.Report.Reasons.spam
        case .harassment: L10n.Safety.Report.Reasons.harassment
        case .hate: L10n.Safety.Report.Reasons.hate
        case .sexual: L10n.Safety.Report.Reasons.sexual
        case .selfHarm: L10n.Safety.Report.Reasons.self_harm
        case .violence: L10n.Safety.Report.Reasons.violence
        case .other: L10n.Safety.Report.Reasons.other
        }
    }

    private func submit() async {
        guard let reason, let safety = session.safety, !sending else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            try await safety.report(target, reason: reason, detail: detail)
            if offerBlock && alsoBlock, let other = target.userId {
                try await safety.block(other)
                blocked = true
                onBlocked()
            }
            done = true
        } catch {
            self.error = L10n.Safety.actionError
        }
    }
}

/// The "⋯" safety menu for someone else's card or page (the web's
/// CardSafetyMenu / ProfileSafetyMenu): report, block/unblock, each through
/// the web's dialogs. An anonymous card gets Report alone: the app doesn't
/// know its author, so there is no one to block.
struct SafetyMenu: View {
    let target: SafetyService.Target
    let handle: String?
    var isBlocked = false
    var seed: Double = 7
    var triggerSize: CGFloat = 38
    /// Bare in a bar (the card page, a profile), a chip over content.
    var trigger: MenuTrigger = .bare
    var onChange: () -> Void = {}
    @Environment(SessionStore.self) private var session
    @State private var reporting = false
    @State private var sendingReport = false
    @State private var confirmingBlock = false
    @State private var busy = false
    @State private var blockError: String?

    private var name: String { handle ?? L10n.Safety.anonymousAuthor }

    var body: some View {
        OrganicMenu(items: items, label: L10n.Safety.menuLabel, seed: seed, triggerSize: triggerSize, trigger: trigger)
            .organicModal(isPresented: $reporting, seed: 83, maxWidth: 460, closeLabel: L10n.Safety.Report.close,
                          dismissible: !sendingReport) {
                ReportForm(target: target, handle: handle, offerBlock: !isBlocked && target.userId != nil, sending: $sendingReport,
                           onClose: { reporting = false }, onBlocked: onChange)
            }
            .organicConfirm(isPresented: $confirmingBlock, title: L10n.Safety.blockTitle(handle: name),
                            message: L10n.Safety.blockBody, cancelLabel: L10n.Safety.cancel,
                            confirmLabel: L10n.Safety.blockConfirm, closeLabel: L10n.Safety.cancel,
                            busy: busy, error: blockError, seed: 71) {
                Task { await block() }
            }
    }

    private var items: [OrganicMenuItem] {
        let report = OrganicMenuItem(id: "report", title: reportTitle, icon: .flag) { reporting = true }
        guard target.userId != nil else { return [report] }
        let block = isBlocked
            ? OrganicMenuItem(id: "unblock", title: L10n.Safety.unblock, icon: .ban) { Task { await unblock() } }
            : OrganicMenuItem(id: "block", title: L10n.Safety.block, icon: .ban, danger: true) {
                blockError = nil
                confirmingBlock = true
            }
        return [report, block]
    }

    private var reportTitle: String {
        switch target {
        case .card: L10n.Safety.reportCard
        case .user: L10n.Safety.reportUser
        case .message: L10n.Safety.reportMessage
        }
    }

    private func block() async {
        guard !busy, let other = target.userId else { return }
        busy = true
        defer { busy = false }
        do {
            try await session.safety?.block(other)
            confirmingBlock = false
            onChange()
        } catch {
            blockError = L10n.Safety.actionError
        }
    }

    private func unblock() async {
        guard let other = target.userId else { return }
        try? await session.safety?.unblock(other)
        onChange()
    }
}

/// The undo banner while a deletion is scheduled (web: AccountDeletionBanner):
/// card paper in a red hand-drawn rim, the date, and a small filled Cancel —
/// stacked and centred, as the web lays it out on phones.
struct AccountDeletionBanner: View {
    let date: Date
    @Environment(SessionStore.self) private var session
    @State private var busy = false
    @State private var failed = false

    var body: some View {
        VStack(spacing: 14) {
            let when = date.formatted(Date.FormatStyle(date: .long, time: .omitted, locale: Strings.shared.locale))
            let error = failed ? Text(verbatim: " " + L10n.AccountDeletion.error).foregroundStyle(Tokens.danger) : Text(verbatim: "")
            // The error follows the sentence inline, in the danger ink.
            Text("\(Text(verbatim: L10n.AccountDeletion.banner(date: when)))\(error)")
                .font(AppFonts.body(14.5))
                .foregroundStyle(Tokens.text)
                .lineSpacing(14.5 * 0.5)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            OrganicButton(busy ? "…" : L10n.AccountDeletion.cancel, variant: .tonal, size: .sm) { Task { await cancel() } }
                .disabled(busy)
        }
        .frame(maxWidth: .infinity)
        .padding(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 14))
        .background {
            let shape = WobRectShape(radius: 18, seed: 131)
            shape.fill(Tokens.cardBg)
            shape.stroke(Tokens.danger, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
        }
        .frame(maxWidth: 560)
        .padding(.horizontal, 20)
        .accessibilityElement(children: .contain)
    }

    private func cancel() async {
        guard !busy else { return }
        busy = true
        failed = false
        defer { busy = false }
        do { try await session.cancelDeletion() } catch { failed = true }
    }
}
