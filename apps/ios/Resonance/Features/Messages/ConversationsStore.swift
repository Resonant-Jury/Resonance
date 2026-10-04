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
    /// A listener failed (offline for good, the backend refusing): what is
    /// shown is as last read until the app is back in the foreground (`resume`).
    private(set) var failed = false
    var unreadTotal: Int { conversations.reduce(0) { $0 + $1.unread } }
    /// The people this account has blocked, live (nil until the first read of the list).
    private(set) var blockedIds: Set<String>?
    /// Called when the block list changes (not for the first read of it at sign-in).
    @ObservationIgnored var onBlocksChange: (() -> Void)?
    /// Called with every read of the block list, the first included.
    @ObservationIgnored var onBlocks: ((Set<String>) -> Void)?
    /// Called with the people whose connection with this account began or ended (not for the first
    /// read at sign-in) — a resonance or an answered letter, a take-back or a block, here or on any
    /// device, theirs or this account's.
    @ObservationIgnored var onConnectionsChange: ((Set<String>) -> Void)?

    @ObservationIgnored private var uid: String?
    @ObservationIgnored private let listeners = LiveListeners()
    @ObservationIgnored private var rawConversations: [QueryDocumentSnapshot] = []
    @ObservationIgnored private var connectionUids: [String] = []
    @ObservationIgnored private var blocked: Set<String> = []
    @ObservationIgnored private var people = PeopleBook()
    @ObservationIgnored private var ready: Set<String> = []

    func start(uid: String) {
        stop()
        self.uid = uid
        let db = FirebaseBootstrap.db
        listen("conversations") { [weak self] in
            db.collection("conversations").whereField("participants", arrayContains: uid)
                .order(by: "updatedAt", descending: true)
                .addSnapshotListener { snap, error in
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        guard let snap else { return self.failed("conversations", error) }
                        self.rawConversations = snap.documents
                        self.arrived("conversations")
                    }
                }
        }
        listen("connections") { [weak self] in
            db.collection("connections").whereField("userIds", arrayContains: uid)
                .addSnapshotListener { snap, error in
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        guard let snap else { return self.failed("connections", error) }
                        let uids = snap.documents.compactMap { ($0.get("userIds") as? [String])?.first { $0 != uid } }
                        let moved = Self.moved(from: self.connectionUids, to: uids)
                        self.connectionUids = uids
                        if self.ready.contains("connections"), !moved.isEmpty { self.onConnectionsChange?(moved) }
                        self.arrived("connections")
                    }
                }
        }
        listen("blocks") { [weak self] in
            db.collection("users").document(uid).collection("blocks")
                .addSnapshotListener { snap, error in
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        guard let snap else { return self.failed("blocks", error) }
                        let ids = Set(snap.documents.map(\.documentID))
                        if self.ready.contains("blocks"), ids != self.blocked { self.onBlocksChange?() }
                        self.blocked = ids
                        if self.blockedIds != ids { self.blockedIds = ids }
                        self.onBlocks?(ids)
                        self.arrived("blocks")
                    }
                }
        }
    }

    private func listen(_ name: String, _ attach: @escaping () -> ListenerRegistration) {
        listeners.add(name) {
            let registration = attach()
            return { registration.remove() }
        }
    }

    /// A listener reported an error and is over: the list stays as last read
    /// until `resume()` attaches it again.
    private func failed(_ name: String, _ error: Error?) {
        listeners.fail(name)
        failed = true
    }

    /// Back in the foreground: listeners that failed listen again, and people
    /// whose profile couldn't be read are asked for again.
    func resume() {
        guard uid != nil else { return }
        if listeners.resume() { failed = false }
        if people.hasRetries { Task { await rebuild() } }
    }

    func stop() {
        listeners.removeAll()
        uid = nil
        rawConversations = []
        connectionUids = []
        blocked = []
        blockedIds = nil
        people = PeopleBook()
        ready = []
        conversations = []
        starters = []
        loaded = false
        failed = false
    }

    /// A person already seen here (a thread opened from the list starts with them).
    func person(_ id: String) -> Person? { people.found[id] }

    private func arrived(_ source: String) {
        ready.insert(source)
        Task { await rebuild() }
    }

    private func rebuild() async {
        guard let uid else { return }
        let others = rawConversations.compactMap { Self.other(in: $0, me: uid) }
        let wanted = people.toRead(Set(others + connectionUids))
        await withTaskGroup(of: (String, PeopleBook.Read).self) { group in
            for id in wanted {
                group.addTask { (id, await Self.read(id)) }
            }
            for await (id, read) in group { people.record(id, read) }
        }
        // Signed out, or someone else signed in, meanwhile.
        guard self.uid == uid else { return }
        // A row whose profile is gone is skipped (one that couldn't be read yet waits for the next try);
        // blocked people drop out entirely.
        let found = people.found
        conversations = rawConversations.compactMap { doc in
            guard let otherId = Self.other(in: doc, me: uid), !blocked.contains(otherId), let other = found[otherId] else { return nil }
            let last = doc.get("lastMessage") as? [String: Any]
            let unread = ((doc.get("unread") as? [String: Any])?[uid] as? NSNumber)?.intValue ?? 0
            return Conversation(id: doc.documentID, other: other, lastText: last?["text"] as? String,
                                lastFromMe: last?["senderId"] as? String == uid,
                                sentAt: (last?["sentAt"] as? Timestamp)?.dateValue(), unread: unread)
        }
        let talking = Set(conversations.map(\.other.id))
        starters = connectionUids.filter { !talking.contains($0) && !blocked.contains($0) }.compactMap { found[$0] }
        loaded = ready.isSuperset(of: ["conversations", "connections", "blocks"])
    }

    /// Someone's profile (users/{uid} is public). A missing one, or one without
    /// a pen name, is someone who's gone; so is a refusal. Anything else failed
    /// for now.
    nonisolated private static func read(_ id: String) async -> PeopleBook.Read {
        do {
            let data = try await FirebaseBootstrap.db.collection("users").document(id).getDocument().data()
            return Person(id: id, data: data).map(PeopleBook.Read.found) ?? .gone
        } catch {
            return FirestoreFailure.isGone(error) ? .gone : .failed
        }
    }

    /// Whose connection began or ended between two reads of the list.
    nonisolated static func moved(from before: [String], to after: [String]) -> Set<String> {
        Set(before).symmetricDifference(after)
    }

    private static func other(in doc: QueryDocumentSnapshot, me: String) -> String? {
        (doc.get("participants") as? [String])?.first { $0 != me }
    }
}

/// The people Messages has asked about: those found, those gone (no profile,
/// or refused) — not asked about again this session — and those whose read
/// failed (offline, a timeout), asked about again on the next change or when
/// the app comes back to the foreground. A failed read never hides a
/// conversation for good.
nonisolated struct PeopleBook {
    enum Read: Sendable { case found(Person), gone, failed }

    private(set) var found: [String: Person] = [:]
    private var gone: Set<String> = []
    private var retry: Set<String> = []

    /// Of `ids`, those still to ask about.
    func toRead(_ ids: Set<String>) -> Set<String> {
        ids.subtracting(found.keys).subtracting(gone)
    }

    /// Some reads failed and wait for another try.
    var hasRetries: Bool { !retry.isEmpty }

    mutating func record(_ id: String, _ read: Read) {
        retry.remove(id)
        switch read {
        case let .found(person): found[id] = person
        case .gone: gone.insert(id)
        case .failed: retry.insert(id)
        }
    }
}
