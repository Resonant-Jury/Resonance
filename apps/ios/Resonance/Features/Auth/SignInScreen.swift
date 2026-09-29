import DesignSystem
import ResonanceKit
import SwiftUI

/// The web's sign-in page on a phone (AuthCard's mobile form): a borderless
/// section between two wavy rules, Google and Apple as outline buttons.
/// Emulator builds add an email form for the seeded test accounts.
struct SignInScreen: View {
    @Environment(SessionStore.self) private var session
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                // The auth layout: the brand over the section, centred on the screen.
                VStack(spacing: 0) {
                    brand.padding(.bottom, 36)
                    card
                    if session.config.usesEmulator { emulatorForm.padding(.top, 32) }
                }
                .padding(.vertical, 48)
                .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background(Tokens.cream)
    }

    /// ResonanceIcon (the wave glyph, nudged down 7%) beside the wordmark.
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
            Text(L10n.Auth.signInTitle)
                .font(AppFonts.heading(24))
                .foregroundStyle(Tokens.text)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 22)
            Text(L10n.Auth.googleIntro)
                .font(AppFonts.body(14))
                .foregroundStyle(Tokens.textMuted)
                .lineSpacing(14 * 0.6)
                .padding(.bottom, 24)
            if session.signedOutForDeletion {
                Text(L10n.Auth.deletionScheduled)
                    .font(AppFonts.body(14, weight: .semibold))
                    .foregroundStyle(Tokens.terracotta)
                    .padding(.bottom, 20)
            }
            VStack(alignment: .leading, spacing: 14) {
                OrganicButton(session.isSigningIn ? L10n.Auth.signingIn : L10n.Auth.continueWithGoogle, image: "GoogleMark", variant: .outline) {
                    Task { await session.signInWithGoogle() }
                }
                OrganicButton(session.isSigningIn ? L10n.Auth.signingIn : L10n.Auth.continueWithApple, image: "AppleMark", variant: .outline) {
                    Task { await session.signInWithApple() }
                }
            }
            .disabled(session.isSigningIn)
            if let error = session.signInError {
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
        // GrainOverlay 0.04 over the whole section, words included: ink at 2×.
        .overlay {
            GrainLayer(shape: Rectangle(), mode: .tile, opacity: 0.08, tile: "grain-overlay").accessibilityHidden(true)
        }
        .overlay(alignment: .top) { WavyDivider(color: Tokens.authBorder, seed: 313).offset(y: -3) }
        .overlay(alignment: .bottom) { WavyDivider(color: Tokens.authBorder, seed: 324).offset(y: 3) }
    }

    /// Emulator builds only: the seeded accounts (scripts/seed-emulator.ts).
    private var emulatorForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Emulator").font(AppFonts.body(12, weight: .semibold)).foregroundStyle(Tokens.textMuted)
            OrganicTextField(L10n.Auth.email, text: $email, placeholder: "alice@resonance.test")
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
            OrganicTextField(L10n.Auth.password, text: $password, isSecure: true, seed: 23)
            OrganicButton(L10n.Auth.signIn) {
                Task { await session.signIn(email: email, password: password) }
            }
            .disabled(email.isEmpty || password.isEmpty || session.isSigningIn)
        }
        .padding(.horizontal, 36)
        .accessibilityIdentifier("emulator-sign-in")
    }
}
