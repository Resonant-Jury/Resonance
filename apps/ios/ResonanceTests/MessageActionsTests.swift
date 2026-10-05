import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// A message's press-and-hold menu reaches VoiceOver as actions. Reply is among them only where
/// the menu and the swipe offer it — a thread with a composer to answer from — never as an action
/// that does nothing (a thread waiting for an answer to one's note, or with nothing to write).
@MainActor @Suite(.serialized) struct MessageActionsTests {
    private func actionNames(_ actions: MessageActions) async throws -> [String] {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.rootViewController = UIHostingController(rootView: Text(verbatim: "A message").modifier(actions))
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        var names: [String] = []
        _ = await eventually {
            names = AccessibilityOn.elements(in: window).first { $0.accessibilityLabel == "A message" }
                .map { ($0.accessibilityCustomActions ?? []).map(\.name) } ?? []
            return names.contains(L10n.Messages.moreMenu)
        }
        return names
    }

    @Test func aMessageThatCanBeAnsweredOffersReply() async throws {
        let names = try await actionNames(MessageActions(reply: {}, links: [("Open link: example.com", {})], more: {}))
        #expect(Set(names) == [L10n.Messages.reply, "Open link: example.com", L10n.Messages.moreMenu])
        #expect(names.count == 3)
    }

    @Test func whereNothingCanBeWrittenThereIsNoReplyToOffer() async throws {
        let names = try await actionNames(MessageActions(reply: nil, links: [("Open link: example.com", {})], more: {}))
        #expect(Set(names) == ["Open link: example.com", L10n.Messages.moreMenu])
        #expect(!names.contains(L10n.Messages.reply))
    }
}
