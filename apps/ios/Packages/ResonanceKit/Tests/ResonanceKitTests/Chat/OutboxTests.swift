import Foundation
import Testing
@testable import ResonanceKit

/// Sending never holds the composer: messages queue at once and go out in order, one at a time,
/// under client ids that make a resend harmless; a failure keeps its place and its id for the
/// retry (the same cases as Android's OutboxTest).
@MainActor @Suite struct OutboxTests {
    typealias Outgoing = Outbox.Outgoing

    struct Offline: Error {}

    func out(_ text: String, id: String? = nil) -> Outgoing {
        Outgoing(clientId: id ?? "id-\(text)", senderId: "alice", text: text, queuedAt: Date(timeIntervalSince1970: 1))
    }

    /// Waits until the outbox's entries pass `check` (or fails the test after a while).
    func until(_ box: Outbox, _ check: ([Outgoing]) -> Bool, sourceLocation: SourceLocation = #_sourceLocation) async {
        let end = ContinuousClock.now.advanced(by: .seconds(5))
        while !check(box.entries) {
            guard ContinuousClock.now < end else {
                Issue.record("Timed out with \(box.entries.map { "\($0.clientId):\($0.status)" })", sourceLocation: sourceLocation)
                return
            }
            try? await Task.sleep(for: .milliseconds(2))
        }
    }

    func statuses(_ box: Outbox) -> [Outbox.Status] { box.entries.map(\.status) }

    @Test func messagesGoOutInOrderOneAtATime() async {
        let log = Log()
        let gates = ["a": Gate(), "b": Gate(), "c": Gate()]
        let box = Outbox { m in
            log.inFlight += 1
            log.most = max(log.most, log.inFlight)
            await gates[m.text]!.wait()
            log.tries.append(m.clientId)
            log.inFlight -= 1
            return "doc-\(m.text)"
        }
        // Typed and sent back to back, the first still on its way.
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        box.enqueue(out("c"))
        #expect(statuses(box) == [.queued, .queued, .queued])
        await until(box) { $0.first?.status == .sending }
        #expect(statuses(box) == [.sending, .queued, .queued])

        gates["a"]!.open()
        await until(box) { $0[0].status == .sent && $0[1].status == .sending }
        gates["b"]!.open()
        gates["c"]!.open()
        await until(box) { $0.allSatisfy { $0.status == .sent } }

        #expect(log.tries == ["id-a", "id-b", "id-c"])
        #expect(log.most == 1)
        #expect(box.entries.map(\.serverId) == ["doc-a", "doc-b", "doc-c"])
        box.clear()
    }

    @Test func aSentMessageStaysUntilTheConversationShowsIt() async {
        let box = Outbox { _ in "doc" }
        box.enqueue(out("a"))
        await until(box) { $0.first?.status == .sent }
        // The server answered; the document hasn't reached the listener yet.
        #expect(box.entries.count == 1)
        box.reconcile { $0.serverId == "other" }
        #expect(box.entries.count == 1)
        box.reconcile { $0.serverId == "doc" }
        #expect(box.entries.isEmpty)
    }

    @Test func theMessagesToSendAreWhatTheComposerHeld() async throws {
        let log = Log()
        let box = Outbox { m in
            log.sent.append(m)
            return "d"
        }
        let reply = ReplyQuote(id: "m0", senderId: "bob", text: "shall we?")
        box.enqueue(Outgoing(clientId: "id-a", senderId: "alice", text: "a", cardRef: "walk", noteRef: .init(cardId: "walk", noteId: "n1"),
                             replyTo: reply, queuedAt: Date(timeIntervalSince1970: 1)))
        await until(box) { $0.first?.status == .sent }
        let sent = try #require(log.sent.first)
        #expect(sent.cardRef == "walk" && sent.replyTo == reply && sent.noteRef == .init(cardId: "walk", noteId: "n1"))
        // On the thread it draws as a delivered message that can't be answered yet.
        let drawn = try #require(box.entries.first).message
        #expect(drawn.delivery == .sent)
        #expect(drawn.replyTo == reply)
        #expect(drawn.id == "id-a" && drawn.key == "id-a")
        #expect(!drawn.canReply)
    }

    @Test func aFailureThatWillPassStopsTheLineAndARetryKeepsTheOrderAndTheIds() async {
        let log = Log()
        log.offline = true
        let box = Outbox { m in
            log.tries.append(m.clientId)
            if log.offline { throw Offline() }
            return "doc-\(m.clientId)"
        }
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        await until(box) { $0.allSatisfy { $0.status == .failed } }
        // The second never tried to overtake the first.
        #expect(log.tries == ["id-a"])

        // Another written while offline puts the stopped line back first: the first is tried again, never the new one ahead of it.
        box.enqueue(out("c"))
        await until(box) { $0.count == 3 && $0.allSatisfy { $0.status == .failed } }
        #expect(log.tries == ["id-a", "id-a"])

        log.offline = false
        log.tries = []
        box.retryFailed()
        await until(box) { $0.allSatisfy { $0.status == .sent } }
        // Back in the order they were written, with the ids they were written under.
        #expect(log.tries == ["id-a", "id-b", "id-c"])
        #expect(box.entries.map(\.serverId) == ["doc-id-a", "doc-id-b", "doc-id-c"])
    }

    @Test func writingAgainAfterAFailureSendsTheStoppedLineFirst() async {
        let log = Log()
        log.offline = true
        let box = Outbox { m in
            log.tries.append(m.clientId)
            if log.offline { throw Offline() }
            return "doc-\(m.clientId)"
        }
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        await until(box) { $0.allSatisfy { $0.status == .failed } }

        // Back online, the person simply writes on: what they wrote earlier reaches the other person first.
        log.offline = false
        log.tries = []
        box.enqueue(out("c"))
        await until(box) { $0.count == 3 && $0.allSatisfy { $0.status == .sent } }
        #expect(log.tries == ["id-a", "id-b", "id-c"])
    }

    @Test func retryingOneMessageSendsTheOnesThatStoppedBeforeItFirstAndLeavesTheLaterOnesAlone() async {
        let log = Log()
        log.offline = true
        let box = Outbox { m in
            log.tries.append(m.clientId)
            if log.offline { throw Offline() }
            return "doc-\(m.clientId)"
        }
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        box.enqueue(out("c"))
        await until(box) { $0.allSatisfy { $0.status == .failed } }
        log.offline = false
        log.tries = []

        // "b" can't overtake "a", which the same outage stopped; "c" waits for its own retry.
        box.retry("id-b")
        await until(box) { $0[0].status == .sent && $0[1].status == .sent }
        #expect(log.tries == ["id-a", "id-b"])
        #expect(statuses(box) == [.sent, .sent, .failed])

        box.retry("id-c")
        await until(box) { $0.allSatisfy { $0.status == .sent } }
        #expect(log.tries == ["id-a", "id-b", "id-c"])
    }

    @Test func retryingTheFirstMessageLeavesTheOnesBehindIt() async {
        let log = Log()
        log.offline = true
        let box = Outbox { m in
            if log.offline { throw Offline() }
            return "doc-\(m.clientId)"
        }
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        await until(box) { $0.allSatisfy { $0.status == .failed } }
        log.offline = false
        box.retry("id-a")
        await until(box) { $0.first?.status == .sent }
        #expect(statuses(box) == [.sent, .failed])
        // Only a failed message can be retried: this one is on its way already, that one isn't here.
        box.retry("id-a")
        box.retry("nobody")
        #expect(statuses(box) == [.sent, .failed])
    }

    @Test func aRefusedMessageIsNoReasonToSendTheLaterRetryAgain() async {
        let log = Log()
        log.offline = true
        let box = Outbox { m in
            log.tries.append(m.clientId)
            if m.text == "bad", log.offline { throw APIFailure(code: "blocked", message: "no", status: 403) }
            if m.text == "b", log.offline { throw Offline() }
            return "doc-\(m.clientId)"
        }
        box.enqueue(out("bad"))
        box.enqueue(out("b"))
        await until(box) { $0.allSatisfy { $0.status == .failed } }
        #expect(box.entries.map(\.refused) == [true, false])
        log.offline = false
        log.tries = []
        // "b" failed on its own account; the refused one before it isn't sent along.
        box.retry("id-b")
        await until(box) { $0[1].status == .sent }
        #expect(log.tries == ["id-b"])
        #expect(box.entries[0].status == .failed)
        // Its own retry goes through as the server now allows it.
        box.retry("id-bad")
        await until(box) { $0.allSatisfy { $0.status == .sent } }
    }

    @Test func aRefusalOfOneMessageDoesntStopTheOthers() async {
        let box = Outbox { m in
            if m.text == "bad" { throw APIFailure(code: "invalid_request", message: "No such message to reply to.", status: 400) }
            return "doc-\(m.text)"
        }
        box.enqueue(out("a"))
        box.enqueue(out("bad"))
        box.enqueue(out("c"))
        await until(box) { $0.allSatisfy { $0.status != .queued && $0.status != .sending } }
        #expect(box.entries.map(\.clientId) == ["id-a", "id-bad", "id-c"])
        #expect(statuses(box) == [.sent, .failed, .sent])
    }

    @Test func whatTheServerSaysNoToAndWhatWillPass() {
        #expect(Outbox.refusedByServer(APIFailure(code: "blocked", message: "no", status: 403)))
        #expect(Outbox.refusedByServer(APIFailure(code: "invalid_request", message: "no", status: 400)))
        #expect(Outbox.refusedByServer(APIFailure(code: "not_found", message: "no", status: 404)))
        #expect(!Outbox.refusedByServer(APIFailure(code: "rate_limited", message: "later", status: 429)))
        #expect(!Outbox.refusedByServer(APIFailure(code: "unauthenticated", message: "sign in", status: 401)))
        #expect(!Outbox.refusedByServer(APIFailure(code: "internal", message: "oops", status: 500)))
        #expect(!Outbox.refusedByServer(APIFailure(code: "unexpected", message: "?", status: nil)))
        #expect(!Outbox.refusedByServer(URLError(.notConnectedToInternet)))
        #expect(!Outbox.refusedByServer(Offline()))
    }

    @Test func onlyAFailedMessageCanBeDiscarded() async {
        let gate = Gate()
        let box = Outbox { m in
            if m.text == "bad" { throw APIFailure(code: "blocked", message: "no", status: 403) }
            await gate.wait()
            return "doc"
        }
        box.enqueue(out("bad"))
        box.enqueue(out("a"))
        await until(box) { $0.first?.status == .failed && $0.last?.status == .sending }
        box.discard("id-a")
        #expect(box.entries.count == 2)
        box.discard("id-bad")
        #expect(box.entries.map(\.clientId) == ["id-a"])
        gate.open()
        await until(box) { $0.first?.status == .sent }
    }

    @Test func aMessageTheConversationAlreadyShowsDropsOutEvenIfItsAnswerNeverCame() async {
        let gate = Gate()
        let box = Outbox { _ in
            await gate.wait()
            return "doc"
        }
        box.enqueue(out("a"))
        box.enqueue(out("b"))
        await until(box) { $0.first?.status == .sending }
        // The answer to "a" was lost, but its document arrived: it stops being drawn twice.
        box.reconcile { $0.clientId == "id-a" }
        #expect(box.entries.map(\.clientId) == ["id-b"])
        gate.open()
        // "b" still goes out; the finished "a" finds nothing to update and does no harm.
        await until(box) { $0.count == 1 && $0[0].status == .sent }
    }

    @Test func clientIdsAreTwentyLettersAndDigits() throws {
        let ids = (0..<50).map { _ in Outbox.newClientId() }
        let contract = try Regex("^[A-Za-z0-9_-]{16,64}$")
        #expect(ids.allSatisfy { $0.count == 20 && $0.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) } })
        #expect(Set(ids).count == 50)
        #expect(ids.allSatisfy { $0.wholeMatch(of: contract) != nil })
    }

    @Test func clearForgetsEverythingAndStopsSending() async {
        let gate = Gate()
        let box = Outbox { _ in
            await gate.wait()
            return "doc"
        }
        box.enqueue(out("a"))
        await until(box) { $0.first?.status == .sending }
        box.clear()
        #expect(box.entries.isEmpty)
        // A message written after it goes out as usual; the cleared one's late answer changes nothing.
        gate.open()
        box.enqueue(out("b"))
        await until(box) { $0.first?.status == .sent }
        try? await Task.sleep(for: .milliseconds(20))
        #expect(box.entries.map(\.clientId) == ["id-b"])
    }

    @Test func aWatcherFollowsEveryChangeWhileItLives() async {
        let box = Outbox { _ in "doc" }
        var owner: Log? = Log()
        let seen = Log()
        box.watch(by: owner!) { entries in seen.counts.append(entries.count) }
        box.enqueue(out("a"))
        await until(box) { $0.first?.status == .sent }
        #expect(seen.counts.first == 1)
        let before = seen.counts.count
        // Gone (the screen closed): it hears nothing more.
        owner = nil
        box.reconcile { _ in true }
        #expect(seen.counts.count == before)
        // And one that stops watching on purpose hears nothing either.
        let other = Log()
        box.watch(by: other) { _ in seen.counts.append(-1) }
        box.unwatch(other)
        box.enqueue(out("b"))
        #expect(!seen.counts.contains(-1))
        box.clear()
    }
}

/// What a test's stand-in for the server saw.
@MainActor final class Log {
    var tries: [String] = []
    var sent: [Outbox.Outgoing] = []
    var counts: [Int] = []
    var offline = false
    var inFlight = 0
    var most = 0
}

/// A send that waits for the test to let it through.
@MainActor final class Gate {
    private var isOpen = false
    private var waiting: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiting.append($0) }
    }

    func open() {
        isOpen = true
        waiting.forEach { $0.resume() }
        waiting = []
    }
}
