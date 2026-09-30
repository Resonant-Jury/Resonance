import DesignSystem
import ResonanceAPI
import ResonanceKit
import SwiftUI

/// The settings sections that apply to the app, in the web's order.
enum SettingsSection: Hashable, CaseIterable {
    case profile, account, privacy, language, terms, delete

    var title: String {
        switch self {
        case .profile: L10n.Settings.Sections.profile
        case .account: L10n.Settings.Sections.account
        case .privacy: L10n.Settings.Sections.privacy
        case .language: L10n.Settings.Sections.language
        case .terms: L10n.Settings.Sections.terms
        case .delete: L10n.Settings.Sections.delete
        }
    }

    /// SECTION_ICONS.
    var icon: IconName {
        switch self {
        case .profile: .user
        case .account: .key
        case .privacy: .lock
        case .language: .globe
        case .terms: .document
        case .delete: .trash
        }
    }

    /// Its place in the web's full list, which seeds the rule above its row.
    var webIndex: Int {
        switch self {
        case .profile: 0
        case .account: 1
        case .privacy: 2
        case .language: 3
        case .terms: 5
        case .delete: 6
        }
    }
}

/// Settings on a phone (SettingsClient's menu): the title, then one row per
/// section — glyph, name, chevron — between wavy rules, each opening its
/// own screen. No panels: the web drops the frames at this width.
struct SettingsScreen: View {
    @Environment(\.openRoute) private var openRoute
    @State private var scrolled = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(L10n.Settings.title)
                    .font(AppFonts.heading(28))
                    .foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.bottom, 18)
                ForEach(SettingsSection.allCases, id: \.self) { section in
                    if section != SettingsSection.allCases.first {
                        WavyDivider(seed: Double(40 + section.webIndex * 6)).padding(.vertical, 2)
                    }
                    row(section)
                }
            }
            .padding(20)
            .padding(.bottom, 40)
        }
        .onHeaderScroll($scrolled)
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) { OrganicInlineBar("", backLabel: L10n.App.Nav.back, scrolled: scrolled) }
        .toolbar(.hidden, for: .navigationBar)
    }

    private func row(_ section: SettingsSection) -> some View {
        // Deleting the account is the one red row.
        let tint = section == .delete ? Tokens.danger : Tokens.terracotta
        return Button { openRoute(.settingsSection(section)) } label: {
            HStack(spacing: 16) {
                OrganicIcon(section.icon, size: 22, color: tint)
                Text(section.title)
                    .font(AppFonts.body(16))
                    .foregroundStyle(section == .delete ? tint : Tokens.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                OrganicIcon(.chevronDown, size: 18, color: Tokens.textMuted).rotationEffect(.degrees(-90))
            }
            .padding(.vertical, 18)
            .padding(.horizontal, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// One settings section on its own screen; the bar carries its name.
struct SettingsSectionScreen: View {
    let section: SettingsSection
    @State private var scrolled = false

    var body: some View {
        ScrollView {
            Group {
                switch section {
                case .profile: ProfileSettings()
                case .account: AccountSettings()
                case .privacy: PrivacySettings()
                case .language: LanguageSettings()
                case .terms: TermsSettings()
                case .delete: DeleteAccountSettings()
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .padding(.bottom, 40)
        }
        .onHeaderScroll($scrolled)
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            OrganicInlineBar(section.title, backLabel: L10n.App.Nav.back, scrolled: scrolled)
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// Profile: the pen name (checked as it's typed; your own counts as free),
/// the one-line bio (empty clears it) and the region, in the web's order and
/// seeds. The web autosaves these; here they wait for Save changes, so a
/// rename is never sent half-typed. Only what changed is sent. (The profile
/// photo stays on the web for now.)
private struct ProfileSettings: View {
    @Environment(SessionStore.self) private var session
    @State private var handle = ""
    @State private var bio = ""
    @State private var region: String?
    @State private var status: PenNameStatus = .idle
    @State private var filled = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        if let me = session.me {
            VStack(alignment: .leading, spacing: 24) {
                PenNameField(label: L10n.Settings.Profile.handle, text: $handle, status: $status, current: me.handle, seed: 31)
                OrganicTextField(L10n.Settings.Profile.bio, text: $bio, seed: 37)
                    .onChange(of: bio) { _, typed in
                        let capped = typed.prefix(utf16Units: PenName.bioMax)
                        if capped != typed { bio = capped }
                    }
                ChoiceList(label: L10n.Settings.Profile.region,
                           options: ProfileRegion.allCases.map { (Optional($0.rawValue), $0.label) },
                           selection: $region, seed: 43, flag: { $0 })
                VStack(alignment: .leading, spacing: 12) {
                    OrganicButton(saving ? L10n.Write.saving : L10n.Write.saveChanges) { Task { await save(me) } }
                        .disabled(!canSave(me) || saving)
                    if let error { ModalError(error) }
                }
                .padding(.top, 4)
            }
            .disabled(saving)
            .onAppear {
                guard !filled else { return }
                filled = true
                handle = me.handle
                bio = me.bio ?? ""
                region = me.region
            }
        } else {
            OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                Task { await session.loadMe() }
            }
        }
    }

    private struct Changes { var handle: String?; var bio: String?; var region: String? }

    /// What differs from the saved profile (nil: unchanged, left out of the request).
    private func changes(_ me: Components.Schemas.Me) -> Changes {
        let name = PenName.normalized(handle)
        let line = bio.trimmingCharacters(in: .whitespacesAndNewlines)
        return Changes(handle: name == me.handle ? nil : name,
                       bio: line == (me.bio ?? "") ? nil : line,
                       region: region == me.region ? nil : region)
    }

    /// Something changed, and a new pen name has been found free.
    private func canSave(_ me: Components.Schemas.Me) -> Bool {
        let c = changes(me)
        guard c.handle != nil || c.bio != nil || c.region != nil else { return false }
        return c.handle == nil || status == .available
    }

    private func save(_ me: Components.Schemas.Me) async {
        guard canSave(me), !saving else { return }
        let c = changes(me)
        saving = true
        error = nil
        defer { saving = false }
        do {
            let saved = try await session.profiles.update(handle: c.handle, bio: c.bio, region: c.region)
            session.adopt(saved)
            handle = saved.handle
            bio = saved.bio ?? ""
            region = saved.region
            status = .idle
        } catch let failure as APIFailure where failure.isConflict {
            // Someone took the name between the check and Save.
            status = .taken
        } catch {
            self.error = L10n.Native.saveError
        }
    }
}

/// Account: the sign-in email and phone (read-only), and signing out —
/// after the web's "Sign out?" confirmation.
private struct AccountSettings: View {
    @Environment(SessionStore.self) private var session
    @State private var confirming = false

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            OrganicTextField(L10n.Settings.Account.email, text: .constant(session.email ?? ""), placeholder: "you@example.com", seed: 51)
                .disabled(true)
            OrganicTextField(L10n.Settings.Account.phone, text: .constant(session.phoneNumber ?? ""), placeholder: "—", seed: 57)
                .disabled(true)
            OrganicButton(L10n.Settings.Account.signOut, variant: .outline) { confirming = true }
                .padding(.top, 4)
        }
        .organicConfirm(isPresented: $confirming, title: L10n.App.SignOutConfirm.title, message: L10n.App.SignOutConfirm.body,
                        cancelLabel: L10n.App.SignOutConfirm.cancel, confirmLabel: L10n.App.SignOutConfirm.confirm,
                        closeLabel: L10n.App.SignOutConfirm.cancel, seed: 67) {
            session.signOut()
        }
    }
}

/// Privacy: the block list, in its own dialog.
private struct PrivacySettings: View {
    @State private var showingBlocks = false

    var body: some View {
        OrganicButton(L10n.Settings.Privacy.manageBlocks, variant: .outline) { showingBlocks = true }
            .organicModal(isPresented: $showingBlocks, seed: 97, closeLabel: L10n.Safety.BlockedList.close) {
                BlockedListContent { showingBlocks = false }
            }
    }
}

/// Language: the interface language, as a radio list (the web's select).
private struct LanguageSettings: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L10n.Settings.Language.ui.uppercased())
                .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
                .tracking(Tokens.labelSize * 0.06)
                .foregroundStyle(Tokens.textMuted)
            VStack(spacing: 0) {
                row(.zhTW, "繁體中文", flag: "tw", seed: 71)
                WavyDivider(seed: 67).padding(.vertical, 2)
                row(.en, "English", flag: "gb", seed: 73)
            }
        }
    }

    /// The web's language select sets each name after its SquareFlag.
    private func row(_ language: Strings.Language, _ label: String, flag: String, seed: Double) -> some View {
        let selected = Strings.shared.language == language
        return Button { session.setLanguage(language) } label: {
            HStack(spacing: 10) {
                SquareFlag(flag, size: 18)
                Text(label)
                    .font(AppFonts.body(15, weight: selected ? .semibold : .regular))
                    .foregroundStyle(selected ? Tokens.terracotta : Tokens.text)
                Spacer(minLength: 0)
                OrganicRadio(isOn: selected, seed: seed)
            }
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Terms: the three policy pages (privacy, terms, contact), each an
/// OrganicLink 18pt apart in 16pt text. They open the live pages in the
/// language of the interface, inside the app.
private struct TermsSettings: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        let language = Strings.shared.language
        VStack(alignment: .leading, spacing: 18) {
            ForEach(PolicyPage.allCases, id: \.self) { page in
                OrganicLink(page.label, href: page.path(language)) {
                    InAppBrowser.open(page.url(origin: session.config.origin, language: language))
                }
            }
        }
    }
}

/// DeleteAccountSection: what happens, the backup first, then the quieter
/// outline Delete (the web keeps it from reading as a call to action) and
/// its confirmation. Apple 5.1.1(v).
private struct DeleteAccountSettings: View {
    @Environment(SessionStore.self) private var session
    @State private var exportFile: URL?
    @State private var exporting = false
    @State private var confirming = false
    @State private var busy = false
    @State private var failed = false

    /// Seven days from now — when a deletion scheduled today would run.
    private static var purgeDate: Date { Date().addingTimeInterval(7 * 86_400) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(L10n.Settings.Delete.title).font(AppFonts.heading(20)).foregroundStyle(Tokens.text)
            muted(L10n.Settings.Delete.warn)
            muted(L10n.Settings.Delete.exportHint)
            FlowRow(spacing: 12) {
                if let exportFile {
                    // Ready: the same frameless text as before (Android keeps it too), now handing the file over.
                    ShareLink(item: exportFile) {
                        OrganicButtonLabel(L10n.Settings.Delete.export, icon: .check, variant: .text)
                    }
                    .buttonStyle(OrganicPressStyle(inset: 0))
                } else {
                    OrganicButton(exporting ? L10n.Settings.Delete.exporting : L10n.Settings.Delete.export, icon: .document, variant: .text) {
                        Task { await export() }
                    }
                    .disabled(exporting)
                }
                OrganicButton(L10n.Settings.Delete.button, icon: .trash, variant: .outline) { confirming = true }
            }
            if failed { ModalError(L10n.Settings.Delete.error) }
        }
        .organicConfirm(isPresented: $confirming, title: L10n.Settings.Delete.confirmTitle,
                        message: L10n.Settings.Delete.confirmBody(date: Self.purgeDate.formatted(
                            Date.FormatStyle(date: .long, time: .omitted, locale: Strings.shared.locale))),
                        cancelLabel: L10n.Settings.Delete.cancel, confirmLabel: L10n.Settings.Delete.confirm,
                        closeLabel: L10n.Settings.Delete.cancel, busy: busy, destructive: true, seed: 73) {
            Task { await deleteAccount() }
        }
    }

    private func muted(_ text: String) -> some View {
        CSSText(text, font: AppFonts.uiFont(.body, size: 14), lineHeight: 1.65, color: UIColor(Tokens.textMuted))
    }

    private func export() async {
        exporting = true
        failed = false
        defer { exporting = false }
        guard let data = try? await session.account.export() else {
            failed = true
            return
        }
        let url = FileManager.default.temporaryDirectory
            .appending(path: "resonance-backup-\(Date().formatted(.iso8601.year().month().day())).json")
        if (try? data.write(to: url)) != nil { exportFile = url } else { failed = true }
    }

    private func deleteAccount() async {
        guard !busy else { return }
        busy = true
        failed = false
        do {
            try await session.scheduleDeletion()
        } catch {
            busy = false
            confirming = false
            failed = true
        }
    }
}

/// BlockedListModal's inside: everyone blocked, newest first, each with a
/// small Unblock, between wavy rules.
private struct BlockedListContent: View {
    let onClose: () -> Void
    @Environment(SessionStore.self) private var session
    @State private var people: [SafetyService.BlockedPerson]?
    @State private var pending: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Safety.BlockedList.title).padding(.bottom, 6)
            ModalBody(L10n.Safety.BlockedList.subtitle).padding(.bottom, 14)
            if let people {
                if people.isEmpty {
                    EmptyNote(L10n.Safety.BlockedList.empty, size: 14.5).padding(.vertical, 18)
                }
                ForEach(Array(people.enumerated()), id: \.element.id) { i, person in
                    if i > 0 { WavyDivider(seed: Double(100 + i * 7)).padding(.vertical, 2) }
                    row(person)
                }
            } else {
                SketchLoader(size: 44).frame(maxWidth: .infinity).padding(.vertical, 18)
            }
            ModalActions { OrganicButton(L10n.Safety.BlockedList.close, variant: .text, size: .sm, action: onClose) }
                .padding(.top, 16)
        }
        .task { people = (try? await session.safety?.blocked()) ?? [] }
    }

    private func row(_ person: SafetyService.BlockedPerson) -> some View {
        HStack(spacing: 12) {
            HandDrawnAvatar(initials: person.initials, imageURL: person.avatarUrl.flatMap(URL.init(string:)),
                            color: person.accentColor.flatMap(OKLCHColor.parse) ?? Tokens.creamDark, size: 36,
                            seed: person.avatarSeed ?? 5)
            VStack(alignment: .leading, spacing: 0) {
                Text(person.handle ?? L10n.Safety.BlockedList.unknownUser)
                    .font(AppFonts.body(15, weight: .semibold))
                    .foregroundStyle(Tokens.text)
                    .lineLimit(1)
                if let since = person.since {
                    Text(L10n.Safety.BlockedList.since(date: since.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, locale: Strings.shared.locale))))
                        .font(AppFonts.body(12.5))
                        .foregroundStyle(Tokens.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            OrganicButton(pending == person.id ? "…" : L10n.Safety.unblock, variant: .textAccent, size: .sm) {
                Task { await unblock(person.id) }
            }
            .disabled(pending != nil)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 2)
    }

    private func unblock(_ id: String) async {
        guard pending == nil else { return }
        pending = id
        defer { pending = nil }
        do {
            try await session.safety?.unblock(id)
            people?.removeAll { $0.id == id }
        } catch {}
    }
}
