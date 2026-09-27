import DesignSystem
import ResonanceKit
import SwiftUI

/// My card box. M0 shows who is signed in (GET /api/v1/me); M2 adds the
/// drafts, published cards, bookmarks and resonances.
struct CardBoxScreen: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        TabScreen(L10n.App.Nav.me) {
            OrganicIconButton(symbol: "rectangle.portrait.and.arrow.right", label: L10n.App.Nav.signOut) {
                session.signOut()
            }
        } content: {
            profile.padding(.horizontal, 20)
        }
        .refreshable { await session.loadMe() }
    }

    @ViewBuilder private var profile: some View {
        switch session.profile {
        case .unknown, .loading:
            SketchLoader(size: 48).frame(maxWidth: .infinity).padding(.top, 40)
        case .loaded:
            if let me = session.me {
                HStack(spacing: 16) {
                    HandDrawnAvatar(initials: me.initials, color: OKLCHColor.parse(me.accentColor) ?? Tokens.terracottaLight, size: 64, seed: Double(seedFromString(me.id)))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(me.handle).font(AppFonts.heading(24)).foregroundStyle(Tokens.text)
                        Text(me.bio ?? L10n.Me.bioEmpty).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .organicSurface(fill: Tokens.cardBg, stroke: Tokens.fieldBorder, radius: Tokens.radiusLg, seed: 77)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("me-card")
            }
        case .missing:
            OrganicEmptyState(L10n.Auth.stepHandle)
        case let .failed(message):
            OrganicEmptyState(message, actionTitle: L10n.Home.moreBtn) { Task { await session.loadMe() } }
        }
    }
}
