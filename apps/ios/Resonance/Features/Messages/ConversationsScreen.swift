import DesignSystem
import ResonanceKit
import SwiftUI

/// Conversations (M4: live threads over the Firestore SDK, sending via the API).
struct ConversationsScreen: View {
    var body: some View {
        TabScreen(L10n.Messages.title) {
            Text(L10n.Messages.subtitle)
                .font(AppFonts.body(14))
                .foregroundStyle(Tokens.textMuted)
                .padding(.horizontal, 20)
            EmptyNote(L10n.Messages.empty)
                .padding(.horizontal, 20)
                .padding(.top, 16)
        }
    }
}
