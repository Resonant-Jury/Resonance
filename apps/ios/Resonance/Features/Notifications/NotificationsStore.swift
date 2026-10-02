import FirebaseFirestore
import Foundation
import Observation

/// The signed-in person's notifications, live (a Firestore snapshot listener
/// on the same query the web's bell reads). Drives the tab badge too.
@Observable
final class NotificationsStore {
    struct Item: Identifiable, Equatable {
        let id: String
        let type: String
        let fromHandle: String?
        /// Who it's from (a thread opened from it outlasts their change of pen name).
        let fromUserId: String?
        let cardId: String?
        let preview: String?
        /// A note's id (to quote it when replying).
        let noteId: String?
        let count: Int?
        let readAt: Date?
        let createdAt: Date?
        var isUnread: Bool { readAt == nil }
    }

    private(set) var items: [Item] = []
    private(set) var loaded = false
    /// The listener failed: the list stays as last read (or the screen offers
    /// a retry, with nothing read yet) until it listens again (`resume`).
    private(set) var failed = false
    var unreadCount: Int { items.filter(\.isUnread).count }

    @ObservationIgnored private let listeners = LiveListeners()

    func start(uid: String) {
        stop()
        listeners.add("notifications") { [weak self] in
            let registration = FirebaseBootstrap.db.collection("notifications")
                .whereField("userId", isEqualTo: uid)
                .order(by: "createdAt", descending: true)
                .limit(to: 50)
                .addSnapshotListener { snapshot, _ in
                    let items = snapshot?.documents.map(Self.item)
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        guard let items else {
                            self.listeners.fail("notifications")
                            self.failed = true
                            return
                        }
                        self.items = items
                        self.loaded = true
                        self.failed = false
                    }
                }
            return { registration.remove() }
        }
    }

    /// Back in the foreground (or the retry tapped): a failed listener listens again.
    func resume() {
        if listeners.resume() { failed = false }
    }

    func stop() {
        listeners.removeAll()
        items = []
        loaded = false
        failed = false
    }

    func markRead(_ item: Item) {
        guard item.isUnread else { return }
        markRead(id: item.id)
    }

    /// A tapped push reads its row (it may not have arrived in the list yet).
    func markRead(id: String) {
        if let item = items.first(where: { $0.id == id }), !item.isUnread { return }
        FirebaseBootstrap.db.collection("notifications").document(id)
            .updateData(["readAt": FieldValue.serverTimestamp()])
    }

    nonisolated static func item(_ doc: QueryDocumentSnapshot) -> Item {
        let payload = doc.get("payload") as? [String: Any] ?? [:]
        return Item(
            id: doc.documentID,
            type: doc.get("type") as? String ?? "",
            fromHandle: payload["fromHandle"] as? String,
            fromUserId: payload["fromUserId"] as? String,
            cardId: payload["cardId"] as? String,
            preview: payload["preview"] as? String,
            noteId: payload["noteId"] as? String,
            count: (payload["count"] as? NSNumber)?.intValue,
            readAt: (doc.get("readAt") as? Timestamp)?.dateValue(),
            createdAt: (doc.get("createdAt") as? Timestamp)?.dateValue()
        )
    }
}
