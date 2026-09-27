import DesignSystem
import ResonanceKit
import SwiftUI

/// The home feed (M1: recommended + latest from /api/v1).
struct FeedScreen: View {
    var body: some View {
        TabScreen(L10n.App.Nav.home) {
            VStack(alignment: .leading, spacing: 8) {
                Text(L10n.Home.heading).font(AppFonts.heading(20)).foregroundStyle(Tokens.text)
                Text(L10n.Home.subheading).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
            }
            .padding(.horizontal, 20)
            SketchLoader(size: 48).frame(maxWidth: .infinity).padding(.top, 40)
        }
    }
}
