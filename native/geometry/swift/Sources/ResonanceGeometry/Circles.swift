import Foundation

public struct WobCircleOptions: Sendable {
    public var segments: Int?
    public var mag: Double?
    public var cpJitter: Double?
    public init(segments: Int? = nil, mag: Double? = nil, cpJitter: Double? = nil) {
        self.segments = segments
        self.mag = mag
        self.cpJitter = cpJitter
    }
}

private struct Anchor {
    let x: Double, y: Double, angle: Double, r: Double
}

/// Hand-drawn wobbly circle (src/lib/design/wobCircle.ts).
public func wobCircle(_ cx: Double, _ cy: Double, _ r: Double, seed: Double,
                      options o: WobCircleOptions = WobCircleOptions()) -> [PathCommand] {
    var rnd = Prng(seed: seed)
    let segments = o.segments ?? 8
    let mag = o.mag ?? 1.5
    let cpJitter = o.cpJitter ?? 0.6

    var anchors: [Anchor] = []
    for i in 0..<segments {
        let angle = Double(i) / Double(segments) * .pi * 2
        let rr = r + (rnd.next() - 0.5) * 2 * mag
        anchors.append(Anchor(x: cx + cos(angle) * rr, y: cy + sin(angle) * rr, angle: angle, r: rr))
    }
    let k = (4.0 / 3.0) * tan(.pi / (2 * Double(segments)))
    return arcs(anchors, k: k, cpMag: mag * cpJitter, rnd: &rnd)
}

public struct WobLoopOptions: Sendable {
    public var segments: Int?
    public var mag: Double?
    public var cpJitter: Double?
    public var blend: Double?
    public init(segments: Int? = nil, mag: Double? = nil, cpJitter: Double? = nil, blend: Double? = nil) {
        self.segments = segments
        self.mag = mag
        self.cpJitter = cpJitter
        self.blend = blend
    }
}

/// The SketchLoader's two-lap loop as one closed subpath (src/lib/design/wobLoop.ts).
public func wobLoop(_ cx: Double, _ cy: Double, _ rA: Double, _ rB: Double, seed: Double,
                    options o: WobLoopOptions = WobLoopOptions()) -> [PathCommand] {
    var rnd = Prng(seed: seed)
    let segments = o.segments ?? 8
    let mag = o.mag ?? 1.5
    let cpJitter = o.cpJitter ?? 0.6
    let blend = o.blend ?? 0.12

    func ease(_ x: Double) -> Double { 0.5 - 0.5 * cos(.pi * x) }
    func towardB(_ t: Double) -> Double {
        if t < 0.5 - blend { return 0 }
        if t < 0.5 { return ease((t - (0.5 - blend)) / blend) }
        if t < 1 - blend { return 1 }
        return 1 - ease((t - (1 - blend)) / blend)
    }

    let n = segments * 2
    var anchors: [Anchor] = []
    for i in 0..<n {
        let t = Double(i) / Double(n)
        let angle = t * .pi * 4
        let base = rA + (rB - rA) * towardB(t)
        let rr = base + (rnd.next() - 0.5) * 2 * mag
        anchors.append(Anchor(x: cx + cos(angle) * rr, y: cy + sin(angle) * rr, angle: angle, r: rr))
    }
    let k = (4.0 / 3.0) * tan(.pi / (2 * Double(segments)))
    return arcs(anchors, k: k, cpMag: mag * cpJitter, rnd: &rnd)
}

/// Shared by wobCircle and wobLoop: jittered perpendicular handles between anchors.
private func arcs(_ anchors: [Anchor], k: Double, cpMag: Double, rnd: inout Prng) -> [PathCommand] {
    var path: [PathCommand] = [.move(anchors[0].x, anchors[0].y)]
    for i in 0..<anchors.count {
        let a0 = anchors[i]
        let a1 = anchors[(i + 1) % anchors.count]
        let cp1x = a0.x - sin(a0.angle) * a0.r * k + (rnd.next() - 0.5) * 2 * cpMag
        let cp1y = a0.y + cos(a0.angle) * a0.r * k + (rnd.next() - 0.5) * 2 * cpMag
        let cp2x = a1.x + sin(a1.angle) * a1.r * k + (rnd.next() - 0.5) * 2 * cpMag
        let cp2y = a1.y - cos(a1.angle) * a1.r * k + (rnd.next() - 0.5) * 2 * cpMag
        path.append(.cubic(cp1x, cp1y, cp2x, cp2y, a1.x, a1.y))
    }
    path.append(.close)
    return path
}
