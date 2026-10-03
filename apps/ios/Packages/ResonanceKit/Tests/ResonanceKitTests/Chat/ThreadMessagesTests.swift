import Foundation
import Testing
@testable import ResonanceKit

/// What the thread draws while messages are on their way: the conversation first, then the
/// messages this person sent, each replaced in place — same position, same key — by its document
/// (the same cases as Android's ThreadMessagesTest).
@Suite struct ThreadMessagesTests {
    typealias History = MessageHistory<String>

    func doc(_ id: String, at: Double, sender: String = "bob", text: String? = nil) -> History.Entry {
        History.Entry(ChatMessage(id: id, senderId: sender, text: text ?? id, sentAt: Date(timeIntervalSince1970: at)), cursor: "cursor-\(id)")
    }

    func sending(_ clientId: String, at: Double, _ status: Outbox.Status = .queued, serverId: String? = nil, replyTo: ReplyQuote? = nil) -> Outbox.Outgoing {
        Outbox.Outgoing(clientId: clientId, senderId: "alice", text: "text of \(clientId)", replyTo: replyTo,
                        queuedAt: Date(timeIntervalSince1970: at), status: status, serverId: serverId)
    }

    @Test func whatIsOnItsWayComesAfterTheConversation() {
        var history = History()
        var thread = ThreadMessages()
        history.mergeWindow([doc("m1", at: 1), doc("m2", at: 2)])
        let list = thread.build(history, onItsWay: [sending("c1", at: 0.5), sending("c2", at: 0.6)])
        // Even sent "before" (a clock behind the server's): the thread is read downwards, the bottom is the latest thing you did.
        #expect(list.map(\.key) == ["m1", "m2", "c1", "c2"])
        #expect(list.map(\.delivery) == [.delivered, .delivered, .sending, .sending])
        #expect(list[2].text == "text of c1")
        #expect(list[2].senderId == "alice")
    }

    @Test func theDocumentTakesTheMessagesPlaceUnderTheSameKey() {
        var history = History()
        var thread = ThreadMessages()
        history.mergeWindow([doc("m1", at: 1)])
        #expect(thread.build(history, onItsWay: [sending("c1", at: 2, .sending)]).map(\.key) == ["m1", "c1"])

        // The server used the client id as the document's id (and the answer hasn't come yet).
        history.mergeWindow([doc("c1", at: 2.1, sender: "alice", text: "text of c1"), doc("m1", at: 1)])
        let after = thread.build(history, onItsWay: [sending("c1", at: 2, .sending)])
        #expect(after.map(\.key) == ["m1", "c1"])
        #expect(after[1].delivery == .delivered)
        #expect(after.filter { $0.text == "text of c1" }.count == 1)
    }

    @Test func aServerThatNamesTheDocumentItselfStillKeepsTheRowsKey() {
        var history = History()
        var thread = ThreadMessages()
        history.mergeWindow([doc("m1", at: 1)])
        // The answer arrived first: the outbox knows the document's id.
        let onItsWay = [sending("c1", at: 2, .sent, serverId: "server-1")]
        let before = thread.build(history, onItsWay: onItsWay)
        #expect(before.map(\.key) == ["m1", "c1"])
        #expect(before[1].delivery == .sent)

        history.mergeWindow([doc("server-1", at: 2.1, sender: "alice"), doc("m1", at: 1)])
        let after = thread.build(history, onItsWay: onItsWay)
        #expect(after.map(\.key) == ["m1", "c1"])
        #expect(after.map(\.id) == ["m1", "server-1"])
        // The key stays once the outbox has let go of the message.
        #expect(thread.build(history, onItsWay: []).map(\.key) == ["m1", "c1"])
    }

    @Test func aFailedMessageStaysWithItsReplyUntilItIsRetriedOrDiscarded() {
        var history = History()
        var thread = ThreadMessages()
        history.mergeWindow([doc("m1", at: 1)])
        let quote = ReplyQuote(id: "m1", senderId: "bob", text: "m1")
        let list = thread.build(history, onItsWay: [sending("c1", at: 2, .failed, replyTo: quote)])
        #expect(list[1].delivery == .failed)
        #expect(list[1].replyTo == quote)
        #expect(!list[1].canReply)
    }

    @Test func nothingOnItsWayIsTheHistoryAsItIs() {
        var history = History()
        var thread = ThreadMessages()
        history.mergeWindow([doc("m1", at: 1), doc("m2", at: 2)])
        #expect(thread.build(history, onItsWay: []) == history.messages)
    }

    @Test func clearForgetsTheKeysOfDocumentsWithIdsOfTheirOwn() {
        var history = History()
        var thread = ThreadMessages()
        history.mergeWindow([doc("server-1", at: 2, sender: "alice")])
        _ = thread.build(history, onItsWay: [sending("c1", at: 1.5, .sent, serverId: "server-1")])
        thread.clear()
        #expect(thread.build(history, onItsWay: []).map(\.key) == ["server-1"])
    }
}
