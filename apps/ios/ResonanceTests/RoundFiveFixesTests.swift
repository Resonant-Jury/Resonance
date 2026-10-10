import DesignSystem
import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// A draft store whose server never answers until told: what the writer hands it is recorded at
/// once (Firestore keeps a write on the device from the moment it is made), and each write's
/// answer waits on the test.
@MainActor final class StuckDraftStore: DraftStore {
    enum Write: Equatable { case create(String, String), update(String, String), edit(String, String) }
    private(set) var writes: [Write] = []
    private var gates: [AckGate] = []
    private var made = 0

    func newDraftId() -> String {
        made += 1
        return "draft-\(made)"
    }

    func create(_ v: DraftValues, id: String, locale: String, referenceCardId: String?) -> IssuedWrite {
        writes.append(.create(id, v.title))
        return issued()
    }

    func update(_ id: String, _ v: DraftValues) -> IssuedWrite {
        writes.append(.update(id, v.title))
        return issued()
    }

    func saveEdit(_ id: String, _ v: DraftValues) -> IssuedWrite {
        writes.append(.edit(id, v.title))
        return issued()
    }

    func discardEdit(_ id: String) async throws {}

    /// Answers the oldest write still waiting.
    func answer(_ result: Result<Void, Error> = .success(())) {
        gates.first { $0.result == nil }?.open(result)
    }

    private func issued() -> IssuedWrite {
        let gate = AckGate()
        gates.append(gate)
        return IssuedWrite(answer: Task { try await gate.wait() })
    }
}

/// One write's answer from the server, given when the test says.
@MainActor final class AckGate {
    private(set) var result: Result<Void, Error>?
    private var waiting: CheckedContinuation<Void, Error>?

    func wait() async throws {
        if let result { return try result.get() }
        try await withCheckedThrowingContinuation { waiting = $0 }
    }

    func open(_ result: Result<Void, Error>) {
        self.result = result
        waiting?.resume(with: result)
        waiting = nil
    }
}

private struct Refused: Error {}

/// Leaving the writer never waits on the network to keep a draft (it once hung for minutes behind a
/// write the server never answered): each save is handed to the store at once — even behind one
/// still unanswered — and leaving waits for the server's yes only a moment.
@MainActor @Suite struct WriterSavingTests {
    private func model(_ store: StuckDraftStore) -> WriteModel {
        let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
        return WriteModel(drafts: store, writing: WritingAPI(client: ResonanceClient.make(configuration), configuration: configuration))
    }

    @Test func aDraftIsHandedOverAtOnceAndTheNextEditDoesNotWaitForTheFirstAnswer() async {
        let store = StuckDraftStore()
        let model = model(store)
        model.values.title = "A walk"
        model.store()
        #expect(store.writes == [.create("draft-1", "A walk")])
        #expect(model.draftId == "draft-1")
        #expect(!model.needsSave)
        // The server hasn't answered the create; the next edit goes to the store all the same.
        model.values.title = "A walk in the rain"
        model.store()
        #expect(store.writes == [.create("draft-1", "A walk"), .update("draft-1", "A walk in the rain")])
        // Nothing new: nothing written again.
        model.store()
        #expect(store.writes.count == 2)
        #expect(model.saveStatus == nil)
    }

    @Test func leavingWaitsForTheServerOnlyAMoment() async {
        let store = StuckDraftStore()
        let model = model(store)
        model.values.title = "Kept"
        model.store()
        let start = ContinuousClock.now
        let confirmed = await model.settled(within: .milliseconds(80))
        #expect(!confirmed)
        #expect(ContinuousClock.now - start < .seconds(2))
        // Once it answers, "Saved at …".
        store.answer()
        #expect(await model.settled(within: .seconds(2)))
        #expect(model.saveStatus != nil)
    }

    @Test func aRefusedCreateIsWrittenAgainAsANewDraft() async {
        let store = StuckDraftStore()
        let model = model(store)
        model.values.title = "Again"
        model.store()
        store.answer(.failure(Refused()))
        _ = await model.settled(within: .seconds(2))
        #expect(model.draftId == nil)
        #expect(model.needsSave)
        model.store()
        #expect(store.writes == [.create("draft-1", "Again"), .create("draft-2", "Again")])
    }

    @Test func firstAnswerGivesUpOnWorkThatNeverEnds() async {
        let never = await firstAnswer(within: .milliseconds(50)) { () async -> Bool in
            await withCheckedContinuation { (_: CheckedContinuation<Void, Never>) in }
            return true
        }
        #expect(never == nil)
        #expect(await firstAnswer(within: .seconds(2)) { true } == true)
    }
}

/// Reading progress on the card page (design §3): nothing while the story's top is below the bar's
/// line, all once its bottom reaches the screen's foot, nothing drawn when it fits on one screen.
@Suite struct ReadingProgressTests {
    @Test func followsTheStoryBlockAlone() {
        // The story from 400 to 2400 in the page, 700 showing.
        let p = { (top: CGFloat) in ReadingProgress.of(storyTop: 400, storyHeight: 2000, visibleTop: top, visibleHeight: 700) }
        #expect(p(0) == 0)
        #expect(p(400) == 0)
        #expect(p(400 + 650) == 0.5)
        #expect(p(400 + 1300) == 1)
        #expect(p(5000) == 1)
        // A story that fits: no line at all.
        #expect(ReadingProgress.of(storyTop: 400, storyHeight: 600, visibleTop: 0, visibleHeight: 700) == nil)
        #expect(ReadingProgress.of(storyTop: 0, storyHeight: 600, visibleTop: 0, visibleHeight: 0) == nil)
    }
}

/// The story editor's toolbar wraps on a phone: a group's rule never starts or ends a row.
@Suite struct ToolbarRulesTests {
    @Test func aRuleAtARowsEdgeIsOnNoRow() {
        // Two words, a rule, three words, a rule, two wide ones (the toolbar's shape), 2 apart.
        let widths: [CGFloat] = [40, 40, 9, 40, 40, 40, 9, 80, 80]
        let rules = [false, false, true, false, false, false, true, false, false]
        // Room for the first seven: the second rule would end the row, so it goes, and the wide ones wrap.
        #expect(FlowRow.rows(widths: widths, rules: rules, maxWidth: 260, spacing: 2) == [[0, 1, 2, 3, 4, 5], [7, 8]])
        // Narrower: the first rule would begin the second row.
        #expect(FlowRow.rows(widths: widths, rules: rules, maxWidth: 85, spacing: 2) == [[0, 1], [3, 4], [5], [7], [8]])
        // Wide enough for all: every rule stays.
        #expect(FlowRow.rows(widths: widths, rules: rules, maxWidth: 1000, spacing: 2) == [Array(0..<9)])
    }
}

@MainActor @Suite struct SmallCopyFixesTests {
    @Test func thePhoneIsVerifiedOnlyWhenThereIsANumber() {
        #expect(AccountSettings.phoneLabel(nil) == L10n.Settings.Account.phone)
        #expect(AccountSettings.phoneLabel("") == L10n.Settings.Account.phone)
        #expect(AccountSettings.phoneLabel("+886912345678") == L10n.Settings.Account.phoneVerified)
        #expect(L10n.Settings.Account.phone != L10n.Settings.Account.phoneVerified)
    }
}

/// An anonymous card on its owner's shelf (design §13): the server names its author to its owner,
/// but the shelf shows the byline everyone else sees — no badge, no name.
@MainActor @Suite struct OwnerShelfAnonymousTests {
    @Test func anAnonymousCardOfYourOwnWearsTheAnonymousByline() {
        var mine = Fixture.card("a1", by: "ana")
        mine.anonymous = true
        #expect(mine.story.authorName == "ana")
        #expect(mine.publicStory.authorName == L10n.Card.anonymousAuthor)
        #expect(mine.publicStory.authorInitials == "·")
        #expect(mine.publicStory.authorImageURL == nil)
        // A named card is shown as it is.
        let named = Fixture.card("n1", by: "ana")
        #expect(named.publicStory.authorName == "ana")
    }
}
