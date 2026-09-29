import FirebaseFirestore
import Foundation

/// A draft's editable fields — CardEditor's DraftValues.
struct DraftValues: Equatable {
    var title = ""
    var story = ""
    var tags: [String] = []
    var visibility = "public"
    var anonymous = false
    /// The cover: its public URL and label (media {type: image} on the web).
    var imageURL: URL?
    var imageLabel: String?
    /// The cover's hue snapped to the card palette; nil keeps the position colour.
    var accentHue: Double?

    /// Nothing written yet — autosave doesn't create a document for it (isEmptyDraft).
    var isEmpty: Bool { title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && story.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && tags.isEmpty && imageURL == nil }
}

/// Drafts, written straight to Firestore like the web editor's client
/// (lib/db/firestore/client/cards.ts: createCardDraft, updateCardDraft) — the
/// author's own documents under the same rules. Publishing is the server's
/// (WritingAPI.publish), since it reaches other people.
struct DraftService {
    let uid: String
    private var db: Firestore { Firestore.firestore() }

    private func fields(_ v: DraftValues) -> [String: Any] {
        [
            "thoughtCore": v.title,
            "story": v.story,
            "tags": v.tags,
            "visibility": v.visibility,
            "anonymous": v.anonymous,
        ]
    }

    private func media(_ v: DraftValues) -> [String: Any]? {
        v.imageURL.map { ["type": "image", "url": $0.absoluteString, "label": v.imageLabel ?? ""] }
    }

    /// createCardDraft: a new, unpublished card with zeroed counters.
    func create(_ v: DraftValues, locale: String, referenceCardId: String?) async throws -> String {
        var data = fields(v)
        if let media = media(v) { data["media"] = media }
        if let hue = v.accentHue { data["accentHue"] = hue }
        if let referenceCardId { data["referenceCardId"] = referenceCardId }
        data["authorId"] = uid
        data["originalLocale"] = locale
        data["translations"] = [String: Any]()
        data["publishedAt"] = NSNull()
        data["readCount"] = 0
        data["resonanceCount"] = 0
        data["inviteCount"] = 0
        data["createdAt"] = FieldValue.serverTimestamp()
        data["updatedAt"] = FieldValue.serverTimestamp()
        let ref = db.collection("cards").document()
        try await write(ref, data, merge: false)
        return ref.documentID
    }

    /// updateCardDraft: the fields as they are now (a removed cover clears media and its hue).
    func update(_ id: String, _ v: DraftValues) async throws {
        var data = fields(v)
        data["media"] = media(v) ?? FieldValue.delete()
        data["accentHue"] = v.accentHue ?? NSNull()
        data["updatedAt"] = FieldValue.serverTimestamp()
        try await write(db.collection("cards").document(id), data, merge: true)
    }

    // The completion form: the payload never leaves the main actor.
    private func write(_ ref: DocumentReference, _ data: [String: Any], merge: Bool) async throws {
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            ref.setData(data, merge: merge) { error in
                if let error { done.resume(throwing: error) } else { done.resume() }
            }
        }
    }
}
