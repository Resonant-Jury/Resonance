import DesignSystem
import ResonanceKit
import SwiftUI

/// Notifications (M2: live list over the Firestore SDK).
struct NotificationsScreen: View {
    var body: some View {
        TabScreen(L10n.App.Nav.notifications) {
            OrganicEmptyState(L10n.App.Notifications.empty)
        }
    }
}
