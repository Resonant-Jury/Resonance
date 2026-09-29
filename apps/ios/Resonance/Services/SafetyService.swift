import FirebaseFirestore
import Foundation

/// Report and block, written straight to Firestore under the same rules the
/// web's client uses (lib/db/firestore/client/reports.ts, blocks.ts):
/// reports are create-only; the block list is owner-only, and blocking also
/// ends the connection and withdraws the blocker's pending invites.
struct SafetyService {
    enum Reason: String, CaseIterable, Identifiable {
        case spam, harassment, hate, sexual, selfHarm = "self_harm", violence, other
        var id: String { rawValue }
    }

    enum Target {
        case card(id: String, authorId: String)
        case user(id: String)
        case message(id: String, senderId: String, conversationId: String)

        var fields: [String: Any] {
            switch self {
            case let .card(id, author): ["targetType": "card", "targetId": id, "targetUserId": author]
            case let .user(id): ["targetType": "user", "targetId": id, "targetUserId": id]
            case let .message(id, sender, conversation): ["targetType": "message", "targetId": id, "targetUserId": sender, "contextId": conversation]
            }
        }

        var userId: String {
            switch self {
            case let .card(_, author): author
            case let .user(id): id
            case let .message(_, sender, _): sender
            }
        }
    }

    /// Mirrors the cap in firestore.rules.
    static let detailMax = 1000

    let uid: String
    private var db: Firestore { Firestore.firestore() }

    func report(_ target: Target, reason: Reason, detail: String) async throws {
        var data = target.fields
        data["reporterId"] = uid
        data["reason"] = reason.rawValue
        data["detail"] = String(detail.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.detailMax))
        data["createdAt"] = FieldValue.serverTimestamp()
        data["status"] = "open"
        let reports = db.collection("reports")
        // The completion form: the payload never leaves the main actor.
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            reports.addDocument(data: data) { error in
                if let error { done.resume(throwing: error) } else { done.resume() }
            }
        }
    }

    func block(_ other: String) async throws {
        guard other != uid else { return }
        // The block goes first: once it exists the rules refuse any new contact,
        // so the cleanup below can't race a fresh connection.
        try await db.collection("users").document(uid).collection("blocks").document(other)
            .setData(["blockedUid": other, "createdAt": FieldValue.serverTimestamp()])
        let pair = uid < other ? "\(uid)_\(other)" : "\(other)_\(uid)"
        let connection = db.collection("connections").document(pair)
        if try await connection.getDocument().exists { try await connection.delete() }
        let pending = try await db.collection("invites")
            .whereField("fromUserId", isEqualTo: uid)
            .whereField("toUserId", isEqualTo: other)
            .whereField("status", isEqualTo: "pending")
            .getDocuments()
        for invite in pending.documents { try await invite.reference.updateData(["status": "withdrawn"]) }
    }

    func unblock(_ other: String) async throws {
        try await db.collection("users").document(uid).collection("blocks").document(other).delete()
    }

    struct BlockedPerson: Identifiable, Hashable {
        let id: String
        let handle: String?
        let initials: String
        let avatarUrl: String?
        let accentColor: String?
        let avatarSeed: Double?
        let since: Date?
    }

    /// The block list, newest first, with each person's current name (a
    /// deleted account shows as such).
    func blocked() async throws -> [BlockedPerson] {
        let snap = try await db.collection("users").document(uid).collection("blocks")
            .order(by: "createdAt", descending: true).getDocuments()
        var people: [BlockedPerson] = []
        for doc in snap.documents {
            let user = try? await db.collection("users").document(doc.documentID).getDocument()
            let handle = user?.get("handle") as? String
            people.append(BlockedPerson(
                id: doc.documentID,
                handle: handle,
                initials: (user?.get("initials") as? String) ?? "··",
                avatarUrl: user?.get("avatarUrl") as? String,
                accentColor: user?.get("accentColor") as? String,
                // Stored as a string, like the web's `Number(avatarSeed)`.
                avatarSeed: ((user?.get("avatarSeed") as? String).flatMap(Double.init) ?? (user?.get("avatarSeed") as? Double))
                    .flatMap { $0 == 0 ? nil : $0 },
                since: (doc.get("createdAt") as? Timestamp)?.dateValue()
            ))
        }
        return people
    }
}
