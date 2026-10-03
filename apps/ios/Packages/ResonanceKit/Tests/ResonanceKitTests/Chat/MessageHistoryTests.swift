import Foundation
import Testing
@testable import ResonanceKit

/// What the thread holds of a conversation: the live window (the newest few) merged with older
/// pages read on demand, ordered by send time, with the cursor of the oldest message to read the
/// next page from (the same cases as Android's MessageHistoryTest).
@Suite struct MessageHistoryTests {
    typealias History = MessageHistory<String>

    func message(_ n: Int, sender: String = "alice") -> ChatMessage {
        ChatMessage(id: String(format: "m%03d", n), senderId: sender, text: "m\(n)", sentAt: Date(timeIntervalSince1970: Double(n)))
    }
    func entries(_ numbers: some Sequence<Int>) -> [History.Entry] { numbers.map { History.Entry(message($0), cursor: "cursor-\($0)") } }
    func ids(_ history: History) -> [String] { history.messages.map(\.id) }
    func names(_ numbers: some Sequence<Int>) -> [String] { numbers.map { String(format: "m%03d", $0) } }

    @Test func theWindowIsHeldOldestFirstWhateverOrderItArrivesIn() {
        var history = History(liveLimit: 3)
        // The listener's query is newest-first.
        let merged = history.mergeWindow(entries([5, 4, 3]))
        #expect(merged == .changed)
        #expect(ids(history) == ["m003", "m004", "m005"])
        #expect(history.oldestCursor == "cursor-3")
    }

    @Test func messagesThatSlideOutOfTheWindowStay() {
        var history = History(liveLimit: 3)
        history.mergeWindow(entries([5, 4, 3]))
        // Two new messages push the oldest two out of the newest-three window.
        history.mergeWindow(entries([7, 6, 5]))
        #expect(ids(history) == names(3...7))
        // The next older page still starts after the oldest held.
        #expect(history.oldestCursor == "cursor-3")
        #expect(history.hasOlder)
    }

    @Test func anOlderPageGoesBeforeAndMovesTheCursor() {
        var history = History(liveLimit: 3)
        history.mergeWindow(entries([10, 9, 8]))
        let paged = history.mergePage(entries([7, 6, 5]), limit: 3)
        #expect(paged)
        #expect(ids(history) == names(5...10))
        #expect(history.oldestCursor == "cursor-5")
        #expect(history.hasOlder)
        // A short page was the last one.
        let last = history.mergePage(entries([4, 3]), limit: 3)
        #expect(last)
        #expect(history.oldestCursor == "cursor-3")
        #expect(!history.hasOlder)
        // And the window moving on afterwards doesn't say there is more.
        history.mergeWindow(entries([11, 10, 9]))
        #expect(!history.hasOlder)
        #expect(history.count == 9)
    }

    @Test func aWindowShorterThanTheLimitFromTheServerIsTheWholeConversation() {
        var history = History(liveLimit: 3)
        history.mergeWindow(entries([2, 1]))
        #expect(!history.hasOlder)
        history.mergeWindow(entries([3, 2, 1]))
        #expect(history.hasOlder)
    }

    @Test func aCachedWindowCantSayThereIsNothingOlder() {
        var history = History(liveLimit: 3)
        history.mergeWindow(entries([2, 1]), authoritative: false)
        #expect(history.hasOlder)
        // The server's answer settles it.
        let merged = history.mergeWindow(entries([2, 1]), authoritative: true)
        #expect(merged == .unchanged)
        #expect(!history.hasOlder)
    }

    @Test func anEmptyConversationHasNothingOlder() {
        var history = History(liveLimit: 3)
        let merged = history.mergeWindow([])
        #expect(merged == .unchanged)
        #expect(!history.hasOlder)
        #expect(history.oldestCursor == nil)
        #expect(history.isEmpty)
    }

    @Test func anUpdatedMessageReplacesItself() throws {
        var history = History(liveLimit: 3)
        history.mergeWindow(entries([5, 4, 3]))
        let preview = LinkPreview(link: try #require(ChatLinks.parse("https://example.com/")), title: "Example")
        var updated = message(4)
        updated.preview = preview
        let window = [History.Entry(message(5), cursor: "cursor-5"), History.Entry(updated, cursor: "cursor-4"), History.Entry(message(3), cursor: "cursor-3")]
        let merged = history.mergeWindow(window)
        #expect(merged == .changed)
        #expect(history.count == 3)
        #expect(history["m004"]?.preview == preview)
        // The same window again changes nothing.
        let again = history.mergeWindow(window)
        #expect(again == .unchanged)
    }

    @Test func theOldestMessagesNewSnapshotRefreshesTheCursor() {
        var history = History(liveLimit: 3)
        history.mergeWindow(entries([5, 4, 3]))
        history.mergeWindow([History.Entry(message(5), cursor: "c5"), History.Entry(message(4), cursor: "c4"), History.Entry(message(3), cursor: "c3-again")])
        #expect(history.oldestCursor == "c3-again")
    }

    @Test func messagesSentTogetherKeepAStableOrderById() {
        var history = History(liveLimit: 5)
        let at = Date(timeIntervalSince1970: 5)
        history.mergeWindow(["b", "c", "a"].map { History.Entry(ChatMessage(id: $0, senderId: "alice", text: $0, sentAt: at), cursor: $0) })
        #expect(ids(history) == ["a", "b", "c"])
        #expect(history.oldestCursor == "a")
    }

    @Test func aWindowThatSharesNothingStartsTheHistoryAfresh() {
        var history = History(liveLimit: 3)
        history.mergeWindow(entries([5, 4, 3]))
        history.mergePage(entries([2, 1]), limit: 2)
        // The listener was away while the thread moved far past what was held: there would be a gap.
        let merged = history.mergeWindow(entries([40, 39, 38]))
        #expect(merged == .restarted)
        #expect(ids(history) == names(38...40))
        #expect(history.oldestCursor == "cursor-38")
        #expect(history.hasOlder)
    }

    @Test func clearForgetsEverything() {
        var history = History(liveLimit: 3)
        history.mergeWindow(entries([5, 4, 3]))
        history.clear()
        #expect(history.messages.isEmpty)
        #expect(history.oldestCursor == nil)
        #expect(!history.hasOlder)
        #expect(!history.contains("m003"))
    }

    @Test func fiftyIsTheDefaultWindow() {
        var history = History()
        history.mergeWindow(entries((11...60).reversed()))
        #expect(history.count == 50)
        #expect(history.hasOlder)
    }
}
