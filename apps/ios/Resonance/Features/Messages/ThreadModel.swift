import FirebaseFirestore
import Foundation
import Observation
import ResonanceKit

/// One conversation (ThreadView.tsx): who it's with, whether you may write,
/// the newest 50 messages live, and sending through the API. The conversation
/// exists only after its first message, so its listeners start then.
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

    let handle: String
    private(set) var phase: Phase = .loading
    private(set) var other: Author?
    /// Whether you may write (connected, no block). Nil until known — the composer shows meanwhile.
    private(set) var connected: Bool?
    private(set) var isBlocked = false
    private(set) var conversationExists = false
    private(set) var messages: [Message] = []
    /// The first snapshot of messages has arrived (or there is no conversation yet).
    private(set) var threadReady = false
    /// Shared cards, as the viewer may see them (nil: not visible to them — drawn as nothing).
    private(set) var cards: [String: CardDetail?] = [:]

    var draft = ""
    var pendingCard: FeedCard?
    var noteRef: MessagingAPI.NoteRef?
    private(set) var sending = false
    var error: String?

    @ObservationIgnored private let session: SessionStore
    @ObservationIgnored private var listeners: [ListenerRegistration] = []
    @ObservationIgnored private var unreadForMe = 0

    init(handle: String, noteRef: MessagingAPI.NoteRef?, session: SessionStore) {
        self.handle = handle
        self.noteRef = noteRef
        self.session = session
    }

    var me: String? { session.uid }
    var pairId: String? {
        guard let me, let other else { return nil }
        return [me, other.id].sorted().joined(separator: "_")
    }

    /// ThreadView's `valid`: text or a card, within 2000, somewhere to send it.
    var canSend: Bool {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return (!trimmed.isEmpty || pendingCard != nil) && trimmed.utf16.count <= 2000 && pairId != nil && !sending
    }

    func load() async {
        do {
            let profile = try await session.reading.profile(handle)
            guard !profile.isSelf else { return phase = .missing }
            other = profile.author
            isBlocked = profile.isBlocked
            connected = profile.isConnected && !profile.isBlocked
            phase = .ready
        } catch {
            phase = .missing
            return
        }
        await openConversation()
    }

    /// Re-reads whether you may still write (after a block, or coming back).
    func refreshConnection() async {
        guard let profile = try? await session.reading.profile(handle) else { return }
        isBlocked = profile.isBlocked
        connected = profile.isConnected && !profile.isBlocked
    }

    /// Listens once the conversation exists: reading a missing one is refused.
    private func openConversation() async {
        guard let pairId, listeners.isEmpty else { return }
        let ref = Firestore.firestore().collection("conversations").document(pairId)
        guard let snap = try? await ref.getDocument(), snap.exists else {
            threadReady = true
            return
        }
        conversationExists = true
        listeners.append(ref.addSnapshotListener { [weak self] snap, _ in
            guard let snap, snap.exists else { return }
            let unread = ((snap.get("unread") as? [String: Any])?[MainActor.assumeIsolated { self?.me } ?? ""] as? NSNumber)?.intValue ?? 0
            MainActor.assumeIsolated {
                self?.unreadForMe = unread
                self?.markReadIfNeeded()
            }
        })
        listeners.append(ref.collection("messages").order(by: "sentAt", descending: true).limit(to: 50)
            .addSnapshotListener { [weak self] snap, _ in
                guard let snap else { return }
                // A pending server time (our own message, in flight) sorts last.
                let messages = snap.documents.map(Self.message).reversed()
                MainActor.assumeIsolated {
                    self?.messages = Array(messages)
                    self?.threadReady = true
                    self?.markReadIfNeeded()
                    self?.loadCards()
                }
            })
    }

    func stop() {
        listeners.forEach { $0.remove() }
        listeners = []
    }

    /// Opening a thread reads it: the last message is theirs, or the count says so.
    private func markReadIfNeeded() {
        guard let pairId, let me, unreadForMe > 0 || (messages.last.map { $0.senderId != me } ?? false) else { return }
        guard unreadForMe > 0 else { return }
        Firestore.firestore().collection("conversations").document(pairId).updateData(["unread.\(me)": 0])
    }

    private func loadCards() {
        for id in Set(messages.compactMap(\.cardRef)) where cards[id] == nil {
            cards[id] = .some(nil)
            Task { cards[id] = .some(try? await session.reading.card(id)) }
        }
    }

    func send() async {
        guard canSend, let other else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            try await session.messaging.sendMessage(to: other.id, text: draft.trimmingCharacters(in: .whitespacesAndNewlines),
                                                    cardRef: pendingCard?.id, noteRef: noteRef)
            draft = ""
            pendingCard = nil
            noteRef = nil
            await openConversation()
        } catch {
            self.error = L10n.Messages.sendError
        }
    }

    /// Deletes the whole conversation, for both people (deleteConversation: messages in batches, then the parent).
    func deleteConversation() async -> Bool {
        guard let pairId else { return false }
        let db = Firestore.firestore()
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
            await openConversation()
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
