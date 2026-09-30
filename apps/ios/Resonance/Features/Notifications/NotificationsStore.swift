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
    var unreadCount: Int { items.filter(\.isUnread).count }

    @ObservationIgnored private var listener: ListenerRegistration?

    func start(uid: String) {
        stop()
        listener = Firestore.firestore().collection("notifications")
            .whereField("userId", isEqualTo: uid)
            .order(by: "createdAt", descending: true)
            .limit(to: 50)
            .addSnapshotListener { [weak self] snapshot, _ in
                guard let snapshot else { return }
                let items = snapshot.documents.map(Self.item)
                MainActor.assumeIsolated {
                    self?.items = items
                    self?.loaded = true
                }
            }
    }

    func stop() {
        listener?.remove()
        listener = nil
        items = []
        loaded = false
    }

    func markRead(_ item: Item) {
        guard item.isUnread else { return }
        markRead(id: item.id)
    }

    /// A tapped push reads its row (it may not have arrived in the list yet).
    func markRead(id: String) {
        if let item = items.first(where: { $0.id == id }), !item.isUnread { return }
        Firestore.firestore().collection("notifications").document(id)
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
