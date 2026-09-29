import DesignSystem
import ResonanceKit
import SwiftUI

/// Writing a card (M3: the editor island, drafts, publishing).
struct WriteScreen: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                OrganicIconButton(.close, label: L10n.App.Nav.back) { dismiss() }
                Spacer()
            }
            .padding(.horizontal, 12)
            OrganicLargeHeader(L10n.App.Nav.write)
            OrganicEmptyState(message: L10n.Me.emptyPublished)
            Spacer()
        }
        .background(Tokens.cream)
    }
}
