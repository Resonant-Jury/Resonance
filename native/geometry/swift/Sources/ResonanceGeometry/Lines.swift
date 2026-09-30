import Foundation

// MARK: - Wavy lines (src/lib/design/wavyPath.ts)

/// Horizontal hand-drawn line from (0,0) to (W,0), wobbling in y.
public func wavyLine(_ W: Double, seed: Double = 1, amp: Double = 2, steps: Int = 5) -> [PathCommand] {
    var rnd = Prng(seed: seed)
    var pts: [Point] = []
    for i in 0...steps {
        let t = Double(i) / Double(steps)
        let y = (i == 0 || i == steps) ? 0 : (rnd.next() - 0.5) * 2 * amp
        pts.append((t * W, y))
    }
    var path: [PathCommand] = [.move(pts[0].x, pts[0].y)]
    for i in 1..<pts.count {
        let (x0, y0) = pts[i - 1], (x1, y1) = pts[i]
        let h = (x1 - x0) / 3
        path.append(.cubic(x0 + h, y0, x1 - h, y1, x1, y1))
    }
    return path
}

/// A pen's wavy underline at its real width (wavyPath.ts `penWave`): a crest
/// every ~`half`, alternating up and down, each crest's height and place
/// nudged by the seed, settling on the line at both ends.
public func penWavePoints(_ W: Double, seed: Double = 1, amp: Double = 1.2, half: Double = 4.5) -> [Point] {
    var rnd = Prng(seed: seed)
    let n = max(2, Int(jsRound(W / half)))
    let step = W / Double(n)
    var pts: [Point] = []
    for i in 0...n {
        if i == 0 || i == n {
            pts.append((Double(i) * step, 0))
            continue
        }
        let x = Double(i) * step + (rnd.next() - 0.5) * step * 0.3
        let y = (i % 2 == 1 ? -1.0 : 1.0) * amp * (0.65 + 0.7 * rnd.next())
        pts.append((x, y))
    }
    return pts
}

public func penWave(_ W: Double, seed: Double = 1, amp: Double = 1.2, half: Double = 4.5) -> [PathCommand] {
    pointsToBezier(penWavePoints(W, seed: seed, amp: amp, half: half))
}

/// Vertical sibling of ``wavyLine`` — runs down the y-axis, wobbling in x.
public func wavyVertical(_ H: Double, seed: Double = 1, amp: Double = 2, steps: Int = 5) -> [PathCommand] {
    var rnd = Prng(seed: seed)
    var pts: [Point] = []
    for i in 0...steps {
        let t = Double(i) / Double(steps)
        let x = (i == 0 || i == steps) ? 0 : (rnd.next() - 0.5) * 2 * amp
        pts.append((x, t * H))
    }
    var path: [PathCommand] = [.move(pts[0].x, pts[0].y)]
    for i in 1..<pts.count {
        let (x0, y0) = pts[i - 1], (x1, y1) = pts[i]
        let v = (y1 - y0) / 3
        path.append(.cubic(x0, y0 + v, x1, y1 - v, x1, y1))
    }
    return path
}

/// Points along a wavy baseline (headers, section edges).
public func wavyPoints(_ W: Double, y0: Double, amp: Double, seed: Double, steps: Int) -> [Point] {
    var rnd = Prng(seed: seed)
    var pts: [Point] = []
    for i in 0...steps {
        let t = Double(i) / Double(steps)
        let interior = i > 0 && i < steps
        let x = t * W + (interior ? (rnd.next() - 0.5) * (W / Double(steps)) * 0.18 : 0)
        let y = (i == 0 || i == steps) ? y0 : y0 - (rnd.next() - 0.5) * 2 * amp
        pts.append((x, y))
    }
    return pts
}

/// Smooth cubic through points with horizontal handles at each midpoint.
public func pointsToBezier(_ pts: [Point]) -> [PathCommand] {
    var path: [PathCommand] = [.move(pts[0].x, pts[0].y)]
    for i in 1..<pts.count {
        let (x0, y0) = pts[i - 1], (x1, y1) = pts[i]
        let midX = (x0 + x1) / 2
        path.append(.cubic(midX, y0, midX, y1, x1, y1))
    }
    return path
}

// MARK: - Thought-map arrows (src/lib/design/edgePath.ts)

public struct Rect: Sendable, Equatable {
    public var x, y, w, h: Double
    public init(x: Double, y: Double, w: Double, h: Double) {
        self.x = x
        self.y = y
        self.w = w
        self.h = h
    }
}

public struct EdgeAnchor: Sendable, Equatable {
    public var x, y, nx, ny: Double
}

public struct EdgeGeometry: Sendable {
    public var path: [PathCommand]
    public var start: EdgeAnchor
    public var end: EdgeAnchor
    public var mid: Point
    public var endAngle: Double
}

public func rectAnchor(_ rect: Rect, toward: Point) -> EdgeAnchor {
    let cx = rect.x + rect.w / 2
    let cy = rect.y + rect.h / 2
    let dx = toward.x - cx
    let dy = toward.y - cy
    if abs(dx) >= abs(dy) {
        let m = min(14, rect.h / 2)
        let slide = min(rect.h / 2 - m, max(-rect.h / 2 + m, dy * 0.25))
        return dx >= 0
            ? EdgeAnchor(x: rect.x + rect.w, y: cy + slide, nx: 1, ny: 0)
            : EdgeAnchor(x: rect.x, y: cy + slide, nx: -1, ny: 0)
    }
    let m = min(14, rect.w / 2)
    let slide = min(rect.w / 2 - m, max(-rect.w / 2 + m, dx * 0.25))
    return dy >= 0
        ? EdgeAnchor(x: cx + slide, y: rect.y + rect.h, nx: 0, ny: 1)
        : EdgeAnchor(x: cx + slide, y: rect.y, nx: 0, ny: -1)
}

public func organicEdgePath(_ source: Rect, _ target: Rect, seed: Double) -> EdgeGeometry {
    var rnd = Prng(seed: seed)
    let sc: Point = (source.x + source.w / 2, source.y + source.h / 2)
    let tc: Point = (target.x + target.w / 2, target.y + target.h / 2)
    let start = rectAnchor(source, toward: tc)
    let end = rectAnchor(target, toward: sc)

    let dist = hypot(end.x - start.x, end.y - start.y)
    let reach = min(150, max(26, dist * 0.38))
    func jitter() -> Double { (rnd.next() - 0.5) * min(18, dist * 0.12) }

    let p0: Point = (start.x, start.y)
    let p1x = start.x + start.nx * reach + (start.nx == 0 ? jitter() : 0)
    let p1y = start.y + start.ny * reach + (start.ny == 0 ? jitter() : 0)
    let p2x = end.x + end.nx * reach + (end.nx == 0 ? jitter() : 0)
    let p2y = end.y + end.ny * reach + (end.ny == 0 ? jitter() : 0)
    let p3: Point = (end.x, end.y)

    // Point on the cubic at t = 0.5, rounded like the web's label anchor.
    let midX = 0.125 * p0.x + 0.375 * p1x + 0.375 * p2x + 0.125 * p3.x
    let midY = 0.125 * p0.y + 0.375 * p1y + 0.375 * p2y + 0.125 * p3.y
    return EdgeGeometry(
        path: [.move(p0.x, p0.y), .cubic(p1x, p1y, p2x, p2y, p3.x, p3.y)],
        start: start,
        end: end,
        mid: (jsRound2(midX), jsRound2(midY)),
        endAngle: atan2(p3.y - p2y, p3.x - p2x)
    )
}

/// Two swept-back pen flicks forming an arrowhead at `tip`.
public func arrowHeadPath(tip: Point, angle: Double, size: Double, seed: Double) -> [PathCommand] {
    var rnd = Prng(seed: seed)
    let spread = 0.46
    func wing(_ sign: Double) -> [PathCommand] {
        let a = angle + .pi + sign * (spread + (rnd.next() - 0.5) * 0.12)
        let len = size * (0.92 + rnd.next() * 0.2)
        let ex = tip.x + cos(a) * len
        let ey = tip.y + sin(a) * len
        let mx = tip.x + cos(a) * len * 0.5 + cos(a + .pi / 2) * sign * size * 0.12
        let my = tip.y + sin(a) * len * 0.5 + sin(a + .pi / 2) * sign * size * 0.12
        return [.move(tip.x, tip.y), .quad(mx, my, ex, ey)]
    }
    return wing(1) + wing(-1)
}

// MARK: - Organic menu rows (src/lib/design/rowMenu.ts)

/// Wavy boundary between two menu rows. Rounded like the web because the
/// rounded points feed the divider and region paths.
public func rowBoundary(y: Double, w: Double, seed: Double, amp: Double, pad: Double) -> [Point] {
    let steps = 4
    var rnd = Prng(seed: seed)
    var pts: [Point] = [(-pad, jsRound2(y))]
    for k in 0...steps {
        let x = Double(k) / Double(steps) * w
        let off = (k == 0 || k == steps) ? 0 : (rnd.next() - 0.5) * 2 * amp
        pts.append((jsRound2(x), jsRound2(y + off)))
    }
    pts.append((w + pad, jsRound2(y)))
    return pts
}

func rowSegs(_ pts: [Point]) -> [PathCommand] {
    var out: [PathCommand] = []
    for i in 1..<pts.count {
        let (x0, y0) = pts[i - 1], (x1, y1) = pts[i]
        let hx = (x1 - x0) / 3
        out.append(.cubic(x0 + hx, y0, x1 - hx, y1, x1, y1))
    }
    return out
}

public func dividerPath(_ pts: [Point]) -> [PathCommand] {
    [.move(pts[0].x, pts[0].y)] + rowSegs(pts)
}

/// Closed region for row `i`, between the wavy boundaries above and below it.
public func rowRegion(_ i: Int, count: Int, boundaries: [[Point]], w: Double, h: Double, pad: Double) -> [PathCommand] {
    let top: [Point] = i == 0 ? [(-pad, -pad), (w + pad, -pad)] : boundaries[i - 1]
    let bottom: [Point] = i == count - 1 ? [(-pad, h + pad), (w + pad, h + pad)] : boundaries[i]
    let botRev = Array(bottom.reversed())
    return [.move(top[0].x, top[0].y)] + rowSegs(top) + [.line(botRev[0].x, botRev[0].y)] + rowSegs(botRev) + [.close]
}
