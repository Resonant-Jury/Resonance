import DesignSystem
import ResonanceKit
import SwiftUI

// The map's layers, bottom to top in the web's paint order: the dot grid;
// regions and arrows; the regions' titles; the cards (filed ones inside their
// region's clip, then the free ones); the arrow being drawn and the regions'
// rims re-inked over the cards; the arrows' words. None takes touches — the
// touch surface above them hit-tests in world coordinates.

private func cgPath(_ commands: [PathCommand]) -> Path { commands.path() }

private func regionPath(_ g: MapGroup) -> Path {
    let w = g.w, h = g.h
    let options = WobRectOptions(curve: 0.6, cornerOffset: 5, segmentsH: .count(Double(autoSegments(w))),
                                 segmentsV: .count(Double(autoSegments(h))))
    return GeometryCache.shared.path(key: "region|\(g.id)|\(w)|\(h)") {
        wobRect(w, h, min(34, min(w, h) / 2), seed: Double(seedFromString(g.id)), mag: autoMag(w, h), options: options)
    }.path(offsetX: g.x, offsetY: g.y)
}

/// Transforms a canvas into world space, so strokes stay crisp at any zoom.
private func worldTransform(_ cam: MapCamera) -> CGAffineTransform {
    CGAffineTransform(translationX: cam.x, y: cam.y).scaledBy(x: cam.s, y: cam.s)
}

/// The dot grid (card-bg paper, a dot per 26-unit tile).
struct MapGridLayer: View {
    let store: ThoughtMapStore

    var body: some View {
        let cam = store.camera
        Rectangle()
            .fill(Tokens.cardBg)
            .colorEffect(ShaderLibrary.mapDots(.float(26 * cam.s), .float2(Float(cam.x), Float(cam.y)),
                                                .color(OKLCHColor.color(0.82, 0.025, 75))))
    }
}

/// Regions (fill and rim) and the arrows between cards, with their heads.
struct MapUnderLayer: View {
    let store: ThoughtMapStore

    var body: some View {
        let cam = store.camera
        let groups = store.groupOrder.compactMap { store.groups[$0] }
        let edges = store.edgeOrder.compactMap { store.edges[$0] }
        let selection = store.selection
        let hot = store.dragNodeId.flatMap { store.nodes[$0]?.groupId }
        let geometries = edges.map { ($0, store.edgeGeometry($0)) }
        Canvas { ctx, _ in
            ctx.concatenate(worldTransform(cam))
            for g in groups {
                let path = regionPath(g)
                let isHot = hot == g.id
                let strong = isHot || selection == .group(g.id)
                ctx.fill(path, with: .color(OKLCHColor.color(0.965, 0.032, g.hue, alpha: isHot ? 0.92 : 0.78)))
                ctx.stroke(path, with: .color(strong ? OKLCHColor.color(0.45, 0.1, g.hue) : OKLCHColor.color(0.6, 0.085, g.hue)),
                           style: StrokeStyle(lineWidth: strong ? Tokens.inkStrong : Tokens.inkLight, lineJoin: .round))
            }
            for (edge, geo) in geometries {
                guard let geo else { continue }
                let selected = selection == .edge(edge.id)
                let color = selected ? OKLCHColor.color(0.28, 0.05, 60) : OKLCHColor.color(0.46, 0.045, 60)
                let style = StrokeStyle(lineWidth: selected ? Tokens.inkStrong : Tokens.ink, lineCap: .round)
                ctx.stroke(cgPath(geo.path), with: .color(color), style: style)
                let seed = Double(seedFromString(edge.id)) + 7
                ctx.stroke(cgPath(arrowHeadPath(tip: (geo.end.x, geo.end.y), angle: geo.endAngle, size: 13, seed: seed)),
                           with: .color(color), style: style)
            }
        }
    }
}

/// The arrow being drawn (dashed until it docks) with the docking dots, then
/// the regions' rims re-inked over their cards.
struct MapOverLayer: View {
    let store: ThoughtMapStore

    var body: some View {
        let cam = store.camera
        let groups = store.groupOrder.compactMap { store.groups[$0] }
        let selection = store.selection
        let hot = store.dragNodeId.flatMap { store.nodes[$0]?.groupId }
        let draft = store.linkDraft
        let target = store.linkTarget
        let source = draft.flatMap { store.nodeRect($0.sourceId) }
        let sourceHue = draft.flatMap { store.card($0.sourceId) }.map(ThoughtMapStore.hue) ?? 55
        let near: [Rect] = draft.map { d in
            store.nodeOrder.filter { $0 != d.sourceId }.compactMap(store.nodeRect).filter { rectContains(inflateRect($0, 90), (d.wx, d.wy)) }
        } ?? []
        let targetRect = target.flatMap(store.nodeRect)
        Canvas { ctx, _ in
            ctx.concatenate(worldTransform(cam))
            if let draft, let source {
                let linkColor = OKLCHColor.color(0.52, 0.11, sourceHue)
                let to = targetRect ?? Rect(x: draft.wx - 1, y: draft.wy - 1, w: 2, h: 2)
                let geo = organicEdgePath(source, to, seed: Double(seedFromString(draft.sourceId)))
                let style = StrokeStyle(lineWidth: Tokens.inkStrong, lineCap: .round, dash: targetRect == nil ? [7, 6] : [])
                ctx.stroke(cgPath(geo.path), with: .color(linkColor), style: style)
                ctx.stroke(cgPath(arrowHeadPath(tip: (geo.end.x, geo.end.y), angle: geo.endAngle, size: 15,
                                                seed: Double(seedFromString(draft.sourceId)) + 7)),
                           with: .color(linkColor), style: StrokeStyle(lineWidth: Tokens.inkStrong, lineCap: .round))
                for r in near {
                    let docked = r == targetRect
                    let radius = docked ? 7.0 : 5.5
                    for (x, y) in [(r.x + r.w / 2, r.y), (r.x + r.w, r.y + r.h / 2), (r.x + r.w / 2, r.y + r.h), (r.x, r.y + r.h / 2)] {
                        let dot = Path(ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
                        ctx.fill(dot, with: .color(docked ? linkColor : Tokens.cardBg))
                        ctx.stroke(dot, with: .color(linkColor), lineWidth: Tokens.ink)
                    }
                }
            }
            for g in groups {
                let strong = hot == g.id || selection == .group(g.id)
                ctx.stroke(regionPath(g), with: .color(strong ? OKLCHColor.color(0.45, 0.1, g.hue) : OKLCHColor.color(0.6, 0.085, g.hue)),
                           style: StrokeStyle(lineWidth: strong ? Tokens.inkStrong : Tokens.inkLight, lineJoin: .round))
            }
        }
    }
}

/// Places world content under the camera (scale about the world origin, then translate).
struct MapCameraTransform<Content: View>: View {
    let store: ThoughtMapStore
    @ViewBuilder let content: Content

    var body: some View {
        let cam = store.camera
        content
            .frame(width: 0, height: 0, alignment: .topLeading)
            .scaleEffect(cam.s, anchor: .topLeading)
            .offset(x: cam.x, y: cam.y)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Region titles and their corner trash (under the cards, as on the web).
struct MapRegionChrome: View {
    let store: ThoughtMapStore

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(store.groupOrder, id: \.self) { id in
                if let g = store.groups[id] {
                    if store.editingGroupId != id {
                        Text(g.title)
                            .font(AppFonts.heading(16, weight: .bold))
                            .foregroundStyle(Tokens.text)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(width: max(0, g.w - 44 - 40), alignment: .leading)
                            .offset(x: g.x + 20, y: g.y + 12)
                    }
                    OrganicIcon(.trash, size: 15)
                        .foregroundStyle(Tokens.textMuted)
                        .frame(width: 28, height: 28)
                        .offset(x: g.x + g.w - 10 - 28, y: g.y + 8)
                }
            }
        }
    }
}

/// The cards: each region's members clipped to its rounded box, then the free ones.
struct MapNodesLayer: View {
    let store: ThoughtMapStore

    var body: some View {
        let selection = store.selection
        let dragging = store.dragNodeId
        let target = store.linkTarget
        let linking = store.linkDraft != nil
        ZStack(alignment: .topLeading) {
            ForEach(store.groupOrder, id: \.self) { gid in
                if let g = store.groups[gid] {
                    let members = store.filedOrder.filter { store.nodes[$0]?.groupId == gid }
                    ZStack(alignment: .topLeading) {
                        ForEach(members, id: \.self) { id in
                            node(id, dx: g.x, dy: g.y, selection: selection, dragging: dragging, target: target, linking: linking)
                        }
                    }
                    .frame(width: g.w, height: g.h, alignment: .topLeading)
                    .clipShape(RoundedRectangle(cornerRadius: 30))
                    .offset(x: g.x, y: g.y)
                }
            }
            ForEach(store.freeOrder, id: \.self) { id in
                node(id, dx: 0, dy: 0, selection: selection, dragging: dragging, target: target, linking: linking)
            }
        }
    }

    @ViewBuilder private func node(_ id: String, dx: Double, dy: Double, selection: ThoughtMapStore.Selection?,
                                   dragging: String?, target: String?, linking: Bool) -> some View {
        if let n = store.nodes[id], let card = store.card(id) {
            MapNodeView(card: card, selected: selection == .node(id), linkTarget: target == id,
                        dragging: dragging == id, showsHandle: !linking)
                .equatable()
                .offset(x: n.x - dx, y: n.y - dy)
                .zIndex(dragging == id ? 2 : 0)
        }
    }
}

/// The arrows' words: a small tag pill at each curve's middle (above the cards).
struct MapEdgeLabels: View {
    let store: ThoughtMapStore

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(store.edgeOrder, id: \.self) { id in
                if let e = store.edges[id], store.showsLabel(e), store.editingEdgeId != id, let geo = store.edgeGeometry(e) {
                    let text = store.labelText(e)
                    let size = ThoughtMapStore.pillSize(text)
                    let selected = store.selection == .edge(id)
                    TagPill(text, fill: selected ? OKLCHColor.color(0.88, 0.03, 60) : OKLCHColor.color(0.94, 0.02, 75), size: .sm)
                        .fixedSize()
                        .frame(width: size.width, height: size.height)
                        .offset(x: geo.mid.x - size.width / 2, y: geo.mid.y - size.height / 2)
                }
            }
        }
    }
}
