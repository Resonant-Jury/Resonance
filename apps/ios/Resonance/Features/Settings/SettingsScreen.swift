import DesignSystem
import ResonanceKit
import SwiftUI

/// Settings (settings/page.tsx, the parts that apply to the app): language,
/// the block list, signing out, and deleting the account after optionally
/// downloading everything one wrote (Apple 5.1.1(v)).
struct SettingsScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute
    @State private var exportFile: URL?
    @State private var exporting = false
    @State private var confirmingDelete = false
    @State private var deleteError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Text(L10n.Settings.title)
                    .font(AppFonts.heading(30))
                    .foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)

                panel(L10n.Settings.Sections.language) {
                    Text(L10n.Settings.Language.ui).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                    HStack(spacing: 10) {
                        languageButton(.zhTW, "繁體中文")
                        languageButton(.en, "English")
                    }
                }

                panel(L10n.Settings.Sections.privacy) {
                    Button { openRoute(.blockedList) } label: {
                        HStack {
                            Text(L10n.Settings.Privacy.manageBlocks).font(AppFonts.body(16)).foregroundStyle(Tokens.text)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(Tokens.textMuted)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }

                panel(L10n.Settings.Sections.account) {
                    OrganicButton(L10n.Settings.Account.signOut, variant: .ghost) { session.signOut() }
                }

                panel(L10n.Settings.Delete.title) {
                    Text(L10n.Settings.Delete.exportHint).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                    if let exportFile {
                        ShareLink(item: exportFile) {
                            Label(L10n.Settings.Delete.export, systemImage: "square.and.arrow.down")
                                .font(AppFonts.body(15, weight: .semibold))
                                .foregroundStyle(Tokens.terracotta)
                        }
                    } else {
                        OrganicButton(exporting ? L10n.Settings.Delete.exporting : L10n.Settings.Delete.export, icon: "square.and.arrow.down", variant: .outline) {
                            Task { await export() }
                        }
                        .disabled(exporting)
                    }
                    WavyDivider(seed: 61).padding(.vertical, 4)
                    Text(L10n.Settings.Delete.warn).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    OrganicButton(L10n.Settings.Delete.button) { confirmingDelete = true }
                    if let deleteError {
                        Text(deleteError).font(AppFonts.body(13)).foregroundStyle(Tokens.terracotta)
                    }
                }
            }
            .padding(20)
            .padding(.bottom, 40)
        }
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) { OrganicInlineBar("", backLabel: L10n.App.Nav.back) }
        .toolbar(.hidden, for: .navigationBar)
        .confirmationDialog(L10n.Settings.Delete.confirmTitle, isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button(L10n.Settings.Delete.confirm, role: .destructive) { Task { await deleteAccount() } }
            Button(L10n.Settings.Delete.cancel, role: .cancel) {}
        } message: {
            Text(L10n.Settings.Delete.confirmBody(date: Self.purgeDate.formatted(Date.FormatStyle(date: .long, time: .omitted, locale: Strings.shared.locale))))
        }
    }

    /// Seven days from now — when a deletion scheduled today would run.
    static var purgeDate: Date { Date().addingTimeInterval(7 * 86_400) }

    private func languageButton(_ language: Strings.Language, _ label: String) -> some View {
        let selected = Strings.shared.language == language
        return Button { session.setLanguage(language) } label: {
            Text(label)
                .font(AppFonts.body(15, weight: selected ? .semibold : .regular))
                .foregroundStyle(selected ? Tokens.terracotta : Tokens.text)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background {
                    WobRectShape(radius: 14, seed: label.count == 4 ? 71 : 73, mag: 1.2)
                        .stroke(selected ? Tokens.terracotta : Tokens.fieldBorder, lineWidth: Tokens.ink)
                }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func panel<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title.uppercased())
                .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
                .tracking(Tokens.labelSize * 0.06)
                .foregroundStyle(Tokens.textMuted)
            content()
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .organicSurface(fill: Tokens.cardBg, stroke: Tokens.fieldBorder, radius: Tokens.radiusLg, seed: Double(title.count * 11 + 5), grainOpacity: 0.2)
    }

    private func export() async {
        exporting = true
        defer { exporting = false }
        guard let data = try? await session.account.export() else { return }
        let url = FileManager.default.temporaryDirectory
            .appending(path: "resonance-backup-\(Date().formatted(.iso8601.year().month().day())).json")
        if (try? data.write(to: url)) != nil { exportFile = url }
    }

    private func deleteAccount() async {
        do {
            try await session.scheduleDeletion()
        } catch {
            deleteError = L10n.Settings.Delete.error
        }
    }
}

/// The people one blocked, with a way to unblock (web: BlockedListModal).
struct BlockedListScreen: View {
    @Environment(SessionStore.self) private var session
    @State private var people: [SafetyService.BlockedPerson]?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(L10n.Safety.BlockedList.title).font(AppFonts.heading(28)).foregroundStyle(Tokens.text)
                Text(L10n.Safety.BlockedList.subtitle).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                if let people {
                    if people.isEmpty {
                        OrganicEmptyState(L10n.Safety.BlockedList.empty)
                    }
                    ForEach(people) { person in
                        HStack(spacing: 12) {
                            HandDrawnAvatar(initials: person.initials, color: Tokens.creamDark, size: 40, seed: Double(seedFromString(person.id)))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(person.handle ?? L10n.Safety.BlockedList.unknownUser).font(AppFonts.body(16, weight: .semibold)).foregroundStyle(Tokens.text)
                                if let since = person.since {
                                    Text(L10n.Safety.BlockedList.since(date: since.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, locale: Strings.shared.locale))))
                                        .font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
                                }
                            }
                            Spacer()
                            OrganicButton(L10n.Safety.unblock, variant: .ghost) {
                                Task {
                                    try? await session.safety?.unblock(person.id)
                                    self.people?.removeAll { $0.id == person.id }
                                }
                            }
                        }
                    }
                } else {
                    SketchLoader(size: 44).frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(20)
        }
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) { OrganicInlineBar("", backLabel: L10n.App.Nav.back) }
        .toolbar(.hidden, for: .navigationBar)
        .task { people = (try? await session.safety?.blocked()) ?? [] }
    }
}
