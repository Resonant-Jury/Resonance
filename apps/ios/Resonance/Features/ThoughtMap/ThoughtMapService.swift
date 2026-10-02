import FirebaseFirestore
import Foundation
import ResonanceKit

/// A card on my map: where it sits (world units, top-left) and the region it's filed in.
struct MapNode: Equatable, Sendable {
    let cardId: String
    var x: Double
    var y: Double
    var groupId: String?
}

/// A directed arrow between two of my cards (`{source}_{target}`), with its optional words.
struct MapEdge: Equatable, Sendable {
    let id: String
    let sourceCardId: String
    let targetCardId: String
    var label: String
}

/// A region (分類): a titled, tinted box cards are filed into.
struct MapGroup: Equatable, Sendable {
    let id: String
    var title: String
    var hue: Double
    var x: Double
    var y: Double
    var w: Double
    var h: Double
}

/// What a node shows of its card (the fields ThoughtMapNode reads).
struct MapCard: Equatable, Sendable {
    let id: String
    let authorId: String
    let slug: String?
    let title: String
    let story: String
    let tags: [String]
    let visibility: String
    let publishedAt: Date?
    let mediaURL: URL?
    let accentHue: Double?
}

extension MapCard {
    /// A card as the server summarises it (GET /cards?keys=): its excerpt
    /// stands in for the story, and an anonymous one has no author (`authorId`
    /// empty) — the server never names it.
    nonisolated init(summary c: FeedCard) {
        self.init(id: c.id, authorId: c.author?.value1.id ?? "", slug: c.slug, title: c.title, story: c.excerpt,
                  tags: c.tags, visibility: c.visibility.rawValue, publishedAt: c.publishedAt.flatMap(ISO8601.date),
                  mediaURL: c.imageUrl.flatMap(URL.init(string:)), accentHue: c.accentHue)
    }
}

/// The thought map (thoughtMaps/{uid}/nodes|edges|groups), read and written
/// straight to Firestore like the web's client/thoughtMap.ts — the owner's
/// own documents, `isSelf` in the rules. Every function mirrors its web twin
/// and batches the same way.
struct ThoughtMapService {
    let uid: String
    /// Cards' summaries from the server, by id (GET /cards?keys=): for the cards
    /// the rules won't let this client read (someone else's anonymous card).
    let summaries: @Sendable ([String]) async throws -> [FeedCard]
    private var db: Firestore { FirebaseBootstrap.db }
    private var map: DocumentReference { db.collection("thoughtMaps").document(uid) }
    private var nodesCol: CollectionReference { map.collection("nodes") }
    private var edgesCol: CollectionReference { map.collection("edges") }
    private var groupsCol: CollectionReference { map.collection("groups") }

    struct Loaded {
        var nodes: [MapNode]
        var edges: [MapEdge]
        var groups: [MapGroup]
    }

    /// loadMyThoughtMap: the three collections in full (document-id order).
    func load() async throws -> Loaded {
        async let n = nodesCol.getDocuments()
        async let e = edgesCol.getDocuments()
        async let g = groupsCol.getDocuments()
        let (nodes, edges, groups) = try await (n, e, g)
        return Loaded(
            nodes: nodes.documents.map { d in
                MapNode(cardId: d.get("cardId") as? String ?? d.documentID, x: Self.num(d.get("x")) ?? 0,
                        y: Self.num(d.get("y")) ?? 0, groupId: d.get("groupId") as? String)
            },
            edges: edges.documents.map { d in
                MapEdge(id: d.documentID, sourceCardId: d.get("sourceCardId") as? String ?? "",
                        targetCardId: d.get("targetCardId") as? String ?? "", label: d.get("label") as? String ?? "")
            },
            groups: groups.documents.map { d in
                MapGroup(id: d.documentID, title: d.get("title") as? String ?? "", hue: Self.num(d.get("hue")) ?? 55,
                         x: Self.num(d.get("x")) ?? 0, y: Self.num(d.get("y")) ?? 0,
                         w: Self.num(d.get("w")) ?? 320, h: Self.num(d.get("h")) ?? 240)
            })
    }

    static func edgeId(_ source: String, _ target: String) -> String { "\(source)_\(target)" }

    func addNode(_ cardId: String, x: Double, y: Double) async throws {
        try await nodesCol.document(cardId).setData([
            "cardId": cardId, "x": x, "y": y, "groupId": NSNull(),
            "createdAt": FieldValue.serverTimestamp(), "updatedAt": FieldValue.serverTimestamp(),
        ])
    }

    func moveNode(_ cardId: String, x: Double, y: Double, groupId: String?) async throws {
        try await nodesCol.document(cardId).updateData([
            "x": x, "y": y, "groupId": groupId ?? NSNull(), "updatedAt": FieldValue.serverTimestamp(),
        ])
    }

    /// setNodeGroups: re-file cards in one batch.
    func setNodeGroups(_ changes: [(cardId: String, groupId: String?)]) async throws {
        guard !changes.isEmpty else { return }
        let batch = db.batch()
        for c in changes {
            batch.updateData(["groupId": c.groupId ?? NSNull(), "updatedAt": FieldValue.serverTimestamp()],
                             forDocument: nodesCol.document(c.cardId))
        }
        try await batch.commit()
    }

    /// removeMapNode: the node and every arrow touching it (the card itself stays).
    func removeNode(_ cardId: String) async throws {
        async let out = edgesCol.whereField("sourceCardId", isEqualTo: cardId).getDocuments()
        async let inn = edgesCol.whereField("targetCardId", isEqualTo: cardId).getDocuments()
        let (a, b) = try await (out, inn)
        let batch = db.batch()
        batch.deleteDocument(nodesCol.document(cardId))
        for d in a.documents + b.documents { batch.deleteDocument(d.reference) }
        try await batch.commit()
    }

    func createEdge(_ source: String, _ target: String, label: String = "") async throws {
        guard source != target else { return }
        try await edgesCol.document(Self.edgeId(source, target)).setData([
            "sourceCardId": source, "targetCardId": target, "label": label, "createdAt": FieldValue.serverTimestamp(),
        ])
    }

    func updateEdgeLabel(_ id: String, _ label: String) async throws {
        try await edgesCol.document(id).updateData(["label": label])
    }

    func removeEdge(_ id: String) async throws {
        try await edgesCol.document(id).delete()
    }

    func createGroup(title: String, hue: Double, x: Double, y: Double, w: Double, h: Double) async throws -> String {
        let ref = groupsCol.document()
        try await ref.setData(["title": title, "hue": hue, "x": x, "y": y, "w": w, "h": h,
                               "createdAt": FieldValue.serverTimestamp()])
        return ref.documentID
    }

    func updateGroup(_ id: String, _ patch: [String: Any]) async throws {
        try await groupsCol.document(id).updateData(patch)
    }

    /// A region moved with its cards: the web's two writes, here in one batch so they land together.
    func moveGroup(_ id: String, x: Double, y: Double, members: [(cardId: String, x: Double, y: Double)]) async throws {
        let batch = db.batch()
        batch.updateData(["x": x, "y": y], forDocument: groupsCol.document(id))
        for m in members {
            batch.updateData(["x": m.x, "y": m.y, "updatedAt": FieldValue.serverTimestamp()], forDocument: nodesCol.document(m.cardId))
        }
        try await batch.commit()
    }

    /// removeMapGroup: the region goes, its cards stay on the map, unfiled.
    func removeGroup(_ id: String) async throws {
        let members = try await nodesCol.whereField("groupId", isEqualTo: id).getDocuments()
        let batch = db.batch()
        batch.deleteDocument(groupsCol.document(id))
        for d in members.documents {
            batch.updateData(["groupId": NSNull(), "updatedAt": FieldValue.serverTimestamp()], forDocument: d.reference)
        }
        try await batch.commit()
    }

    // MARK: - The cards the map can hold (useMyThoughtMap)

    /// My own cards (getCardsByAuthor: the newest 40, drafts among them) and
    /// the originals I resonated with (my latest 60 cards' references, read as
    /// `read` reads them — one nobody lets me read any more just isn't there).
    func cards() async throws -> (cards: [String: MapCard], resonated: Set<String>) {
        let cardsCol = db.collection("cards")
        async let ownSnap = cardsCol.whereField("authorId", isEqualTo: uid)
            .order(by: "publishedAt", descending: true).limit(to: 40).getDocuments()
        async let replySnap = cardsCol.whereField("authorId", isEqualTo: uid).limit(to: 60).getDocuments()
        let (own, replies) = try await (ownSnap, replySnap)
        let refs = Array(Set(replies.documents.compactMap { $0.get("referenceCardId") as? String }))
        let originals = await read(refs)
        var byId: [String: MapCard] = [:]
        for c in originals { byId[c.id] = c }
        for d in own.documents { if let c = Self.card(d) { byId[c.id] = c } }
        let resonated = Set(originals.filter { $0.authorId != uid }.map(\.id))
        return (byId, resonated)
    }

    /// One card as it is now: nil when it is gone, or no longer readable by me (deleted, made
    /// private); a read that failed for now throws. One the rules won't read here is asked of
    /// the server, as `read` does.
    func card(_ id: String) async throws -> MapCard? {
        do {
            if let card = Self.card(try await db.collection("cards").document(id).getDocument()) { return card }
        } catch where FirestoreFailure.isGone(error) {}
        return try await summaries([id]).first { $0.id == id }.map(MapCard.init(summary:))
    }

    /// Cards already on the map that the newest-40 read didn't bring (an older card placed long ago).
    func cards(ids: [String]) async -> [MapCard] {
        await read(ids)
    }

    private func read(_ ids: [String]) async -> [MapCard] {
        let cardsCol = db.collection("cards")
        return await Self.read(ids, underRules: { id in try? await Self.card(cardsCol.document(id).getDocument()) },
                               server: summaries)
    }

    /// Cards by id, in the order asked: each read under the rules, and those the
    /// rules won't read here (someone else's anonymous card) asked of the server
    /// in one request, which leaves an anonymous card's author out — as the web's
    /// useMyThoughtMap does. A card neither will read isn't there; should the
    /// server fail, those cards are just not shown this time.
    nonisolated static func read(_ ids: [String], underRules: @escaping @Sendable (String) async -> MapCard?,
                                 server: @Sendable ([String]) async throws -> [FeedCard]) async -> [MapCard] {
        let read = await withTaskGroup(of: (String, MapCard?).self) { group in
            for id in ids { group.addTask { (id, await underRules(id)) } }
            var read: [String: MapCard] = [:]
            for await (id, card) in group { if let card { read[id] = card } }
            return read
        }
        let unread = ids.filter { !read.keys.contains($0) }
        var summarised: [String: MapCard] = [:]
        if !unread.isEmpty, let cards = try? await server(unread) {
            for c in cards { summarised[c.id] = MapCard(summary: c) }
        }
        return ids.compactMap { read[$0] ?? summarised[$0] }
    }

    nonisolated private static func card(_ d: DocumentSnapshot) -> MapCard? {
        guard d.exists else { return nil }
        let media = d.get("media") as? [String: Any]
        return MapCard(
            id: d.documentID,
            authorId: d.get("authorId") as? String ?? "",
            slug: d.get("slug") as? String,
            title: d.get("thoughtCore") as? String ?? "",
            story: d.get("story") as? String ?? "",
            tags: d.get("tags") as? [String] ?? [],
            visibility: d.get("visibility") as? String ?? "public",
            publishedAt: (d.get("publishedAt") as? Timestamp)?.dateValue(),
            mediaURL: (media?["type"] as? String) == "image" ? (media?["url"] as? String).flatMap(URL.init(string:)) : nil,
            accentHue: num(d.get("accentHue")))
    }

    nonisolated private static func num(_ v: Any?) -> Double? { (v as? NSNumber)?.doubleValue }
}
