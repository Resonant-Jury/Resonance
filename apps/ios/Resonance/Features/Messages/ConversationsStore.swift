import FirebaseFirestore
import Foundation
import Observation

/// Someone in Messages: what a row or a thread header draws of them.
nonisolated struct Person: Identifiable, Equatable, Sendable {
    let id: String
    let handle: String
    let initials: String
    let avatarURL: URL?
    let accentColor: String?
    let avatarSeed: String?

    init?(id: String, data: [String: Any]?) {
        guard let data, let handle = data["handle"] as? String, !handle.isEmpty else { return nil }
        self.id = id
        self.handle = handle
        initials = data["initials"] as? String ?? String(handle.prefix(2)).uppercased()
        avatarURL = (data["avatarUrl"] as? String).flatMap(URL.init(string:))
        accentColor = data["accentColor"] as? String
        avatarSeed = data["avatarSeed"] as? String
    }
}

/// The signed-in person's conversations, live — the web's useConversations
/// (listConversations + listMyConnectionUids + getMyBlockedIds), as snapshot
/// listeners instead of a 30s poll. Drives the Messages tab and its badge.
@Observable
final class ConversationsStore {
    struct Conversation: Identifiable, Equatable {
        let id: String
        let other: Person
        let lastText: String?
        let lastFromMe: Bool
        let sentAt: Date?
        let unread: Int
    }

    private(set) var conversations: [Conversation] = []
    /// Connected, no conversation yet (the list's second section).
    private(set) var starters: [Person] = []
    private(set) var loaded = false
    var unreadTotal: Int { conversations.reduce(0) { $0 + $1.unread } }
    /// The people this account has blocked, live (nil until the first read of the list).
    private(set) var blockedIds: Set<String>?
    /// Called when the block list changes (not for the first read of it at sign-in).
    @ObservationIgnored var onBlocksChange: (() -> Void)?
    /// Called with every read of the block list, the first included.
    @ObservationIgnored var onBlocks: ((Set<String>) -> Void)?

    @ObservationIgnored private var uid: String?
    @ObservationIgnored private var listeners: [ListenerRegistration] = []
    @ObservationIgnored private var rawConversations: [QueryDocumentSnapshot] = []
    @ObservationIgnored private var connectionUids: [String] = []
    @ObservationIgnored private var blocked: Set<String> = []
    @ObservationIgnored private var people: [String: Person] = [:]
    @ObservationIgnored private var missing: Set<String> = []
    @ObservationIgnored private var ready: Set<String> = []

    func start(uid: String) {
        stop()
        self.uid = uid
        let db = FirebaseBootstrap.db
        listeners = [
            db.collection("conversations").whereField("participants", arrayContains: uid)
                .order(by: "updatedAt", descending: true)
                .addSnapshotListener { [weak self] snap, _ in
                    guard let snap else { return }
                    MainActor.assumeIsolated { self?.rawConversations = snap.documents; self?.arrived("conversations") }
                },
            db.collection("connections").whereField("userIds", arrayContains: uid)
                .addSnapshotListener { [weak self] snap, _ in
                    guard let snap else { return }
                    let others = snap.documents.compactMap { ($0.get("userIds") as? [String])?.first { $0 != uid } }
                    MainActor.assumeIsolated { self?.connectionUids = others; self?.arrived("connections") }
                },
            db.collection("users").document(uid).collection("blocks")
                .addSnapshotListener { [weak self] snap, _ in
                    guard let snap else { return }
                    let ids = Set(snap.documents.map(\.documentID))
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        if self.ready.contains("blocks"), ids != self.blocked { self.onBlocksChange?() }
                        self.blocked = ids
                        if self.blockedIds != ids { self.blockedIds = ids }
                        self.onBlocks?(ids)
                        self.arrived("blocks")
                    }
                },
        ]
    }

    func stop() {
        listeners.forEach { $0.remove() }
        listeners = []
        uid = nil
        rawConversations = []
        connectionUids = []
        blocked = []
        blockedIds = nil
        ready = []
        conversations = []
        starters = []
        loaded = false
    }

    /// A person already seen here (a thread opened from the list starts with them).
    func person(_ id: String) -> Person? { people[id] }

    private func arrived(_ source: String) {
        ready.insert(source)
        Task { await rebuild() }
    }

    private func rebuild() async {
        guard let uid else { return }
        let others = rawConversations.compactMap { Self.other(in: $0, me: uid) }
        let wanted = Set(others + connectionUids).subtracting(people.keys).subtracting(missing)
        await withTaskGroup(of: (String, Person?).self) { group in
            for id in wanted {
                group.addTask { (id, Person(id: id, data: try? await FirebaseBootstrap.db.collection("users").document(id).getDocument().data())) }
            }
            for await (id, person) in group {
                if let person { people[id] = person } else { missing.insert(id) }
            }
        }
        // A row whose profile is gone is skipped; blocked people drop out entirely.
        conversations = rawConversations.compactMap { doc in
            guard let otherId = Self.other(in: doc, me: uid), !blocked.contains(otherId), let other = people[otherId] else { return nil }
            let last = doc.get("lastMessage") as? [String: Any]
            let unread = ((doc.get("unread") as? [String: Any])?[uid] as? NSNumber)?.intValue ?? 0
            return Conversation(id: doc.documentID, other: other, lastText: last?["text"] as? String,
                                lastFromMe: last?["senderId"] as? String == uid,
                                sentAt: (last?["sentAt"] as? Timestamp)?.dateValue(), unread: unread)
        }
        let talking = Set(conversations.map(\.other.id))
        starters = connectionUids.filter { !talking.contains($0) && !blocked.contains($0) }.compactMap { people[$0] }
        loaded = ready.isSuperset(of: ["conversations", "connections", "blocks"])
    }

    private static func other(in doc: QueryDocumentSnapshot, me: String) -> String? {
        (doc.get("participants") as? [String])?.first { $0 != me }
    }
}
