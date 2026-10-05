import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// A bell row: who did what, then a note's own words under it. The unread dot ends the first line,
/// beside who it is from — on a note's row too, never after the note's words (the web's
/// NotificationBell and Android's NotificationRow put it there).
@MainActor @Suite(.serialized) struct NotificationRowTests {
    /// The row's lines as they are read, top to bottom.
    private func lines(_ row: NotificationRowLabel) async throws -> [String] {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.rootViewController = UIHostingController(rootView: VStack { row; Spacer() })
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        var found: [String] = []
        _ = await eventually {
            found = AccessibilityOn.elements(in: window).compactMap(\.accessibilityLabel).filter { !$0.isEmpty }
            return found.count >= (row.preview == nil ? 1 : 2)
        }
        return found
    }

    @Test func anUnreadNotesDotEndsItsFirstLineNotTheNotesWords() async throws {
        let found = try await lines(NotificationRowLabel(text: "Mei sent you a little note", preview: "謝謝你寫這篇。", unread: true))
        #expect(found.count == 2)
        #expect(found.first?.hasPrefix("Mei sent you a little note") == true)
        #expect(found.first?.hasSuffix("\u{25CF}") == true)
        #expect(found.last == "「謝謝你寫這篇。」")
    }

    @Test func aReadRowHasNoDotAndOtherRowsEndInIt() async throws {
        let read = try await lines(NotificationRowLabel(text: "Mei sent you a little note", preview: "謝謝你寫這篇。", unread: false))
        #expect(read == ["Mei sent you a little note", "「謝謝你寫這篇。」"])
        let message = try await lines(NotificationRowLabel(text: "Mei sent you a message", preview: nil, unread: true))
        #expect(message.count == 1)
        #expect(message.first?.hasSuffix("\u{25CF}") == true)
    }
}
