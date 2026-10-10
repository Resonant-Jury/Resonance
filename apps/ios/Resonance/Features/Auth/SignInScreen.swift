import DesignSystem
import ResonanceKit
import SwiftUI

/// The web's sign-in page on a phone (AuthCard's mobile form): paper edge to
/// edge, the brand on a cover over the upper part and the sign-in on a sheet
/// tucked at the foot, its buttons in the thumb's reach — Sign in with Apple
/// in ink over Google's in terracotta, both full width. Emulator builds add an
/// email form for the seeded test accounts at the end of the sheet.
struct SignInScreen: View {
    @Environment(SessionStore.self) private var session
    @State private var email = ""
    @State private var password = ""
    /// The provider button tapped last: it shows the loader while the sign-in runs, the other waits.
    @State private var tapped: String?

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                AnchoredAuthLayout(minHeight: geo.size.height) {
                    ViewThatFits(in: .vertical) {
                        AuthLockup(fold: .tall).fixedSize(horizontal: false, vertical: true)
                        AuthLockup(fold: .compact).fixedSize(horizontal: false, vertical: true)
                        AuthLockup(fold: .bare).fixedSize(horizontal: false, vertical: true)
                    }
                    // On a window wider than a phone the sheet's paper still runs edge to edge; what is on it
                    // keeps to a 480 column in the middle (design §14).
                    AuthSheet(width: geo.size.width) { sheet.frame(maxWidth: 480).frame(maxWidth: .infinity) }
                }
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background(Tokens.cream)
    }

    private var sheet: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.Auth.signInTitle)
                .font(AppFonts.heading(24))
                .foregroundStyle(Tokens.text)
                .lineSpacing(24 * 0.3)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 8)
            Text(L10n.Auth.appleGoogleIntro)
                .font(AppFonts.body(14))
                .foregroundStyle(Tokens.textMuted)
                .lineSpacing(14 * 0.6)
                .padding(.bottom, 22)
            if session.signedOutForDeletion {
                Text(L10n.Auth.deletionScheduled)
                    .font(AppFonts.body(14, weight: .semibold))
                    .foregroundStyle(Tokens.terracotta)
                    .padding(.bottom, 16)
            }
            // The sheet is the frame, so neither button draws a pen line. Apple
            // asks for a black (or white) button as prominent as the others: ink, first.
            VStack(spacing: 12) {
                OrganicButton(L10n.Auth.continueWithApple, image: "AppleMark", variant: .ink, size: .lg) {
                    tapped = "apple"
                    Task { await session.signInWithApple() }
                }
                .fillingWidth()
                .loading(session.isSigningIn && tapped == "apple")
                .disabled(session.isSigningIn && tapped != "apple")
                OrganicButton(L10n.Auth.continueWithGoogle, image: "GoogleMark", variant: .solid, size: .lg) {
                    tapped = "google"
                    Task { await session.signInWithGoogle() }
                }
                .markOnDisc()
                .fillingWidth()
                .loading(session.isSigningIn && tapped == "google")
                .disabled(session.isSigningIn && tapped != "google")
            }
            if let error = session.signInError {
                Text(error)
                    .font(AppFonts.body(13))
                    .foregroundStyle(Tokens.terracotta)
                    .padding(.top, 12)
            }
            TermsConsentLine().padding(.top, 16)
            if session.config.usesEmulator {
                WavyDivider().padding(.top, 28).padding(.bottom, 20)
                emulatorForm
            }
        }
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
        .accessibilityIdentifier("emulator-sign-in")
    }
}

/// The sign-in column: the sheet keeps its own height at the foot and the
/// cover takes what's left over it, the lockup at 70% of its free height
/// (spacers 7:3, at least 24 above and 28 below). The first subview is a
/// ViewThatFits of the lockups, tall to bare, which shows the first that fits
/// the height it's offered — so offered a lockup's own height, it shows that
/// one. The tall lockup stays while it leaves 96 free, the compact one while
/// it leaves 64; under that the tagline goes, and only then does the column
/// grow past the screen (and scroll), the spacers at their least.
private struct AnchoredAuthLayout: Layout {
    /// The screen's height: the column is at least this tall.
    var minHeight: CGFloat

    private struct Arrangement {
        var lockupOffer: ProposedViewSize
        var above: CGFloat
        var sheet: CGFloat
        var height: CGFloat
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard subviews.count == 2 else { return .zero }
        let width = proposal.width ?? subviews[1].sizeThatFits(.unspecified).width
        return CGSize(width: width, height: arrange(width: width, height: max(minHeight, proposal.height ?? 0), subviews).height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 2 else { return }
        let a = arrange(width: bounds.width, height: bounds.height, subviews)
        subviews[0].place(at: CGPoint(x: bounds.midX, y: bounds.minY + a.above), anchor: .top, proposal: a.lockupOffer)
        subviews[1].place(at: CGPoint(x: bounds.minX, y: bounds.maxY - a.sheet), proposal: ProposedViewSize(width: bounds.width, height: a.sheet))
    }

    private func arrange(width: CGFloat, height: CGFloat, _ subviews: Subviews) -> Arrangement {
        let lockup = subviews[0]
        let sheet = subviews[1].sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        let room = height - sheet
        // The cover's 24 at each side.
        let lockupWidth = max(0, width - 48)
        func offer(_ h: CGFloat) -> ProposedViewSize { ProposedViewSize(width: lockupWidth, height: h) }
        func lockupHeight(_ h: CGFloat) -> CGFloat { lockup.sizeThatFits(offer(h)).height }
        // Offered just under one lockup's height, the next one shows.
        let tall = lockupHeight(.infinity)
        var shown = tall
        if room < tall + 96 {
            let compact = lockupHeight(tall - 1)
            shown = room >= compact + 64 ? compact : lockupHeight(compact - 1)
        }
        let rest = max(room - shown, 52)
        let below = max(28, rest * 0.3)
        return Arrangement(lockupOffer: offer(shown), above: rest - below, sheet: sheet,
                           height: max(height, rest + shown + sheet))
    }
}

/// The brand on the auth screens' cover: ResonanceIcon (the wave glyph,
/// nudged down 7%) and the wordmark, then the hero's line. Tall, the mark
/// stacks over the wordmark on a soft blob; compact, they share a row over a
/// smaller one; bare, that row alone (a short cover, onboarding).
struct AuthLockup: View {
    enum Fold { case tall, compact, bare }
    let fold: Fold

    var body: some View {
        VStack(spacing: 0) {
            if fold == .tall {
                VStack(spacing: 6) {
                    mark(60)
                    wordmark(34)
                }
            } else {
                HStack(spacing: 10) {
                    mark(40)
                    wordmark(28)
                }
            }
            if fold != .bare {
                AuthTagline(size: fold == .tall ? 19 : 17)
                    .padding(.top, fold == .tall ? 14 : 8)
            }
        }
        // The blob, taking no room, where the web's sits: its centre 24 left of
        // the middle and 34 down (behind the mark); on the row, 40 left and 22 down.
        .background(alignment: .top) {
            if fold != .bare {
                let across: CGFloat = fold == .tall ? 176 : 120
                BrandBlob()
                    .frame(width: across, height: across)
                    .offset(x: fold == .tall ? -24 : -40, y: (fold == .tall ? 34 : 22) - across / 2)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// The glyph at the pen's INK.
    private func mark(_ size: CGFloat) -> some View {
        OrganicIcon(.wave, size: size, color: Tokens.terracotta, strokeWidth: Tokens.ink)
            .offset(y: size * 0.07)
    }

    /// The wordmark is a logo: a fixed size that doesn't follow Dynamic Type,
    /// in the web's 1.15 line box rather than Playfair's own taller one.
    private func wordmark(_ size: CGFloat) -> some View {
        let font = AppFonts.uiFont(.heading, size: size, weight: .bold)
        return Text(verbatim: "Resonance")
            .font(Font(font))
            .tracking(-0.02 * size)
            .foregroundStyle(Tokens.text)
            .fixedSize()
            .padding(.vertical, (size * 1.15 - font.lineHeight) / 2)
    }
}

/// hero.headline under the wordmark, centred and muted, the accent word in
/// terracotta with a pen's wavy stroke under it (the web's Emphasis).
private struct AuthTagline: View {
    let size: CGFloat

    var body: some View {
        // The heading face grows with the text size like the title style; the stroke's drop follows.
        let scale = TextScale.factor(relativeTo: .title1)
        let accent = Text(verbatim: L10n.Hero.headlineAccent)
            .foregroundStyle(Tokens.terracotta)
            .customAttribute(PenAccent())
        Text("\(Text(verbatim: L10n.Hero.headlinePrefix))\(accent)\(Text(verbatim: L10n.Hero.headlineSuffix))")
            .font(AppFonts.heading(size, weight: .medium))
            .foregroundStyle(Tokens.textMuted)
            .lineSpacing(size * 0.45)
            .multilineTextAlignment(.center)
            .textRenderer(PenAccentRenderer(color: Tokens.terracotta, lineWidth: Tokens.ink, drop: size * scale * 0.22))
    }
}

/// Marks the run ``PenAccentRenderer`` underlines.
private nonisolated struct PenAccent: TextAttribute {}

/// Draws the text as it is, and under each run marked ``PenAccent`` a pen's
/// wavy stroke (penWave, 1.7 high, at 90%) centred `drop` under the baseline
/// — on whichever line the run falls.
private nonisolated struct PenAccentRenderer: TextRenderer {
    let color: Color
    let lineWidth: CGFloat
    let drop: CGFloat

    var displayPadding: EdgeInsets { EdgeInsets(top: 0, leading: 2, bottom: drop + 4, trailing: 2) }

    func draw(layout: Text.Layout, in ctx: inout GraphicsContext) {
        for line in layout {
            ctx.draw(line)
            for run in line where run[PenAccent.self] != nil {
                let bounds = run.typographicBounds
                let band = CGRect(x: bounds.rect.minX, y: bounds.origin.y + drop - 4, width: bounds.width, height: 8)
                ctx.stroke(PenWaveShape(seed: 7, amp: 1.7).path(in: band), with: .color(color.opacity(0.9)),
                           style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
            }
        }
    }
}

/// OrganiBlob's first shape (the hero's) behind the brand mark: terracotta
/// light with the blob's grain, widened 18% and turned −18° (the web's
/// `rotate(-18deg) scaleX(1.18)`), at 26%.
private struct BrandBlob: View {
    var body: some View {
        ZStack {
            OrganiBlobShape().fill(Tokens.terracottaLight)
            GrainLayer(shape: OrganiBlobShape(), mode: .tile, opacity: 0.4, tile: "grain-card")
        }
        .scaleEffect(x: 1.18, y: 1)
        .rotationEffect(.degrees(-18))
        .compositingGroup()
        .opacity(0.26)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// OrganiBlob.tsx's BLOB_PATHS[0] in its −90…90 box, scaled to fit the rect.
private nonisolated struct OrganiBlobShape: Shape {
    /// The start point, then each curve's two handles and its end.
    private static let start: (Double, Double) = (54, -65.2)
    private static let curves: [Double] = [
        68.7, -54.3, 78.2, -36.8, 80.1, -18.8,
        82, -0.9, 76.2, 17.6, 66.5, 32.5,
        56.8, 47.4, 43.2, 58.8, 27.3, 65.8,
        11.4, 72.8, -6.7, 75.4, -23.1, 70.2,
        -39.5, 65, -54.2, 52, -63.5, 36,
        -72.8, 20, -76.7, 1, -73.5, -16.4,
        -70.3, -33.8, -60, -49.6, -46.4, -60.8,
        -32.8, -72, -16.4, -78.5, 1.6, -80.5,
        19.6, -82.5, 39.2, -76.1, 54, -65.2,
    ]

    func path(in rect: CGRect) -> Path {
        let s = Double(min(rect.width, rect.height)) / 180
        func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: Double(rect.midX) + x * s, y: Double(rect.midY) + y * s) }
        var p = Path()
        p.move(to: pt(Self.start.0, Self.start.1))
        let c = Self.curves
        for i in stride(from: 0, to: c.count, by: 6) {
            p.addCurve(to: pt(c[i + 4], c[i + 5]), control1: pt(c[i], c[i + 1]), control2: pt(c[i + 2], c[i + 3]))
        }
        p.closeSubpath()
        return p
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
