import DesignSystem
import ResonanceKit
import SwiftUI

/// Report (web: ReportModal): a reason, optional details, optionally block too.
struct ReportSheet: View {
    let target: SafetyService.Target
    /// The person's pen name, or nil for an anonymous card's author.
    let handle: String?
    var onBlocked: () -> Void = {}
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var reason: SafetyService.Reason?
    @State private var detail = ""
    @State private var alsoBlock = false
    @State private var sending = false
    @State private var done = false
    @State private var error: String?

    private var name: String { handle ?? L10n.Safety.anonymousAuthor }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if done {
                    Text(L10n.Safety.Report.doneTitle).font(AppFonts.heading(24)).foregroundStyle(Tokens.text)
                    Text(L10n.Safety.Report.doneBody).font(AppFonts.body(15)).foregroundStyle(Tokens.textMuted)
                    if alsoBlock { Text(L10n.Safety.Report.doneBlocked(handle: name)).font(AppFonts.body(15)).foregroundStyle(Tokens.text) }
                    OrganicButton(L10n.Safety.Report.close) { dismiss() }
                } else {
                    Text(title).font(AppFonts.heading(24)).foregroundStyle(Tokens.text)
                    Text(L10n.Safety.Report.intro).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                    Text(L10n.Safety.Report.reason.uppercased())
                        .font(AppFonts.body(Tokens.labelSize, weight: .semibold)).foregroundStyle(Tokens.textMuted)
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
                    OrganicTextField(L10n.Safety.Report.detail, text: $detail, placeholder: L10n.Safety.Report.detailPlaceholder)
                    // The web's blockRow: the label, then the switch at the far end.
                    HStack(spacing: 16) {
                        Text(L10n.Safety.Report.alsoBlock(handle: name)).font(AppFonts.body(14.5)).foregroundStyle(Tokens.text)
                            .accessibilityHidden(true)
                        Spacer(minLength: 0)
                        OrganicToggle(isOn: $alsoBlock, label: L10n.Safety.Report.alsoBlock(handle: name), seed: 91)
                    }
                    .padding(.bottom, 8)
                    OrganicButton(L10n.Safety.Report.submit) { Task { await submit() } }
                        .disabled(reason == nil || sending)
                    if let error { Text(error).font(AppFonts.body(13)).foregroundStyle(Tokens.terracotta) }
                }
            }
            .padding(24)
        }
        .background(Tokens.cream)
        .presentationDetents([.large])
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
        guard let reason, let safety = session.safety else { return }
        sending = true
        defer { sending = false }
        do {
            try await safety.report(target, reason: reason, detail: detail)
            if alsoBlock {
                try await safety.block(target.userId)
                onBlocked()
            }
            done = true
        } catch {
            self.error = L10n.Safety.actionError
        }
    }
}

/// The "⋯" safety menu for someone else's card or page: report, block/unblock.
struct SafetyMenu: View {
    let target: SafetyService.Target
    let handle: String?
    var isBlocked = false
    var onChange: () -> Void = {}
    @Environment(SessionStore.self) private var session
    @State private var reporting = false
    @State private var confirmingBlock = false
    @State private var failed = false

    private var name: String { handle ?? L10n.Safety.anonymousAuthor }

    var body: some View {
        Menu {
            Button { reporting = true } label: { Label { Text(reportTitle) } icon: { OrganicIcon.image(.flag) } }
            if isBlocked {
                Button {
                    Task { try? await session.safety?.unblock(target.userId); onChange() }
                } label: { Label { Text(L10n.Safety.unblock) } icon: { OrganicIcon.image(.userCheck) } }
            } else {
                Button(role: .destructive) { confirmingBlock = true } label: {
                    Label { Text(L10n.Safety.block) } icon: { OrganicIcon.image(.ban) }
                }
            }
        } label: {
            OrganicIcon(.dots, size: 22, strokeWidth: Tokens.ink)
                .foregroundStyle(Tokens.text)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(L10n.Safety.menuLabel)
        .sheet(isPresented: $reporting) { ReportSheet(target: target, handle: handle, onBlocked: onChange) }
        .confirmationDialog(L10n.Safety.blockTitle(handle: name), isPresented: $confirmingBlock, titleVisibility: .visible) {
            Button(L10n.Safety.blockConfirm, role: .destructive) {
                Task {
                    do { try await session.safety?.block(target.userId); onChange() } catch { failed = true }
                }
            }
            Button(L10n.Safety.cancel, role: .cancel) {}
        } message: {
            Text(L10n.Safety.blockBody)
        }
        .alert(L10n.Safety.actionError, isPresented: $failed) { Button("OK") {} }
    }

    private var reportTitle: String {
        switch target {
        case .card: L10n.Safety.reportCard
        case .user: L10n.Safety.reportUser
        case .message: L10n.Safety.reportMessage
        }
    }
}

/// The undo banner while a deletion is scheduled (web: AccountDeletionBanner).
struct AccountDeletionBanner: View {
    let date: Date
    @Environment(SessionStore.self) private var session
    @State private var failed = false

    var body: some View {
        HStack(spacing: 12) {
            Text(L10n.AccountDeletion.banner(date: date.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, locale: Strings.shared.locale))))
                .font(AppFonts.body(14, weight: .semibold))
                .foregroundStyle(Tokens.text)
            Spacer(minLength: 8)
            Button(L10n.AccountDeletion.cancel) {
                Task {
                    do { try await session.cancelDeletion() } catch { failed = true }
                }
            }
            .font(AppFonts.body(14, weight: .semibold))
            .foregroundStyle(Tokens.terracotta)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .organicSurface(fill: Tokens.terracottaLight, stroke: Tokens.terracotta, radius: 18, seed: 211, grainOpacity: 0.2)
        .padding(.horizontal, 12)
        .alert(L10n.AccountDeletion.error, isPresented: $failed) { Button("OK") {} }
    }
}
