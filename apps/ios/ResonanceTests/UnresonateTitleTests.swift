import DesignSystem
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Taking a resonance back asks 「不再與〈title〉共振？」. The question never changes its words under
/// the reader: the title is there before it shows when the page or the session has it; otherwise
/// its heading keeps its line, unwritten, until the title is read (as on the web and Android).
@MainActor @Suite(.serialized) struct UnresonateTitleTests {
    @Test func aTitleAlreadyKnownIsThereFromTheStart() {
        var page = AnsweredTitle()
        page.open(page: "巷口那家二手書店", kept: "an older copy")
        #expect(!page.looking)
        #expect(page.heading == L10n.Me.Actions.unresonateConfirmTitle(title: "巷口那家二手書店"))

        var kept = AnsweredTitle()
        kept.open(page: nil, kept: "巷口那家二手書店")
        #expect(!kept.looking)
        #expect(kept.heading == L10n.Me.Actions.unresonateConfirmTitle(title: "巷口那家二手書店"))
    }

    @Test func otherwiseTheHeadingWaitsForItsTitle() {
        var title = AnsweredTitle()
        title.open(page: nil, kept: nil)
        // Held back meanwhile: what is drawn (unwritten) is never shown as the question's words.
        #expect(title.looking)
        title.found("巷口那家二手書店")
        #expect(!title.looking)
        #expect(title.heading == L10n.Me.Actions.unresonateConfirmTitle(title: "巷口那家二手書店"))
        // Asked again later: known now, so there at once.
        title.open(page: nil, kept: nil)
        #expect(!title.looking)
    }

    @Test func aTitleThatCantBeReadLeavesThePlainWords() {
        var title = AnsweredTitle()
        title.open(page: nil, kept: nil)
        title.found(nil)
        #expect(!title.looking)
        #expect(title.heading == L10n.Me.Actions.unresonate)
    }

    /// The question as the menu holds it, in a box a lookup's task can reach.
    @MainActor final class Question { var title = AnsweredTitle() }

    @Test func aLookupLeftBehindNeverSettlesTheQuestionOpenedAgain() async {
        let question = Question()
        question.title.open(page: nil, kept: nil)
        // Opened and closed at once: its lookup is cancelled while the read is on its way, and the read
        // then fails as cancelled.
        let gate = Gate<Bool>()
        let left = Task { await AnsweredTitle.lookUp({ _ = await gate.wait(); throw CancellationError() }) { question.title.found($0) } }
        left.cancel()
        // Opened again meanwhile, the title still not known: held back until its own lookup answers.
        question.title.open(page: nil, kept: nil)
        await gate.open(true)
        await left.value
        #expect(question.title.looking)
        await AnsweredTitle.lookUp({ "巷口那家二手書店" }) { question.title.found($0) }
        #expect(!question.title.looking)
        #expect(question.title.heading == L10n.Me.Actions.unresonateConfirmTitle(title: "巷口那家二手書店"))
    }

    @Test func aPendingHeadingKeepsItsLineButIsNeitherShownNorRead() async throws {
        func host(_ title: String, pending: Bool) throws -> (UIWindow, CGSize) {
            let content = OrganicConfirmContent(title: title, message: "這張卡片會留著。", cancelLabel: "保留", confirmLabel: "取消共振",
                                                titlePending: pending, onCancel: {}, onConfirm: {})
                .frame(width: 340)
            let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let window = UIWindow(windowScene: scene)
            window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
            let controller = UIHostingController(rootView: content)
            window.rootViewController = controller
            window.makeKeyAndVisible()
            return (window, controller.sizeThatFits(in: CGSize(width: 340, height: 800)))
        }
        // While the title is looked for, the menu hands the dialog the plain words (held back).
        var looking = AnsweredTitle()
        looking.open(page: nil, kept: nil)
        let short = L10n.Me.Actions.unresonateConfirmTitle(title: "書店")
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let (pendingWindow, pendingSize) = try host(looking.heading, pending: true)
        var headers: [String] = []
        _ = await eventually {
            let elements = AccessibilityOn.elements(in: pendingWindow)
            headers = elements.filter { $0.accessibilityTraits.contains(.header) }.compactMap(\.accessibilityLabel)
            return elements.contains { $0.accessibilityLabel == "保留" }
        }
        pendingWindow.isHidden = true
        #expect(!headers.contains(looking.heading))
        let (shownWindow, shownSize) = try host(short, pending: false)
        // Written once known, and read as the question's heading.
        #expect(await eventually {
            AccessibilityOn.elements(in: shownWindow).contains { $0.accessibilityLabel == short && $0.accessibilityTraits.contains(.header) }
        })
        shownWindow.isHidden = true
        // A title that fits its line arrives without moving anything: the held line is the same room.
        #expect(abs(pendingSize.height - shownSize.height) < 0.5)
        // One long enough to wrap grows the dialog once, by its extra line (as on the web and Android).
        let (longWindow, longSize) = try host(L10n.Me.Actions.unresonateConfirmTitle(title: "巷口那家二手書店的老闆娘"),
                                              pending: false)
        longWindow.isHidden = true
        #expect(longSize.height > shownSize.height + 15)
        #expect(longSize.height < shownSize.height + 40)
    }
}
