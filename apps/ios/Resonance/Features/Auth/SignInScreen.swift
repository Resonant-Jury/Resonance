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
                OrganicButton(L10n.Auth.continueWithGoogle, image: "GoogleMark", variant: .outline) {
                    Task { await session.signInWithGoogle() }
                }
                .busy(session.isSigningIn, label: L10n.Auth.signingIn)
                OrganicButton(L10n.Auth.continueWithApple, image: "AppleMark", variant: .outline) {
                    Task { await session.signInWithApple() }
                }
                .busy(session.isSigningIn, label: L10n.Auth.signingIn)
            }
            if let error = session.signInError {
                Text(error)
                    .font(AppFonts.body(13))
                    .foregroundStyle(Tokens.terracotta)
                    .padding(.top, 12)
            }
            TermsConsentLine().padding(.top, 24)
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

/// TermsConsent (web): "By continuing, you agree to the Terms of Use and the
/// Privacy Policy" under the buttons, 13pt muted, the two policy pages as
/// OrganicLinks inside the sentence (App Store 1.2: people agree to the terms
/// before they can post). The sentence wraps like text around the links.
private struct TermsConsentLine: View {
    @Environment(SessionStore.self) private var session

    private enum Piece: Hashable {
        case text(String)
        case link(PolicyPage)
    }

    var body: some View {
        let language = Strings.shared.language
        InlineFlow(lineSpacing: 5) {
            ForEach(Array(Self.pieces().enumerated()), id: \.offset) { _, piece in
                switch piece {
                case let .text(t):
                    Text(t).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                case let .link(page):
                    OrganicLink(page == .terms ? L10n.Auth.termsLink : L10n.Auth.privacyLink, href: page.path(language), size: 13) {
                        InAppBrowser.open(page.url(origin: session.config.origin, language: language))
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// The sentence split around its two links, so each language keeps its own
    /// word order. Words break at spaces (kept as no-break spaces, so they're
    /// measured); text without spaces (Han) breaks between characters.
    private static func pieces() -> [Piece] {
        let mark = "\u{1}"
        let sentence = L10n.Auth.agreeTerms(terms: "\(mark)terms\(mark)", privacy: "\(mark)privacy\(mark)")
        var out: [Piece] = []
        for (i, part) in sentence.components(separatedBy: mark).enumerated() where !part.isEmpty {
            if i % 2 == 1 {
                out.append(.link(part == "terms" ? .terms : .privacy))
            } else if part.contains(" ") {
                let words = part.split(separator: " ", omittingEmptySubsequences: false)
                for (j, word) in words.enumerated() {
                    let text = String(word) + (j < words.count - 1 ? "\u{00A0}" : "")
                    if !text.isEmpty { out.append(.text(text)) }
                }
            } else {
                out.append(contentsOf: part.map { .text(String($0)) })
            }
        }
        return out
    }
}

/// Lays its children out left to right like inline text, wrapping to a new
/// line when the next one doesn't fit, each line's children sitting on a
/// common bottom (their baselines, since they share a font).
private struct InlineFlow: Layout {
    var lineSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let lines = arrange(proposal.width ?? .infinity, subviews)
        let height = lines.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(0, lines.count - 1))
        return CGSize(width: proposal.width ?? (lines.map(\.width).max() ?? 0), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for line in arrange(bounds.width, subviews) {
            var x = bounds.minX
            for index in line.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + line.height - size.height), proposal: ProposedViewSize(size))
                x += size.width
            }
            y += line.height + lineSpacing
        }
    }

    private struct Line { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(_ maxWidth: CGFloat, _ subviews: Subviews) -> [Line] {
        var lines = [Line()]
        for (i, view) in subviews.enumerated() {
            let size = view.sizeThatFits(.unspecified)
            if lines[lines.count - 1].width + size.width > maxWidth, !lines[lines.count - 1].indices.isEmpty {
                lines.append(Line())
            }
            lines[lines.count - 1].indices.append(i)
            lines[lines.count - 1].width += size.width
            lines[lines.count - 1].height = max(lines[lines.count - 1].height, size.height)
        }
        return lines.filter { !$0.indices.isEmpty }
    }
}
