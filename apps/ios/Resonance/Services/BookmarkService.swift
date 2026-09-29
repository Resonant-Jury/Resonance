import FirebaseFirestore
import Foundation

/// Bookmarks (收藏), written straight to Firestore like the web's client
/// (lib/db/firestore/client/bookmarks.ts): users/{uid}/bookmarks/{cardId},
/// owner-only, never counted and never notified.
struct BookmarkService {
    let uid: String
    private var db: Firestore { Firestore.firestore() }

    private func ref(_ cardId: String) -> DocumentReference {
        db.collection("users").document(uid).collection("bookmarks").document(cardId)
    }

    func isBookmarked(_ cardId: String) async throws -> Bool {
        try await ref(cardId).getDocument().exists
    }

    /// Flips the bookmark; the doc id is the card id, so this is idempotent.
    /// Returns the new state.
    func toggle(_ cardId: String) async throws -> Bool {
        let doc = ref(cardId)
        if try await doc.getDocument().exists {
            try await doc.delete()
            return false
        }
        try await doc.setData(["cardId": cardId, "createdAt": FieldValue.serverTimestamp()])
        return true
    }
}
