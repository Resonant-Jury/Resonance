import Foundation

// MARK: - Thought-map math (src/components/molecules/ThoughtMap/mapMath.ts)

/// A card on the map is always this size, in world units.
public let mapNodeW: Double = 232
public let mapNodeH: Double = 178
public let mapMinScale: Double = 0.25
public let mapMaxScale: Double = 2

/// The map's camera: `screen = world × s + (x, y)`.
public struct MapCamera: Sendable, Equatable {
    public var x, y, s: Double
    public init(x: Double, y: Double, s: Double) {
        self.x = x
        self.y = y
        self.s = s
    }
}

public struct MapGroupRect: Sendable, Equatable {
    public var id: String
    public var rect: Rect
    public init(id: String, rect: Rect) {
        self.id = id
        self.rect = rect
    }
}

public func screenToWorld(_ cam: MapCamera, _ px: Double, _ py: Double) -> Point {
    ((px - cam.x) / cam.s, (py - cam.y) / cam.s)
}

/// Zoom by `factor` keeping the world point under (px, py) fixed; the scale is clamped.
public func zoomAt(_ cam: MapCamera, _ px: Double, _ py: Double, _ factor: Double) -> MapCamera {
    let s = clamp(cam.s * factor, mapMinScale, mapMaxScale)
    let k = s / cam.s
    return MapCamera(x: px - (px - cam.x) * k, y: py - (py - cam.y) * k, s: s)
}

public func mapNodeRect(_ x: Double, _ y: Double) -> Rect {
    Rect(x: x, y: y, w: mapNodeW, h: mapNodeH)
}

/// Inclusive on every edge.
public func rectContains(_ r: Rect, _ p: Point) -> Bool {
    p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

/// Strict: touching edges don't intersect.
public func rectsIntersect(_ a: Rect, _ b: Rect) -> Bool {
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

public func inflateRect(_ r: Rect, _ pad: Double) -> Rect {
    Rect(x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad)
}

/// The fraction of `rect` that lies inside `outer`.
public func coverage(_ rect: Rect, _ outer: Rect) -> Double {
    let ox = min(rect.x + rect.w, outer.x + outer.w) - max(rect.x, outer.x)
    let oy = min(rect.y + rect.h, outer.y + outer.h) - max(rect.y, outer.y)
    if ox <= 0 || oy <= 0 { return 0 }
    return ox * oy / (rect.w * rect.h)
}

/// The region a card is filed in: of those covering more than half of it, the smallest.
public func majorityGroupId(_ rect: Rect, _ groups: [MapGroupRect]) -> String? {
    var best: MapGroupRect?
    for g in groups where coverage(rect, g.rect) > 0.5 {
        if best == nil || g.rect.w * g.rect.h < best!.rect.w * best!.rect.h { best = g }
    }
    return best?.id
}

/// Nudge `rect` along the shallower axis until it clears every obstacle by `gap` (at most 16 passes).
public func resolveOverlap(_ rect: Rect, _ obstacles: [Rect], gap: Double = 12) -> Point {
    var x = rect.x, y = rect.y
    for _ in 0..<16 {
        var moved = false
        for o in obstacles {
            let ox = min(x + rect.w, o.x + o.w + gap) - max(x, o.x - gap)
            let oy = min(y + rect.h, o.y + o.h + gap) - max(y, o.y - gap)
            if ox <= 0 || oy <= 0 { continue }
            if ox <= oy {
                x += (x + rect.w / 2 >= o.x + o.w / 2) ? ox : -ox
            } else {
                y += (y + rect.h / 2 >= o.y + o.h / 2) ? oy : -oy
            }
            moved = true
        }
        if !moved { break }
    }
    return (x, y)
}

/// The camera that shows every rect with `pad` around them (never zooming in past 1).
public func fitCamera(_ rects: [Rect], _ vw: Double, _ vh: Double, pad: Double = 70) -> MapCamera {
    guard !rects.isEmpty, vw > 0, vh > 0 else { return MapCamera(x: vw / 2 - 120, y: vh / 2 - 90, s: 1) }
    let x0 = rects.map(\.x).min()!, y0 = rects.map(\.y).min()!
    let x1 = rects.map { $0.x + $0.w }.max()!, y1 = rects.map { $0.y + $0.h }.max()!
    let bw = max(1, x1 - x0), bh = max(1, y1 - y0)
    let s = clamp(min((vw - 2 * pad) / bw, (vh - 2 * pad) / bh, 1), mapMinScale, mapMaxScale)
    return MapCamera(x: (vw - bw * s) / 2 - x0 * s, y: (vh - bh * s) / 2 - y0 * s, s: s)
}
