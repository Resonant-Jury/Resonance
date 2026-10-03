import Foundation
import Observation

/// A conversation's messages on their way out, so that sending never holds the composer: a
/// message is queued the moment it is written and the field is free again. One worker sends the
/// queue in order, one at a time, each under its own client id (which the server makes the
/// message's document id, so sending it again after a lost answer finds the message instead of
/// writing a second one). The twin of Android's `Outbox`.
///
/// A message is `queued`, `sending` (in flight), `sent` (the server took it — it stays until the
/// conversation's listener shows the document, see `reconcile`) or `failed`. A failure that the
/// network or the server's trouble caused (offline, a timeout, a 5xx, too many requests) stops
/// the line: everything queued behind it fails with it, so nothing overtakes it; `retry` of one
/// of them sends it after the ones written before it that stopped with it, and `retryFailed` puts
/// them all back in their order. A refusal of the message itself (a 4xx: blocked, no such message
/// to reply to) fails only that message — the others don't depend on it, nor does its retry
/// depend on them.
///
/// It belongs to the conversation, not to the screen: the app keeps one per conversation for as
/// long as the person is signed in, so a send carries on while the thread is covered by a profile
/// or left, and a failure is still there to retry when they come back. `deliver` does the sending.
@MainActor @Observable
public final class Outbox {
    public enum Status: Equatable, Sendable { case queued, sending, sent, failed }

    /// A message from this person: what the composer held when they sent it.
    public struct Outgoing: Equatable, Sendable {
        public let clientId: String
        public let senderId: String
        public let text: String
        public let cardRef: String?
        public let noteRef: MessagingAPI.NoteRef?
        /// The message it answers; the server makes its own snapshot of it.
        public let replyTo: ReplyQuote?
        public let queuedAt: Date
        public var status: Status
        /// The document id the server answered with (once `sent`); the client id, from a server that uses it.
        public var serverId: String?
        /// `failed` because the server said no to this message itself, not because the line stopped.
        public var refused: Bool

        public init(clientId: String, senderId: String, text: String, cardRef: String? = nil, noteRef: MessagingAPI.NoteRef? = nil,
                    replyTo: ReplyQuote? = nil, queuedAt: Date = Date(), status: Status = .queued, serverId: String? = nil, refused: Bool = false) {
            self.clientId = clientId
            self.senderId = senderId
            self.text = text
            self.cardRef = cardRef
            self.noteRef = noteRef
            self.replyTo = replyTo
            self.queuedAt = queuedAt
            self.status = status
            self.serverId = serverId
            self.refused = refused
        }

        /// The message as the thread draws it while it is on its way.
        public var message: ChatMessage {
            let delivery: Delivery = switch status {
            case .queued, .sending: .sending
            case .sent: .sent
            case .failed: .failed
            }
            return ChatMessage(id: clientId, senderId: senderId, text: text, sentAt: queuedAt, cardRef: cardRef, noteRef: noteRef,
                               replyTo: replyTo, delivery: delivery)
        }

        /// Whether the conversation's own document of this message is in `history`.
        public func isIn<Cursor>(_ history: MessageHistory<Cursor>) -> Bool {
            history.contains(clientId) || serverId.map(history.contains) == true
        }
    }

    /// Every message not yet shown by the conversation, in the order they were written.
    public private(set) var entries: [Outgoing] = []

    @ObservationIgnored private let deliver: @MainActor (Outgoing) async throws -> String
    @ObservationIgnored private let isRefusal: (Error) -> Bool
    @ObservationIgnored private var worker: Task<Void, Never>?
    /// Which life of the outbox a send belongs to (`clear` makes the one in flight void).
    @ObservationIgnored private var epoch = 0
    @ObservationIgnored private var watchers: [Watcher] = []

    /// `deliver` sends one message and returns the document id the server gave it; it throws on failure.
    public init(deliver: @escaping @MainActor (Outgoing) async throws -> String, isRefusal: @escaping (Error) -> Bool = Outbox.refusedByServer) {
        self.deliver = deliver
        self.isRefusal = isRefusal
    }

    /// Calls `change` with the entries each time they change, for as long as `owner` lives (or until
    /// `unwatch`). A screen keeps what it draws in step with this.
    public func watch(by owner: AnyObject, _ change: @escaping @MainActor ([Outgoing]) -> Void) {
        watchers.append(Watcher(owner: owner, change: change))
    }

    /// `owner` no longer follows the entries.
    public func unwatch(_ owner: AnyObject) {
        watchers.removeAll { $0.owner == nil || $0.owner === owner }
    }

    private struct Watcher {
        weak var owner: AnyObject?
        let change: @MainActor ([Outgoing]) -> Void
    }

    /// Queues `message` (its status is set to queued) and starts sending if no send is under way.
    /// Messages that failed with the line (offline, a server hiccup — not refused on their own
    /// account) go back in the queue ahead of it: writing again is the moment to try, and a new
    /// message must never reach the other person before the ones written earlier.
    public func enqueue(_ message: Outgoing) {
        var fresh = message
        fresh.status = .queued
        fresh.serverId = nil
        fresh.refused = false
        set(entries.map { $0.status == .failed && !$0.refused ? $0.with(.queued) : $0 } + [fresh])
        wake()
    }

    /// Puts every failed message back in the queue, in the order they were written.
    public func retryFailed() {
        requeue { _ in true }
    }

    /// Sends the failed message `clientId` again, under the id it was written under. The ones
    /// written before it that failed with the line (not on their own account) go first, so a retry
    /// never overtakes a message the person wrote earlier; the ones written after it wait for their own retry.
    public func retry(_ clientId: String) {
        guard let at = entries.firstIndex(where: { $0.clientId == clientId && $0.status == .failed }) else { return }
        let ahead = Set(entries.prefix(at).map(\.clientId))
        requeue { (ahead.contains($0.clientId) && !$0.refused) || $0.clientId == clientId }
    }

    private func requeue(_ which: (Outgoing) -> Bool) {
        guard entries.contains(where: { $0.status == .failed && which($0) }) else { return }
        set(entries.map { $0.status == .failed && which($0) ? $0.with(.queued) : $0 })
        wake()
    }

    /// Drops a message that failed (the person chose to delete it). A message still sending can't be taken back.
    public func discard(_ clientId: String) {
        let left = entries.filter { !($0.clientId == clientId && $0.status == .failed) }
        if left.count != entries.count { set(left) }
    }

    /// Forgets the messages the conversation now shows (`shown`): their document replaced them.
    /// Any status — a message whose answer was lost can have arrived all the same.
    public func reconcile(_ shown: (Outgoing) -> Bool) {
        let left = entries.filter { !shown($0) }
        if left.count != entries.count { set(left) }
    }

    /// Everything goes: another account signed in, or the conversation was deleted.
    public func clear() {
        epoch += 1
        worker?.cancel()
        worker = nil
        if !entries.isEmpty { set([]) }
    }

    private func wake() {
        guard worker == nil else { return }
        let life = epoch
        worker = Task { [weak self] in
            await self?.drain(life)
        }
    }

    private func drain(_ life: Int) async {
        defer { if life == epoch { worker = nil } }
        while life == epoch, let next = entries.first(where: { $0.status == .queued }) {
            update(next.clientId) { $0.status = .sending }
            do {
                let id = try await deliver(next)
                guard life == epoch else { return }
                update(next.clientId) {
                    $0.status = .sent
                    $0.serverId = id
                }
            } catch {
                guard life == epoch else { return }
                if isRefusal(error) {
                    update(next.clientId) {
                        $0.status = .failed
                        $0.refused = true
                    }
                } else {
                    stopTheLine(from: next.clientId)
                }
            }
        }
    }

    /// `from` failed for a reason that will pass: it and everything queued behind it fail, so the order holds on retry.
    private func stopTheLine(from clientId: String) {
        var behind = false
        set(entries.map {
            if $0.clientId == clientId { behind = true }
            return behind && ($0.status == .queued || $0.status == .sending) ? $0.with(.failed) : $0
        })
    }

    /// A message may have left the list meanwhile (reconciled), so this is a no-op for one that is gone.
    private func update(_ clientId: String, _ change: (inout Outgoing) -> Void) {
        guard let at = entries.firstIndex(where: { $0.clientId == clientId }) else { return }
        var list = entries
        change(&list[at])
        set(list)
    }

    private func set(_ list: [Outgoing]) {
        entries = list
        watchers.removeAll { $0.owner == nil }
        for watcher in watchers { watcher.change(list) }
    }

    private nonisolated static let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")

    /// A client id: 20 characters of [A-Za-z0-9] (the contract takes 16–64 of `[A-Za-z0-9_-]`).
    public nonisolated static func newClientId() -> String {
        var generator = SystemRandomNumberGenerator()
        return String((0..<20).map { _ in alphabet.randomElement(using: &generator)! })
    }

    /// The server answered and said no to this message itself (a 4xx other than "signed out",
    /// "timed out" and "too many"), as opposed to a failure that will pass.
    public nonisolated static func refusedByServer(_ error: Error) -> Bool {
        guard let status = (error as? APIFailure)?.status else { return false }
        return (400...499).contains(status) && ![401, 408, 429].contains(status)
    }
}

private extension Outbox.Outgoing {
    func with(_ status: Outbox.Status) -> Outbox.Outgoing {
        var copy = self
        copy.status = status
        if status == .queued { copy.refused = false }
        return copy
    }
}
