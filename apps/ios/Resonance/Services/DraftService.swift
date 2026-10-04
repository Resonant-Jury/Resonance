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
/// (WritingAPI.publish), since it reaches other people; so are a card's
/// visibility and deleting it from its ⋯ (WritingAPI.updateCard / deleteCard),
/// which leave the site's cached pages stale unless the server refreshes them.
struct DraftService {
    let uid: String
    private var db: Firestore { FirebaseBootstrap.db }

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

    // MARK: Opening a card to edit

    /// A card of yours as the editor opens it (write/[id]/page.tsx): a draft
    /// with its own fields, or a published card with its pending edit when
    /// there is one — buffered edits win over the live fields.
    struct OpenedCard {
        let id: String
        var values: DraftValues
        let isPublished: Bool
        let slug: String?
        let referenceCardId: String?
        let hasPendingEdit: Bool
        /// Where it lives once published: the slug, or the id.
        var routeKey: String { slug ?? id }
    }

    /// Your card by id, or nil when it is missing or someone else's (rules deny → nil).
    /// The pending edit is asked for beside the card, not after it (a draft has
    /// none: that read finds nothing, and is left unused).
    func open(_ id: String) async throws -> OpenedCard? {
        let ref = db.collection("cards").document(id)
        let edit = editRef(id)
        async let pending = try? edit.getDocument()
        guard let card = try? await ref.getDocument(), let data = card.data(), data["authorId"] as? String == uid else { return nil }
        let isPublished = data["publishedAt"] is Timestamp
        let buffered = isPublished ? await pending?.data() : nil
        return OpenedCard(id: id, values: Self.values(buffered ?? data), isPublished: isPublished, slug: data["slug"] as? String,
                          referenceCardId: data["referenceCardId"] as? String, hasPendingEdit: buffered != nil)
    }

    private static func values(_ d: [String: Any]) -> DraftValues {
        let media = d["media"] as? [String: Any]
        return DraftValues(
            title: d["thoughtCore"] as? String ?? "",
            story: d["story"] as? String ?? "",
            tags: d["tags"] as? [String] ?? [],
            visibility: d["visibility"] as? String ?? "public",
            anonymous: d["anonymous"] as? Bool ?? false,
            imageURL: (media?["url"] as? String).flatMap(URL.init(string:)),
            imageLabel: media?["label"] as? String,
            accentHue: (d["accentHue"] as? NSNumber)?.doubleValue
        )
    }

    // MARK: Pending edits (lib/db/firestore/client/cardEdits.ts)

    private func editRef(_ id: String) -> DocumentReference {
        db.collection("cards").document(id).collection("edits").document("current")
    }

    /// savePendingCardEdit: a published card autosaves its whole working copy
    /// here (owner-only), never onto the card readers are looking at.
    func saveEdit(_ id: String, _ v: DraftValues) async throws {
        var data = fields(v)
        if let media = media(v) { data["media"] = media }
        data["accentHue"] = v.accentHue ?? NSNull()
        data["updatedAt"] = FieldValue.serverTimestamp()
        try await write(editRef(id), data, merge: false)
    }

    /// discardPendingCardEdit: the live card is left exactly as it was.
    func discardEdit(_ id: String) async throws {
        try await editRef(id).delete()
    }

    // MARK: Reads of your own cards

    /// Your card answering another: a draft still being written, or published.
    struct Resonance: Equatable {
        let id: String
        let published: Bool
    }

    /// getMyResonanceCard: your card (draft or published) answering this one, if any.
    func myResonance(to cardId: String) async throws -> Resonance? {
        let snap = try await db.collection("cards").whereField("authorId", isEqualTo: uid)
            .whereField("referenceCardId", isEqualTo: cardId).limit(to: 1).getDocuments()
        return snap.documents.first.map { Resonance(id: $0.documentID, published: $0.get("publishedAt") is Timestamp) }
    }

    /// hasAnyOwnCards: whether you have written anything at all (drafts count).
    func hasAnyCards() async -> Bool {
        let snap = try? await db.collection("cards").whereField("authorId", isEqualTo: uid).limit(to: 1).getDocuments()
        // A failed read counts as "has written": the guide is for newcomers only.
        return snap.map { !$0.documents.isEmpty } ?? true
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
