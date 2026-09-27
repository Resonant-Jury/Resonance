import Foundation

/// `number | [lo, hi]` from the web: a fixed turn count, or a seeded pick in a range.
public enum SegValue: Sendable, Equatable {
    case count(Double)
    case range(Int, Int)
}

public struct WobRectOptions: Sendable {
    public var curve: Double?
    public var cornerJitter: Double?
    public var cornerOffset: Double?
    public var segmentsH: SegValue?
    public var segmentsV: SegValue?

    public init(curve: Double? = nil, cornerJitter: Double? = nil, cornerOffset: Double? = nil,
                segmentsH: SegValue? = nil, segmentsV: SegValue? = nil) {
        self.curve = curve
        self.cornerJitter = cornerJitter
        self.cornerOffset = cornerOffset
        self.segmentsH = segmentsH
        self.segmentsV = segmentsV
    }
}

/// Wobbly rounded rectangle (src/lib/design/wobRect.ts). Corners are bezier
/// quarter-circles with jittered radii; edges are cubics through seeded
/// wobble anchors. Line-for-line with the web, including the order in which
/// the PRNG is consumed — that order *is* the shape.
public func wobRect(_ W: Double, _ H: Double, _ R: Double, seed: Double, mag: Double? = nil,
                    options o: WobRectOptions = WobRectOptions()) -> [PathCommand] {
    var rnd = Prng(seed: seed)
    let m = mag ?? min(W, H) * 0.025
    let K = 0.552
    let curve = o.curve ?? 1
    let cornerJitter = o.cornerJitter ?? 1
    let cornerOffset = o.cornerOffset ?? 0

    func resolveSegs(_ v: SegValue?, _ fallback: Int) -> Int {
        guard let v else { return fallback }
        switch v {
        case let .count(n): return Int(n) // `| 0` truncates toward zero
        case let .range(lo, hi): return lo + Int((rnd.next() * Double(hi - lo + 1)).rounded(.down))
        }
    }
    let segH = resolveSegs(o.segmentsH, 3)
    let segV = resolveSegs(o.segmentsV, 3)

    let rVar = min(R * 0.07, max(0, min(W, H) / 2 - R) * 0.4) * cornerJitter
    let Rtl = R + (rnd.next() - 0.5) * 2 * rVar
    let Rtr = R + (rnd.next() - 0.5) * 2 * rVar
    let Rbr = R + (rnd.next() - 0.5) * 2 * rVar
    let Rbl = R + (rnd.next() - 0.5) * 2 * rVar

    let oCap = max(0, min(W, H) * 0.5 - max(Rtl, Rtr, Rbr, Rbl)) * 0.6
    let oMag = min(cornerOffset, oCap)
    func off() -> Double { (rnd.next() - 0.5) * 2 * oMag }
    let tlX = off(), tlY = off()
    let trX = off(), trY = off()
    let brX = off(), brY = off()
    let blX = off(), blY = off()

    let perpAmp = min(m * 0.95 * curve, min(W, H) * 0.032 * max(1, curve))

    func cubicH(_ p0: Point, _ p1: Point) -> PathCommand {
        let h = abs(p1.x - p0.x) / 3
        let dir: Double = p1.x >= p0.x ? 1 : -1
        return .cubic(p0.x + dir * h, p0.y, p1.x - dir * h, p1.y, p1.x, p1.y)
    }
    func cubicV(_ p0: Point, _ p1: Point) -> PathCommand {
        let h = abs(p1.y - p0.y) / 3
        let dir: Double = p1.y >= p0.y ? 1 : -1
        return .cubic(p0.x, p0.y + dir * h, p1.x, p1.y - dir * h, p1.x, p1.y)
    }
    func buildEdge(_ p0: Point, _ p1: Point, horizontal: Bool, _ segs: Int) -> [PathCommand] {
        let emit = horizontal ? cubicH : cubicV
        let len = horizontal ? abs(p1.x - p0.x) : abs(p1.y - p0.y)
        if segs < 2 || len < perpAmp * 4 { return [emit(p0, p1)] }
        let jitter = min(0.08, 0.4 / Double(segs))
        var out: [PathCommand] = []
        var prev = p0
        for i in 1..<segs {
            let t = Double(i) / Double(segs) + (rnd.next() - 0.5) * jitter
            let x = p0.x + (p1.x - p0.x) * t
            let y = p0.y + (p1.y - p0.y) * t
            let a: Point = horizontal
                ? (x, y + (rnd.next() - 0.5) * 2 * perpAmp)
                : (x + (rnd.next() - 0.5) * 2 * perpAmp, y)
            out.append(emit(prev, a))
            prev = a
        }
        out.append(emit(prev, p1))
        return out
    }

    let TLa: Point = (0, Rtl + tlY)
    let TLb: Point = (Rtl + tlX, 0)
    let TRa: Point = (W - Rtr + trX, 0)
    let TRb: Point = (W, Rtr + trY)
    let BRa: Point = (W, H - Rbr + brY)
    let BRb: Point = (W - Rbr + brX, H)
    let BLa: Point = (Rbl + blX, H)
    let BLb: Point = (0, H - Rbl + blY)

    var path: [PathCommand] = [.move(TLa.x, TLa.y)]
    path.append(.cubic(0, TLa.y * (1 - K) + TLb.y * K, TLb.x * (1 - K) + TLa.x * K, 0, TLb.x, TLb.y))
    path += buildEdge(TLb, TRa, horizontal: true, segH)
    path.append(.cubic(TRa.x + (W - TRa.x) * K, 0, W, TRb.y * (1 - K), TRb.x, TRb.y))
    path += buildEdge(TRb, BRa, horizontal: false, segV)
    path.append(.cubic(W, BRa.y + (H - BRa.y) * K, BRb.x + (W - BRb.x) * K, H, BRb.x, BRb.y))
    path += buildEdge(BRb, BLa, horizontal: true, segH)
    path.append(.cubic(BLa.x * (1 - K), H, 0, BLb.y + (H - BLb.y) * K, BLb.x, BLb.y))
    path += buildEdge(BLb, TLa, horizontal: false, segV)
    path.append(.close)
    return path
}
