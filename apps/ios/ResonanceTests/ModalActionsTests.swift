import DesignSystem
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// A dialog's foot is right-aligned, the verb rightmost, its buttons a finger's height, and stacks
/// with the verb on top when the pair doesn't fit; a publish that fails says so in the app's words.
@MainActor @Suite struct ModalActionsTests {
    func size<V: View>(_ view: V, width: CGFloat) -> CGSize {
        UIHostingController(rootView: view.frame(width: width)).sizeThatFits(in: CGSize(width: width, height: 1000))
    }

    func foot(_ cancel: String, _ verb: String) -> some View {
        ModalActions {
            OrganicButton(cancel, variant: .tonal, size: .sm) {}
        } verb: {
            OrganicButton(verb, variant: .danger, size: .sm) {}
        }
    }

    @Test func aDialogsFootStacksTheVerbOverTheWayOutWhenThePairDoesNotFit() {
        let wide = size(foot("Keep my account", "Delete account"), width: 360)
        let narrow = size(foot("Keep my account", "Delete account"), width: 220)
        // One row where it fits; two (no label squeezed onto two lines) where it doesn't.
        #expect(wide.height >= ModalMetrics.minButtonHeight && wide.height < ModalMetrics.minButtonHeight * 1.5)
        #expect(narrow.height >= ModalMetrics.minButtonHeight * 2)
        #expect(narrow.height < ModalMetrics.minButtonHeight * 2.5)
    }

    @Test func aDialogsButtonsAreAFingersHeight() {
        let lone = UIHostingController(rootView: OrganicButton("OK", variant: .tonal, size: .sm) {}.fixedSize())
            .sizeThatFits(in: CGSize(width: 400, height: 400))
        #expect(lone.height < ModalMetrics.minButtonHeight)
        let inFoot = size(foot("Cancel", "OK"), width: 360)
        #expect(inFoot.height >= ModalMetrics.minButtonHeight)
    }

    @Test func aPublishThatFailsSaysSoInTheAppsWordsNeverTheServers() {
        let gone = PublishFailure.message(APIFailure(code: "not_found", message: "No such card.", status: 404))
        #expect(gone == L10n.Card.NotFound.title)
        let refused = PublishFailure.message(APIFailure(code: "invalid_request", message: "The edit does not fit a card.", status: 400))
        #expect(refused == L10n.Native.saveError)
        #expect(refused != "The edit does not fit a card.")
        #expect(PublishFailure.message(URLError(.notConnectedToInternet)) == L10n.Native.saveError)
        #expect(PublishFailure.message(APIFailure.unexpected(status: 502)) == L10n.Native.saveError)
    }
}
