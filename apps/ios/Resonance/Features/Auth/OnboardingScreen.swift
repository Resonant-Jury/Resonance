import DesignSystem
import ResonanceKit
import SwiftUI

/// The signup page's profile step, shown before the tabs to a signed-in
/// account that has no profile yet: a pen name (checked as it's typed), a
/// region and a main writing language, then Finish. Laid out like the
/// sign-in screen; signing out stays within reach, for someone who signed
/// in with the wrong account.
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
                    brand.padding(.bottom, 36)
                    card
                    footer.padding(.top, 28)
                }
                .padding(.vertical, 48)
                .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Tokens.cream)
    }

    /// ResonanceIcon beside the wordmark, as on the sign-in screen.
    private var brand: some View {
        HStack(spacing: 10) {
            OrganicIcon(.wave, size: 44, color: Tokens.terracotta, strokeWidth: Tokens.ink)
                .offset(y: 44 * 0.07)
            Text(verbatim: "Resonance")
                .font(AppFonts.heading(26))
                .foregroundStyle(Tokens.text)
        }
        .accessibilityElement(children: .combine)
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.Auth.stepHandle)
                .font(AppFonts.heading(24))
                .foregroundStyle(Tokens.text)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 22)
            VStack(alignment: .leading, spacing: 18) {
                PenNameField(label: L10n.Auth.handleLabel, text: $handle, status: $status)
                ChoiceList(label: L10n.Auth.regionLabel,
                           options: ProfileRegion.allCases.map { ($0.rawValue, $0.label) },
                           selection: $region, seed: 41)
                ChoiceList(label: L10n.Auth.primaryLocaleLabel,
                           options: [(Strings.Language.zhTW, "繁體中文"), (.en, "English")],
                           selection: $language, seed: 61)
            }
            .disabled(creating)
            // Finish sits at the end of the row, as on the web; it only works once the name is free.
            HStack {
                Spacer(minLength: 0)
                OrganicButton(creating ? L10n.Auth.creating : L10n.Auth.finish) { Task { await finish() } }
                    .disabled(status != .available || creating)
            }
            .padding(.top, 24)
            if let error {
                Text(error)
                    .font(AppFonts.body(13))
                    .foregroundStyle(Tokens.terracotta)
                    .padding(.top, 12)
            }
        }
        .padding(.horizontal, 36)
        .padding(.vertical, 42)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Tokens.authInterior)
        .overlay {
            GrainLayer(shape: Rectangle(), mode: .tile, opacity: 0.08, tile: "grain-overlay").accessibilityHidden(true)
        }
        .overlay(alignment: .top) { WavyDivider(color: Tokens.authBorder, seed: 313).offset(y: -3) }
        .overlay(alignment: .bottom) { WavyDivider(color: Tokens.authBorder, seed: 324).offset(y: 3) }
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
        .padding(.horizontal, 36)
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
        } catch let failure as APIFailure where failure.isConflict {
            // Someone took the name between the check and Finish.
            status = .taken
        } catch {
            self.error = L10n.Auth.signUpError
        }
    }
}
