import DesignSystem
import ResonanceKit
import SwiftUI

/// The signup page's profile step, shown before the tabs to a signed-in
/// account that has no profile yet — or one that never got a pen name, which
/// Finish names: a pen name (checked as it's typed), a region and a main
/// writing language, then Finish. The sign-in screen's shell with the compact
/// cover (the lockup's row alone) and the sheet taking the rest of the screen,
/// its content from the top; signing out stays within reach at its end, for
/// someone who signed in with the wrong account.
struct OnboardingScreen: View {
    @Environment(SessionStore.self) private var session
    @State private var handle = ""
    @State private var status: PenNameStatus = .idle
    @State private var region = ProfileRegion.tw.rawValue
    @State private var language = Strings.shared.language
    @State private var creating = false
    @State private var error: String?

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    // 16 under the status bar, 20 over the sheet's wave (which lies 7 into the sheet).
                    AuthLockup(fold: .bare)
                        .padding(.top, 16)
                        .padding(.bottom, 20 - AuthSheetShape.waveY)
                    // The sheet's paper runs on to the foot of the screen under a short form.
                    AuthSheet(width: geo.size.width) { form.frame(maxWidth: 480).frame(maxWidth: .infinity) }
                }
                .frame(maxWidth: .infinity, minHeight: geo.size.height, alignment: .top)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Tokens.cream)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.Auth.signUpTitle)
                .font(AppFonts.heading(24))
                .foregroundStyle(Tokens.text)
                .lineSpacing(24 * 0.3)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 22)
            VStack(alignment: .leading, spacing: 18) {
                PenNameField(label: L10n.Auth.handleLabel, text: $handle, status: $status)
                ChoiceList(label: L10n.Auth.regionLabel,
                           options: ProfileRegion.allCases.map { ($0.rawValue, $0.label) },
                           selection: $region, seed: 41, flag: { $0 })
                ChoiceList(label: L10n.Auth.primaryLocaleLabel,
                           options: [(Strings.Language.zhTW, "繁體中文"), (.en, "English")],
                           selection: $language, seed: 61)
            }
            .disabled(creating)
            // Finish sits at the end of the row, as on the web; it only works once the name is free.
            HStack {
                Spacer(minLength: 0)
                OrganicButton(L10n.Auth.finish) { Task { await finish() } }
                    .loading(creating)
                    .disabled(status != .available && !creating)
            }
            .padding(.top, 24)
            if let error {
                Text(error)
                    .font(AppFonts.body(13))
                    .foregroundStyle(Tokens.terracotta)
                    .padding(.top, 12)
            }
            footer.padding(.top, 32)
        }
    }

    /// Who is signed in, and the way back out.
    private var footer: some View {
        HStack(spacing: 12) {
            if let email = session.email {
                Text(verbatim: email)
                    .font(AppFonts.body(14))
                    .foregroundStyle(Tokens.textMuted)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer(minLength: 0)
            OrganicLink(L10n.App.Nav.signOut, href: "/signout", size: 14) { session.signOut() }
                .disabled(creating)
        }
    }

    private func finish() async {
        guard status == .available, !creating else { return }
        creating = true
        error = nil
        defer { creating = false }
        do {
            // Idempotent on the server: a retry after a lost answer gets the profile it made.
            let me = try await session.profiles.create(handle: PenName.normalized(handle), region: region, language: language)
            session.adopt(me)
            // A server that handed a profile without a pen name back unchanged (an older one) leaves it here: say so.
            if SessionStore.ProfileAnswer.of(me) == .unnamed { self.error = L10n.Auth.signUpError }
        } catch let failure as APIFailure where failure.isConflict {
            // Someone took the name between the check and Finish.
            status = .taken
        } catch {
            self.error = L10n.Auth.signUpError
        }
    }
}
