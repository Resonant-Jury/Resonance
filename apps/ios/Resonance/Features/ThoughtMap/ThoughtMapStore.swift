import CoreGraphics
import DesignSystem
import Foundation
import Observation
import ResonanceKit
import UIKit

/// The thought map's state and its gestures — ThoughtMapCanvas.tsx without
/// the DOM. Edits are optimistic and written through when a gesture ends
/// (no debounce), exactly as on the web; the web's pointer handlers are one
/// state machine here, fed every touch by `MapTouchSurface`, with hit-testing
/// done in world coordinates in the web's paint order.
@Observable
final class ThoughtMapStore {
    enum Selection: Equatable { case node(String), edge(String), group(String) }

    struct LinkDraft: Equatable {
        let sourceId: String
        var wx: Double
        var wy: Double
    }

    static let groupHues: [Double] = [88, 215, 290, 140, 55, 18]
    static let nodeHues: [Double] = [55, 290, 140, 88, 215, 18]
    /// A card's action tab (TAB_X, TAB_W, TAB_H in ThoughtMapNode.tsx).
    static let tabX = 24.0, tabW = 118.0, tabH = 30.0
    /// A region can't shrink below a card with room around it.
    static let minGroupW = mapNodeW + 60, minGroupH = mapNodeH + 80

    private(set) var loaded = false
    private(set) var failed = false
    private(set) var nodes: [String: MapNode] = [:]
    private(set) var nodeOrder: [String] = []
    private(set) var edges: [String: MapEdge] = [:]
    private(set) var edgeOrder: [String] = []
    private(set) var groups: [String: MapGroup] = [:]
    private(set) var groupOrder: [String] = []
    private(set) var cards: [String: MapCard] = [:]
    private(set) var cardOrder: [String] = []
    private(set) var resonated: Set<String> = []

    var camera = MapCamera(x: 0, y: 0, s: 1)
    private(set) var viewport: CGSize = .zero
    var selection: Selection?
    private(set) var dragNodeId: String?
    private(set) var linkDraft: LinkDraft?
    private(set) var panning = false
    var trayOpen = false
    var editingGroupId: String?
    var groupDraft = ""
    var editingEdgeId: String?
    var labelDraft = ""

    /// Opening a card from its tab (the screen decides where: writer or card page).
    @ObservationIgnored var onOpen: (MapCard) -> Void = { _ in }
    @ObservationIgnored private var service: ThoughtMapService?
    @ObservationIgnored private var fitted = false

    // MARK: - Loading

    func load(uid: String) async {
        let service = ThoughtMapService(uid: uid)
        self.service = service
        do {
            async let map = service.load()
            async let cardSet = service.cards()
            let (m, c) = try await (map, cardSet)
            var byId = c.cards
            // A placed card older than the newest 40 is still on the map: read it by id.
            let missing = m.nodes.map(\.cardId).filter { byId[$0] == nil }
            for card in await service.cards(ids: missing) { byId[card.id] = card }
            applyCards(byId, resonated: c.resonated)
            // A card that's gone (deleted, or an original I can no longer read) drops out of view.
            nodes = [:]
            nodeOrder = []
            for n in m.nodes where cards[n.cardId] != nil {
                nodes[n.cardId] = n
                nodeOrder.append(n.cardId)
            }
            edges = Dictionary(uniqueKeysWithValues: m.edges.map { ($0.id, $0) })
            edgeOrder = m.edges.map(\.id)
            groups = Dictionary(uniqueKeysWithValues: m.groups.map { ($0.id, $0) })
            groupOrder = m.groups.map(\.id)
            loaded = true
            failed = false
            fitIfReady()
        } catch {
            failed = !loaded
        }
    }

    /// Titles and tags may have changed in the writer: refresh the cards, keep the map.
    func refreshCards() async {
        guard let service, let c = try? await service.cards() else { return }
        var byId = c.cards
        let missing = nodeOrder.filter { byId[$0] == nil }
        for card in await service.cards(ids: missing) { byId[card.id] = card }
        applyCards(byId, resonated: c.resonated)
    }

    private func applyCards(_ byId: [String: MapCard], resonated: Set<String>) {
        cards = byId
        // Newest first, drafts (no date) last — the order the web's query hands them over.
        cardOrder = byId.values.sorted {
            switch ($0.publishedAt, $1.publishedAt) {
            case let (a?, b?): a > b
            case (_?, nil): true
            case (nil, _?): false
            case (nil, nil): $0.id < $1.id
            }
        }.map(\.id)
        self.resonated = resonated
    }

    func setViewport(_ size: CGSize) {
        guard size != viewport else { return }
        viewport = size
        fitIfReady()
    }

    private func fitIfReady() {
        guard !fitted, loaded, viewport.width > 0, viewport.height > 0 else { return }
        fitted = true
        fit()
    }

    // MARK: - Derived

    var isEmpty: Bool { nodes.isEmpty && groups.isEmpty }

    func card(_ id: String) -> MapCard? { cards[id] }

    static func hue(_ card: MapCard) -> Double {
        card.accentHue ?? nodeHues[seedFromString(card.id) % nodeHues.count]
    }

    func nodeRect(_ id: String) -> Rect? { nodes[id].map { mapNodeRect($0.x, $0.y) } }

    var groupRects: [MapGroupRect] {
        groupOrder.compactMap { groups[$0] }.map { MapGroupRect(id: $0.id, rect: Rect(x: $0.x, y: $0.y, w: $0.w, h: $0.h)) }
    }

    /// Paint order: filed cards (inside their region's clip, regions in order), then free cards.
    var filedOrder: [String] { nodeOrder.filter { id in nodes[id]?.groupId.flatMap { groups[$0] } != nil } }
    var freeOrder: [String] { nodeOrder.filter { id in nodes[id]?.groupId.flatMap { groups[$0] } == nil } }

    /// Cards not on the map yet, drafts first, then newest.
    var trayCards: [MapCard] {
        let off = cardOrder.compactMap { cards[$0] }.filter { nodes[$0.id] == nil }
        return off.filter { $0.publishedAt == nil } + off.filter { $0.publishedAt != nil }
    }

    /// The region a dragged card is being filed into shows as an open folder.
    func isHot(_ groupId: String) -> Bool {
        guard let id = dragNodeId else { return false }
        return nodes[id]?.groupId == groupId
    }

    /// The node an arrow in progress would land on.
    var linkTarget: String? {
        guard let d = linkDraft else { return nil }
        return nodeOrder.first { $0 != d.sourceId && rectContains(mapNodeRect(nodes[$0]!.x, nodes[$0]!.y), (d.wx, d.wy)) }
    }

    // MARK: - Camera

    func zoom(by factor: Double) {
        camera = zoomAt(camera, viewport.width / 2, viewport.height / 2, factor)
    }

    func fit() {
        let rects = nodeOrder.compactMap(nodeRect) + groupOrder.compactMap { groups[$0] }.map { Rect(x: $0.x, y: $0.y, w: $0.w, h: $0.h) }
        camera = fitCamera(rects, viewport.width, viewport.height)
    }

    // MARK: - Hit-testing (the web's paint order, top first)

    enum Hit: Equatable {
        case edgeLabel(String), tabOpen(String), tabRemove(String), linkHandle(String), node(String)
        case groupTitle(String), groupDelete(String), groupResize(String), edge(String), group(String), empty
    }

    /// The label pill's size in world units (TagPill sm: 10px 600 uppercase at 0.04em, 3×10 padding).
    static func pillSize(_ text: String) -> CGSize {
        let font = AppFonts.uiFont(.body, size: 10, weight: .semibold)
        let w = (text.uppercased() as NSString).size(withAttributes: [.font: font, .kern: 0.4]).width
        return CGSize(width: ceil(w) + 20, height: 19)
    }

    func labelText(_ edge: MapEdge) -> String { edge.label.isEmpty ? L10n.Me.ThoughtMap.edgeLabelPlaceholder : edge.label }

    func showsLabel(_ edge: MapEdge) -> Bool {
        !edge.label.isEmpty || selection == .edge(edge.id) || editingEdgeId == edge.id
    }

    func edgeGeometry(_ edge: MapEdge) -> EdgeGeometry? {
        guard let s = nodeRect(edge.sourceCardId), let t = nodeRect(edge.targetCardId) else { return nil }
        return organicEdgePath(s, t, seed: Double(seedFromString(edge.id)))
    }

    /// Where the tab's two buttons split ("Open" on the left, the trash on the right).
    static let tabSplitX: Double = {
        let font = AppFonts.uiFont(.body, size: 12.5, weight: .semibold)
        let openW = ceil((L10n.Me.ThoughtMap.open as NSString).size(withAttributes: [.font: font]).width) + 14
        let trashW = 14.0 + 14
        let content = openW + 2 + trashW
        return tabX + (tabW - content) / 2 + openW + 1
    }()

    func hitTest(_ p: CGPoint) -> Hit {
        let w = screenToWorld(camera, p.x, p.y)
        let s = camera.s
        // A finger is wider than the web's pointer: small targets get at least ~22pt of reach.
        let reach = max(0, 22 / s)
        for id in edgeOrder.reversed() {
            guard let e = edges[id], showsLabel(e), editingEdgeId != id, let g = edgeGeometry(e) else { continue }
            let size = Self.pillSize(labelText(e))
            if abs(w.x - g.mid.x) <= size.width / 2 + 4 / s, abs(w.y - g.mid.y) <= size.height / 2 + 6 / s { return .edgeLabel(id) }
        }
        if case let .node(id)? = selection, let n = nodes[id], dragNodeId == nil {
            let hx = n.x + 233, hy = n.y + 89
            if hypot(w.x - hx, w.y - hy) <= max(14, reach) { return .linkHandle(id) }
            if w.y >= n.y - Self.tabH, w.y < n.y + 2, w.x >= n.x + Self.tabX, w.x <= n.x + Self.tabX + Self.tabW {
                return w.x - n.x < Self.tabSplitX ? .tabOpen(id) : .tabRemove(id)
            }
        }
        for id in (filedOrder + freeOrder).reversed() {
            guard let n = nodes[id] else { continue }
            if rectContains(clippedRect(n), w) { return .node(id) }
        }
        for id in groupOrder.reversed() {
            guard let g = groups[id] else { continue }
            let rx = g.x + g.w + 6 - 11, ry = g.y + g.h + 6 - 11
            if hypot(w.x - rx, w.y - ry) <= max(11, reach) { return .groupResize(id) }
            let dx = g.x + g.w - 10 - 14, dy = g.y + 8 + 14
            if abs(w.x - dx) <= max(14, reach), abs(w.y - dy) <= max(14, reach) { return .groupDelete(id) }
            if w.x >= g.x, w.x <= g.x + g.w - 44, w.y >= g.y, w.y <= g.y + 43 { return .groupTitle(id) }
        }
        let slop = max(8, 12 / s)
        for id in edgeOrder.reversed() {
            guard let e = edges[id], let g = edgeGeometry(e) else { continue }
            if Self.distance(from: w, to: g.path) <= slop { return .edge(id) }
        }
        for id in groupOrder.reversed() {
            guard let g = groups[id] else { continue }
            if rectContains(Rect(x: g.x, y: g.y, w: g.w, h: g.h), w) { return .group(id) }
        }
        return .empty
    }

    /// A filed card only shows (and takes touches) inside its region's rounded clip.
    private func clippedRect(_ n: MapNode) -> Rect {
        let r = mapNodeRect(n.x, n.y)
        guard let gid = n.groupId, let g = groups[gid] else { return r }
        let x0 = max(r.x, g.x), y0 = max(r.y, g.y)
        let x1 = min(r.x + r.w, g.x + g.w), y1 = min(r.y + r.h, g.y + g.h)
        return x1 > x0 && y1 > y0 ? Rect(x: x0, y: y0, w: x1 - x0, h: y1 - y0) : Rect(x: 0, y: 0, w: -1, h: -1)
    }

    /// Distance from a point to the arrow's cubic, sampled.
    private static func distance(from p: Point, to path: [PathCommand]) -> Double {
        var best = Double.infinity
        var cur = (x: 0.0, y: 0.0)
        for cmd in path {
            switch cmd {
            case let .move(x, y): cur = (x, y)
            case let .cubic(x1, y1, x2, y2, x, y):
                for i in 0...32 {
                    let t = Double(i) / 32, u = 1 - t
                    let bx = u * u * u * cur.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x
                    let by = u * u * u * cur.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y
                    best = min(best, hypot(p.x - bx, p.y - by))
                }
                cur = (x, y)
            default: break
            }
        }
        return best
    }

    // MARK: - Touches (the web's pointer handlers)

    private enum Drag {
        case pan(px: Double, py: Double, camX: Double, camY: Double)
        case node(id: String, dx: Double, dy: Double)
        case group(id: String, dx: Double, dy: Double, members: [(id: String, dx: Double, dy: Double)], fromTitle: Bool)
        case resize(id: String)
        case link(sourceId: String)
        /// Buttons and labels act when the finger lifts without moving.
        case tap(Hit)
    }

    private struct PinchFrame { var dist: Double; var cx: Double; var cy: Double }

    @ObservationIgnored private var touches: [(id: ObjectIdentifier, p: CGPoint)] = []
    @ObservationIgnored private var drag: Drag?
    @ObservationIgnored private var pinch: PinchFrame?
    @ObservationIgnored private var moved = false
    @ObservationIgnored private var start = CGPoint.zero
    @ObservationIgnored private var last = CGPoint.zero

    private func pinchFrame() -> PinchFrame? {
        guard touches.count >= 2 else { return nil }
        let a = touches[0].p, b = touches[1].p
        return PinchFrame(dist: max(1, hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2)
    }

    func touchDown(_ id: ObjectIdentifier, at p: CGPoint) {
        touches.append((id, p))
        if touches.count == 2 {
            // A second finger turns whatever the first was doing into a pinch (finishing a move it had made).
            if moved { finishDrag(at: last) }
            drag = nil
            panning = false
            dragNodeId = nil
            linkDraft = nil
            pinch = pinchFrame()
            return
        }
        guard touches.count == 1, pinch == nil else { return }
        commitEditors()
        moved = false
        start = p
        last = p
        let w = screenToWorld(camera, p.x, p.y)
        switch hitTest(p) {
        case let .linkHandle(id):
            drag = .link(sourceId: id)
            linkDraft = LinkDraft(sourceId: id, wx: w.x, wy: w.y)
        case let .node(id):
            let n = nodes[id]!
            drag = .node(id: id, dx: w.x - n.x, dy: w.y - n.y)
            dragNodeId = id
        case let .groupTitle(id):
            drag = groupDrag(id, w, fromTitle: true)
        case let .group(id):
            drag = groupDrag(id, w, fromTitle: false)
        case let .groupResize(id):
            drag = .resize(id: id)
        case let .edge(id):
            // Selected as the finger lands; nothing to drag.
            selection = .edge(id)
            drag = .tap(.edge(id))
        case .empty:
            drag = .pan(px: p.x, py: p.y, camX: camera.x, camY: camera.y)
            panning = true
        case let hit:
            drag = .tap(hit)
        }
    }

    private func groupDrag(_ id: String, _ w: Point, fromTitle: Bool) -> Drag {
        let g = groups[id]!
        let members = nodeOrder.compactMap { nodes[$0] }.filter { $0.groupId == id }.map { (id: $0.cardId, dx: w.x - $0.x, dy: w.y - $0.y) }
        return .group(id: id, dx: w.x - g.x, dy: w.y - g.y, members: members, fromTitle: fromTitle)
    }

    func touchMove(_ id: ObjectIdentifier, to p: CGPoint) {
        guard let i = touches.firstIndex(where: { $0.id == id }) else { return }
        touches[i].p = p
        if let prev = pinch {
            guard let frame = pinchFrame() else { return }
            var cam = zoomAt(camera, frame.cx, frame.cy, frame.dist / prev.dist)
            cam.x += frame.cx - prev.cx
            cam.y += frame.cy - prev.cy
            camera = cam
            pinch = frame
            return
        }
        guard i == 0, let drag else { return }
        last = p
        if !moved, hypot(p.x - start.x, p.y - start.y) > 4 { moved = true }
        let w = screenToWorld(camera, p.x, p.y)
        switch drag {
        case let .pan(px, py, camX, camY):
            camera.x = camX + (p.x - px)
            camera.y = camY + (p.y - py)
        case let .node(nid, dx, dy):
            guard moved, var n = nodes[nid] else { return }
            n.x = w.x - dx
            n.y = w.y - dy
            n.groupId = majorityGroupId(mapNodeRect(n.x, n.y), groupRects)
            nodes[nid] = n
        case let .group(gid, dx, dy, members, _):
            guard moved, var g = groups[gid] else { return }
            g.x = w.x - dx
            g.y = w.y - dy
            groups[gid] = g
            for m in members { nodes[m.id]?.x = w.x - m.dx; nodes[m.id]?.y = w.y - m.dy }
        case let .resize(gid):
            guard var g = groups[gid] else { return }
            g.w = max(Self.minGroupW, w.x - g.x)
            g.h = max(Self.minGroupH, w.y - g.y)
            groups[gid] = g
        case .link:
            linkDraft?.wx = w.x
            linkDraft?.wy = w.y
        case .tap:
            break
        }
    }

    func touchUp(_ id: ObjectIdentifier, at p: CGPoint) {
        guard let i = touches.firstIndex(where: { $0.id == id }) else { return }
        touches.remove(at: i)
        if pinch != nil {
            // A pinch finger never taps; the one left behind does nothing until lifted.
            pinch = touches.count >= 2 ? pinchFrame() : nil
            return
        }
        guard i == 0 || touches.isEmpty else { return }
        finishDrag(at: p)
    }

    private func finishDrag(at p: CGPoint) {
        guard let current = drag else { return }
        drag = nil
        let w = screenToWorld(camera, p.x, p.y)
        switch current {
        case .pan:
            panning = false
            if !moved {
                selection = nil
                trayOpen = false
            }
        case let .node(nid, dx, dy):
            dragNodeId = nil
            guard moved else {
                selection = .node(nid)
                return
            }
            let others = nodeOrder.filter { $0 != nid }.compactMap(nodeRect)
            let pos = resolveOverlap(mapNodeRect(w.x - dx, w.y - dy), others)
            let groupId = majorityGroupId(mapNodeRect(pos.x, pos.y), groupRects)
            nodes[nid] = MapNode(cardId: nid, x: pos.x, y: pos.y, groupId: groupId)
            persist { try await $0.moveNode(nid, x: pos.x, y: pos.y, groupId: groupId) }
        case let .group(gid, _, _, members, fromTitle):
            guard moved else {
                if fromTitle, selection == .group(gid) { startGroupRename(gid) } else { selection = .group(gid) }
                return
            }
            guard let g = groups[gid] else { return }
            let moves = members.compactMap { m in nodes[m.id].map { (cardId: m.id, x: $0.x, y: $0.y) } }
            persist { try await $0.moveGroup(gid, x: g.x, y: g.y, members: moves) }
        case let .resize(gid):
            guard let g = groups[gid] else { return }
            persist { try await $0.updateGroup(gid, ["w": g.w, "h": g.h]) }
            reconcileMemberships()
        case let .link(sourceId):
            let target = linkTarget
            linkDraft = nil
            guard let target else { return }
            let eid = ThoughtMapService.edgeId(sourceId, target)
            if edges[eid] == nil {
                edges[eid] = MapEdge(id: eid, sourceCardId: sourceId, targetCardId: target, label: "")
                edgeOrder.append(eid)
                persist { try await $0.createEdge(sourceId, target) }
                selection = .edge(eid)
                labelDraft = ""
                editingEdgeId = eid
            } else {
                selection = .edge(eid)
            }
        case let .tap(hit):
            guard !moved else { return }
            switch hit {
            case let .edgeLabel(eid): startEdgeEdit(eid)
            case let .tabOpen(nid): if let card = cards[nid] { onOpen(card) }
            case let .tabRemove(nid): removeNode(nid)
            case let .groupDelete(gid): removeGroup(gid)
            default: break
            }
        }
    }

    func touchesCancelled() {
        // A cancelled gesture ends like a lift (the web's onPointerCancel = onPointerUp).
        if pinch == nil, touches.first != nil { finishDrag(at: last) }
        touches = []
        pinch = nil
        drag = nil
        panning = false
        dragNodeId = nil
        linkDraft = nil
    }

    // MARK: - Edits

    private func persist(_ work: @escaping (ThoughtMapService) async throws -> Void) {
        guard let service else { return }
        Task {
            do { try await work(service) } catch {
                #if DEBUG
                print("Thought map write failed: \(error)")
                #endif
            }
        }
    }

    /// The tray's pick: onto the middle of the view, nudged per card already there, clear of the others.
    func addCard(_ card: MapCard) {
        let center = screenToWorld(camera, viewport.width / 2, viewport.height / 2)
        let k = Double(nodes.count % 5)
        let rect = Rect(x: center.x - mapNodeW / 2 + k * 28, y: center.y - mapNodeH / 2 + k * 22, w: mapNodeW, h: mapNodeH)
        let pos = resolveOverlap(rect, nodeOrder.compactMap(nodeRect))
        let groupId = majorityGroupId(mapNodeRect(pos.x, pos.y), groupRects)
        nodes[card.id] = MapNode(cardId: card.id, x: pos.x, y: pos.y, groupId: groupId)
        nodeOrder.append(card.id)
        trayOpen = false
        persist { service in
            try await service.addNode(card.id, x: pos.x, y: pos.y)
            if let groupId { try await service.setNodeGroups([(card.id, groupId)]) }
        }
    }

    func addGroup() async {
        guard let service else { return }
        let center = screenToWorld(camera, viewport.width / 2, viewport.height / 2)
        let hue = Self.groupHues[groups.count % Self.groupHues.count]
        let title = L10n.Me.ThoughtMap.newGroup
        let (x, y, w, h) = (center.x - 230, center.y - 170, 460.0, 340.0)
        // The region appears once it's written (it needs its id), as on the web.
        guard let id = try? await service.createGroup(title: title, hue: hue, x: x, y: y, w: w, h: h) else { return }
        groups[id] = MapGroup(id: id, title: title, hue: hue, x: x, y: y, w: w, h: h)
        groupOrder.append(id)
        selection = .group(id)
        startGroupRename(id)
    }

    func removeNode(_ id: String) {
        nodes[id] = nil
        nodeOrder.removeAll { $0 == id }
        let gone = edgeOrder.filter { edges[$0]?.sourceCardId == id || edges[$0]?.targetCardId == id }
        for e in gone { edges[e] = nil }
        edgeOrder.removeAll { gone.contains($0) }
        if selection == .node(id) { selection = nil }
        persist { try await $0.removeNode(id) }
    }

    func removeEdge(_ id: String) {
        edges[id] = nil
        edgeOrder.removeAll { $0 == id }
        if selection == .edge(id) { selection = nil }
        if editingEdgeId == id { editingEdgeId = nil }
        persist { try await $0.removeEdge(id) }
    }

    func removeGroup(_ id: String) {
        groups[id] = nil
        groupOrder.removeAll { $0 == id }
        for nid in nodeOrder where nodes[nid]?.groupId == id { nodes[nid]?.groupId = nil }
        if selection == .group(id) { selection = nil }
        persist { try await $0.removeGroup(id) }
    }

    /// After a resize: re-file every card by majority, persisting only the changes.
    private func reconcileMemberships() {
        var changes: [(cardId: String, groupId: String?)] = []
        let rects = groupRects
        for id in nodeOrder {
            guard let n = nodes[id] else { continue }
            let g = majorityGroupId(mapNodeRect(n.x, n.y), rects)
            if g != n.groupId {
                nodes[id]?.groupId = g
                changes.append((id, g))
            }
        }
        persist { try await $0.setNodeGroups(changes) }
    }

    func startGroupRename(_ id: String) {
        guard let g = groups[id] else { return }
        groupDraft = g.title
        editingGroupId = id
    }

    func commitGroupTitle() {
        guard let id = editingGroupId else { return }
        editingGroupId = nil
        let trimmed = groupDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = trimmed.isEmpty ? L10n.Me.ThoughtMap.newGroup : trimmed
        guard groups[id] != nil, groups[id]?.title != title else { return }
        groups[id]?.title = title
        persist { try await $0.updateGroup(id, ["title": title]) }
    }

    func startEdgeEdit(_ id: String) {
        guard let e = edges[id] else { return }
        selection = .edge(id)
        labelDraft = e.label
        editingEdgeId = id
    }

    func commitEdgeLabel() {
        guard let id = editingEdgeId else { return }
        editingEdgeId = nil
        let label = labelDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard edges[id] != nil else { return }
        edges[id]?.label = label
        persist { try await $0.updateEdgeLabel(id, label) }
    }

    /// Tapping the map ends any in-place editing (the web's blur).
    func commitEditors() {
        if editingGroupId != nil { commitGroupTitle() }
        if editingEdgeId != nil { commitEdgeLabel() }
    }
}
