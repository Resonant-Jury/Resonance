import DesignSystem
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// A dialog's foot is right-aligned, the verb rightmost, its buttons a finger's height, and stacks
/// with the verb on top when the pair doesn't fit; while its action is on its way it dims as one
/// (0.6, the web's) and takes no tap. A refusal with nothing to choose is a notice with one way
/// out. A publish that fails says so in the app's words — and when the day's publishing is spent.
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
        #expect(refused == L10n.Write.PublishPanel.failed)
        #expect(refused != "The edit does not fit a card.")
        #expect(PublishFailure.message(URLError(.notConnectedToInternet)) == L10n.Write.PublishPanel.failed)
        #expect(PublishFailure.message(APIFailure.unexpected(status: 502)) == L10n.Write.PublishPanel.failed)
        // Saving a published card's changes that didn't go through: the changes weren't saved.
        #expect(PublishFailure.message(APIFailure.unexpected(status: 502), updating: true) == L10n.Native.saveError)
        #expect(PublishFailure.message(APIFailure(code: "not_found", message: "", status: 404), updating: true) == L10n.Card.NotFound.title)
    }

    @Test func aPublishPastTheDaysLimitSaysSoNotTryAgain() {
        // The publish route documents no 429: the generated client hands it over as an unexpected status.
        #expect(PublishFailure.message(APIFailure.unexpected(status: 429)) == L10n.Write.PublishPanel.rateLimited)
        #expect(PublishFailure.message(APIFailure(code: "rate_limited", message: "Too many.", status: 429)) == L10n.Write.PublishPanel.rateLimited)
        #expect(PublishFailure.message(APIFailure.unexpected(status: 429), updating: true) == L10n.Write.PublishPanel.rateLimited)
        #expect(L10n.Write.PublishPanel.rateLimited != L10n.Write.PublishPanel.failed)
    }

    /// `view` drawn at 2x on nothing, as RGBA bytes.
    private func bitmap(_ view: some View) throws -> (pixels: [UInt8], width: Int, height: Int) {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        let image = try #require(renderer.cgImage)
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = try #require(CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                             space: CGColorSpaceCreateDeviceRGB(),
                                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return (pixels, width, height)
    }

    /// The most opaque thing drawn, 0…1.
    private func strongest(_ view: some View) throws -> Double {
        let (pixels, width, height) = try bitmap(view)
        var most: UInt8 = 0
        for i in 0..<(width * height) { most = max(most, pixels[i * 4 + 3]) }
        return Double(most) / 255
    }

    func busyFoot(_ busy: Bool) -> some View {
        ModalActions(busy: busy) {
            OrganicButton("Cancel", variant: .tonal, size: .sm) {}
        } verb: {
            OrganicButton("Publish", variant: .solid, size: .sm) {}
        }
        .frame(width: 320)
    }

    @Test func aBusyFootKeepsTheVerbsColourAndFadesTheWayOut() throws {
        #expect(try strongest(busyFoot(false)) > 0.98)
        // Round 5 B6: the verb at work keeps its full face (its loader says it is busy)…
        #expect(try strongest(busyFoot(true)) > 0.98)
        // …while the way out takes the disabled fade.
        let way = ModalActions(busy: true) {
            OrganicButton("Cancel", variant: .tonal, size: .sm) {}
        } verb: {
            EmptyView()
        }
        .frame(width: 320)
        // (Its layers are faded each, not as one: the words over the face add up a little past 0.45.)
        let faded = try strongest(way)
        #expect(faded < 0.8, "drawn at \(faded)")
        #expect(ModalMetrics.disabledOpacity == 0.45)
    }

    /// The accessibility elements of `view` shown in a window, once VoiceOver's tree has them.
    private func elements(_ view: some View, until ready: @escaping ([NSObject]) -> Bool) async throws -> (UIWindow, [NSObject]) {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.rootViewController = UIHostingController(rootView: VStack { view; Spacer() })
        window.makeKeyAndVisible()
        var found: [NSObject] = []
        _ = await eventually {
            found = AccessibilityOn.elements(in: window)
            return ready(found)
        }
        return (window, found)
    }

    @MainActor final class Taps {
        var cancel = 0
        var verb = 0
    }

    @Test func aBusyFootTakesNoTapVoiceOversIncluded() async throws {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        for busy in [false, true] {
            let taps = Taps()
            let foot = ModalActions(busy: busy) {
                OrganicButton("Keep it", variant: .tonal, size: .sm) { taps.cancel += 1 }
            } verb: {
                OrganicButton("Delete it", variant: .danger, size: .sm) { taps.verb += 1 }
            }
            let (window, found) = try await elements(foot) { all in all.contains { $0.accessibilityLabel == "Delete it" } }
            defer { window.isHidden = true }
            for label in ["Keep it", "Delete it"] {
                let button = try #require(found.first { $0.accessibilityLabel == label }, "\(label) is there to VoiceOver")
                _ = button.accessibilityActivate()
            }
            _ = await eventually(within: .milliseconds(300)) { taps.cancel + taps.verb == 2 }
            #expect(taps.cancel == (busy ? 0 : 1), "busy: \(busy)")
            #expect(taps.verb == (busy ? 0 : 1), "busy: \(busy)")
        }
    }

    @Test func aRefusalIsANoticeWithOneWayOut() async throws {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let taps = Taps()
        let notice = OrganicNoticeContent(title: L10n.Me.Actions.makePrivate, message: L10n.Safety.actionError,
                                          closeLabel: L10n.Safety.Report.close) { taps.cancel += 1 }
        let (window, found) = try await elements(notice) { all in
            all.contains { $0.accessibilityLabel == L10n.Safety.Report.close }
        }
        defer { window.isHidden = true }
        // The heading and what happened, then the close: no retry (the menu is there to try again from).
        #expect(found.contains { $0.accessibilityLabel == L10n.Me.Actions.makePrivate })
        let buttons = found.filter { $0.accessibilityTraits.contains(.button) }
        #expect(buttons.map(\.accessibilityLabel) == [L10n.Safety.Report.close])
        #expect(!found.contains { $0.accessibilityLabel == L10n.Native.retry })
        _ = try #require(buttons.first).accessibilityActivate()
        #expect(await eventually { taps.cancel == 1 })
    }
}
