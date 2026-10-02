import FirebaseFirestore
import Foundation
import Observation
import ResonanceKit

/// One conversation (ThreadView.tsx): who it's with, whether you may write,
/// the newest 50 messages live, and sending through the API.
///
/// Opened with the other person's uid (from Messages, a notification, their
/// page), it listens to the conversation by its pair id at once and asks for
/// their profile alongside — only for their face and whether you may write.
/// Opened by pen name alone (an older link), it asks who they are first.
/// A conversation exists only after its first message: until then reading it
/// is refused, which here means "no messages yet".
@MainActor @Observable
final class ThreadModel {
    struct Message: Identifiable, Equatable {
        let id: String
        let senderId: String
        let text: String
        let sentAt: Date
        let cardRef: String?
        let noteRef: MessagingAPI.NoteRef?
    }

    enum Phase: Equatable { case loading, missing, ready }

    /// The pen name the route named them by (it may have changed since).
    let handle: String
    private(set) var phase: Phase = .loading
    /// Who the conversation is with, when known (from the start, when the route carried it).
    private(set) var otherId: String?
    private(set) var other: Author?
    /// Whether you may write (connected, no block). Nil until known — the composer shows meanwhile.
    private(set) var connected: Bool?
    private(set) var isBlocked = false
    private(set) var conversationExists = false
    private(set) var messages: [Message] = []
    /// The first snapshot of messages has arrived (or there is no conversation yet).
    private(set) var threadReady = false
    /// Shared cards, as the viewer may see them, read together.
    let sharedCards: CardSummaries

    var draft = ""
    var pendingCard: FeedCard?
    var noteRef: MessagingAPI.NoteRef?
    private(set) var sending = false
    var error: String?

    @ObservationIgnored private let session: SessionStore
    @ObservationIgnored private var listeners: [ListenerRegistration] = []
    @ObservationIgnored private var unreadForMe = 0

    init(handle: String, uid: String?, noteRef: MessagingAPI.NoteRef?, session: SessionStore) {
        self.handle = handle
        self.noteRef = noteRef
        self.session = session
        sharedCards = CardSummaries(api: session.reading)
        let previews = session.cardPreviews
        sharedCards.onLoaded = { previews.remember($0) }
        if let uid, uid != session.uid {
            otherId = uid
            // Someone Messages already shows: their face and current pen name at once.
            other = session.conversations.person(uid).map(Author.init(person:))
        }
    }

    var me: String? { session.uid }
    var pairId: String? {
        guard let me, let otherId else { return nil }
        return Self.pairId(me, otherId)
    }

    /// Their pen name as shown: the current one, once known.
    var displayHandle: String { other?.handle ?? handle }

    /// ThreadView's `valid`: text or a card, within 2000, somewhere to send it.
    var canSend: Bool {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return (!trimmed.isEmpty || pendingCard != nil) && trimmed.utf16.count <= 2000 && pairId != nil && !sending
    }

    func load() async {
        if otherId != nil {
            phase = .ready
            attach()
            await refreshConnection()
        } else if await refreshConnection() {
            phase = .ready
            attach()
        }
    }

    /// Re-reads who they are and whether you may still write (after a block,
    /// or coming back). True when their profile arrived.
    @discardableResult
    func refreshConnection() async -> Bool {
        do {
            if let profile = try await currentProfile() {
                other = profile.author
                otherId = profile.author.id
                isBlocked = profile.isBlocked
                connected = profile.isConnected && !profile.isBlocked
                return true
            }
            // Nobody by that name or uid (any more), or it's you.
            stop()
            phase = .missing
        } catch {
            // Offline or a server error: keep what's known. By pen name alone there is nothing to open yet.
            if otherId == nil, !Task.isCancelled { phase = .missing }
        }
        return false
    }

    /// Their profile as you see it. With their uid known, a pen name they've
    /// since changed (or that someone else has since taken) is looked up afresh.
    private func currentProfile() async throws -> Profile? {
        let asked = displayHandle
        if let profile = try await profile(asked), otherId == nil || profile.author.id == otherId {
            return profile.isSelf ? nil : profile
        }
        guard let otherId, let current = try await currentHandle(of: otherId),
              current.caseInsensitiveCompare(asked) != .orderedSame,
              let profile = try await profile(current), profile.author.id == otherId else { return nil }
        return profile
    }

    private func profile(_ handle: String) async throws -> Profile? {
        do {
            return try await session.reading.profile(handle)
        } catch let failure as APIFailure where failure.isNotFound {
            return nil
        }
    }

    /// Their pen name now (users/{uid} is public); nil for an account that's gone.
    private func currentHandle(of uid: String) async throws -> String? {
        let data = try await FirebaseBootstrap.db.collection("users").document(uid).getDocument().data()
        return Person(id: uid, data: data)?.handle
    }

    /// Back on screen (from a page pushed over the thread), or the conversation
    /// just appeared in Messages: listening again if the listeners stopped.
    func resume() {
        guard phase == .ready, listeners.isEmpty else { return }
        attach()
    }

    /// Listens to the conversation and its newest 50 messages, by pair id.
    private func attach() {
        guard let pairId, listeners.isEmpty else { return }
        let ref = FirebaseBootstrap.db.collection("conversations").document(pairId)
        listeners.append(ref.addSnapshotListener { [weak self] snap, error in
            MainActor.assumeIsolated {
                guard let self else { return }
                if let error { return self.listenerFailed(error) }
                guard let snap, snap.exists else { return }
                self.conversationExists = true
                self.unreadForMe = ((snap.get("unread") as? [String: Any])?[self.me ?? ""] as? NSNumber)?.intValue ?? 0
                self.markReadIfNeeded()
            }
        })
        listeners.append(ref.collection("messages").order(by: "sentAt", descending: true).limit(to: 50)
            .addSnapshotListener { [weak self] snap, error in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if let error { return self.listenerFailed(error) }
                    guard let snap else { return }
                    // A pending server time (our own message, in flight) sorts last.
                    self.messages = Array(snap.documents.map(Self.message).reversed())
                    self.threadReady = true
                    self.markReadIfNeeded()
                    self.loadCards()
                }
            })
    }

    /// A listener that fails is over; `resume()` starts them again. Refused
    /// means there is no conversation (yet, or any more): no messages, not an error.
    private func listenerFailed(_ error: Error) {
        stop()
        threadReady = true
        if Self.isNoConversation(error) {
            conversationExists = false
            messages = []
            unreadForMe = 0
        }
    }

    /// Reading a conversation that doesn't exist is refused by the rules (PERMISSION_DENIED).
    nonisolated static func isNoConversation(_ error: Error) -> Bool {
        let e = error as NSError
        return e.domain == FirestoreErrorDomain && e.code == FirestoreErrorCode.permissionDenied.rawValue
    }

    /// Connections and conversations share the sorted `uid1_uid2` pair id.
    nonisolated static func pairId(_ a: String, _ b: String) -> String {
        [a, b].sorted().joined(separator: "_")
    }

    func stop() {
        listeners.forEach { $0.remove() }
        listeners = []
    }

    /// Opening a thread reads it: the last message is theirs, or the count says so.
    private func markReadIfNeeded() {
        guard let pairId, let me, unreadForMe > 0 || (messages.last.map { $0.senderId != me } ?? false) else { return }
        guard unreadForMe > 0 else { return }
        FirebaseBootstrap.db.collection("conversations").document(pairId).updateData(["unread.\(me)": 0])
    }

    /// A shared card as the viewer may see it (nil: on its way, or not visible to them — drawn as nothing).
    func card(_ id: String) -> FeedCard? { sharedCards.card(id) }

    /// The cards the loaded messages share, those not asked for yet in one request.
    private func loadCards() {
        let refs = messages.compactMap(\.cardRef)
        Task { await sharedCards.load(refs) }
    }

    func send() async {
        guard canSend, let otherId else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            try await session.messaging.sendMessage(to: otherId, text: draft.trimmingCharacters(in: .whitespacesAndNewlines),
                                                    cardRef: pendingCard?.id, noteRef: noteRef)
            draft = ""
            pendingCard = nil
            noteRef = nil
            // The first message creates the conversation: listen to it now.
            resume()
        } catch {
            self.error = L10n.Messages.sendError
        }
    }

    /// Deletes the whole conversation, for both people (deleteConversation: messages in batches, then the parent).
    func deleteConversation() async -> Bool {
        guard let pairId else { return false }
        let db = FirebaseBootstrap.db
        let ref = db.collection("conversations").document(pairId)
        do {
            stop()
            let all = try await ref.collection("messages").getDocuments().documents
            for chunk in stride(from: 0, to: all.count, by: 450).map({ Array(all[$0..<min($0 + 450, all.count)]) }) {
                let batch = db.batch()
                chunk.forEach { batch.deleteDocument($0.reference) }
                try await batch.commit()
            }
            try await ref.delete()
            return true
        } catch {
            self.error = L10n.Messages.deleteError
            resume()
            return false
        }
    }

    // MARK: Search and media

    /// Messages matching the search (card-only ones step aside while searching).
    func filtered(_ query: String) -> [Message] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return messages }
        return messages.filter { $0.text.lowercased().contains(q) }
    }

    /// Cards shared here (in thread order, once each) and links written in messages.
    var shared: (cards: [String], links: [URL]) {
        var seenCards: [String] = [], seenLinks: [URL] = []
        let pattern = try? NSRegularExpression(pattern: #"https?://[^\s)]+"#)
        for m in messages {
            if let id = m.cardRef, !seenCards.contains(id) { seenCards.append(id) }
            let range = NSRange(m.text.startIndex..., in: m.text)
            for match in pattern?.matches(in: m.text, range: range) ?? [] {
                if let r = Range(match.range, in: m.text), let url = URL(string: String(m.text[r])), !seenLinks.contains(url) {
                    seenLinks.append(url)
                }
            }
        }
        return (seenCards, seenLinks)
    }

    nonisolated private static func message(_ doc: QueryDocumentSnapshot) -> Message {
        let note = doc.get("noteRef") as? [String: Any]
        return Message(
            id: doc.documentID,
            senderId: doc.get("senderId") as? String ?? "",
            text: doc.get("text") as? String ?? "",
            sentAt: (doc.get("sentAt", serverTimestampBehavior: .estimate) as? Timestamp)?.dateValue() ?? Date(),
            cardRef: doc.get("cardRef") as? String,
            noteRef: (note?["cardId"] as? String).flatMap { card in (note?["noteId"] as? String).map { .init(cardId: card, noteId: $0) } }
        )
    }
}

extension Author {
    /// Someone as Messages draws them, until their profile arrives.
    init(person: Person) {
        self.init(id: person.id, handle: person.handle, initials: person.initials, accentColor: person.accentColor ?? "",
                  avatarUrl: person.avatarURL?.absoluteString, avatarSeed: person.avatarSeed, verified: false, region: nil)
    }
}
