import Foundation

public struct WobTabRectOptions: Sendable {
    public var R: Double?
    public var tabR: Double?
    public var mag: Double?
    public var curve: Double?
    public init(R: Double? = nil, tabR: Double? = nil, mag: Double? = nil, curve: Double? = nil) {
        self.R = R
        self.tabR = tabR
        self.mag = mag
        self.curve = curve
    }
}

/// Card outline with a folder tab rising above it, as one stroke
/// (src/lib/design/wobTabRect.ts). Path space is W × (H + tabH), card top at y = tabH.
public func wobTabRect(_ W: Double, _ H: Double, tabX: Double, tabW: Double, tabH: Double, seed: Double,
                       options o: WobTabRectOptions = WobTabRectOptions()) -> [PathCommand] {
    var rnd = Prng(seed: seed)
    let R = o.R ?? 18
    let tabR = o.tabR ?? 9
    let mag = o.mag ?? 2.4
    let curve = o.curve ?? 1
    let K = 0.552
    let T = tabH

    let perpAmp = min(mag * 0.95 * curve, min(W, H) * 0.032 * max(1, curve))

    func cubic(_ p0: Point, _ p1: Point, horizontal: Bool) -> PathCommand {
        if horizontal {
            let h = abs(p1.x - p0.x) / 3
            let dir: Double = p1.x >= p0.x ? 1 : -1
            return .cubic(p0.x + dir * h, p0.y, p1.x - dir * h, p1.y, p1.x, p1.y)
        }
        let h = abs(p1.y - p0.y) / 3
        let dir: Double = p1.y >= p0.y ? 1 : -1
        return .cubic(p0.x, p0.y + dir * h, p1.x, p1.y - dir * h, p1.x, p1.y)
    }

    func edge(_ p0: Point, _ p1: Point, horizontal: Bool, minSegs: Int = 1) -> [PathCommand] {
        let len = horizontal ? abs(p1.x - p0.x) : abs(p1.y - p0.y)
        let segs = max(minSegs, Int(jsRound(len / 80)))
        if segs < 2 || len < perpAmp * 4 { return [cubic(p0, p1, horizontal: horizontal)] }
        var out: [PathCommand] = []
        var prev = p0
        for i in 1..<segs {
            let t = Double(i) / Double(segs) + (rnd.next() - 0.5) * min(0.08, 0.4 / Double(segs))
            let x = p0.x + (p1.x - p0.x) * t
            let y = p0.y + (p1.y - p0.y) * t
            let a: Point = horizontal
                ? (x, y + (rnd.next() - 0.5) * 2 * perpAmp)
                : (x + (rnd.next() - 0.5) * 2 * perpAmp, y)
            out.append(cubic(prev, a, horizontal: horizontal))
            prev = a
        }
        out.append(cubic(prev, p1, horizontal: horizontal))
        return out
    }

    func jr(_ r: Double) -> Double { r + (rnd.next() - 0.5) * 2 * min(r * 0.12, 2) }
    let Rtl = jr(R), Rtr = jr(R), Rbr = jr(R), Rbl = jr(R)
    let rTl = jr(tabR), rTr = jr(tabR)

    let tabL = max(tabX, Rtl + 1)
    let tabRt = min(tabX + tabW, W - Rtr - 1)

    var p: [PathCommand] = [.move(0, T + Rtl)]
    p.append(.cubic(0, (T + Rtl) * (1 - K) + T * K, Rtl * (1 - K), T, Rtl, T))
    p += edge((Rtl, T), (tabL, T), horizontal: true)
    p += edge((tabL, T), (tabL, rTl), horizontal: false)
    p.append(.cubic(tabL, rTl * (1 - K), (tabL + rTl) - rTl * K, 0, tabL + rTl, 0))
    p += edge((tabL + rTl, 0), (tabRt - rTr, 0), horizontal: true, minSegs: 2)
    p.append(.cubic((tabRt - rTr) + rTr * K, 0, tabRt, rTr * (1 - K), tabRt, rTr))
    p += edge((tabRt, rTr), (tabRt, T), horizontal: false)
    p += edge((tabRt, T), (W - Rtr, T), horizontal: true)
    p.append(.cubic((W - Rtr) + Rtr * K, T, W, (T + Rtr) * (1 - K) + T * K, W, T + Rtr))
    p += edge((W, T + Rtr), (W, T + H - Rbr), horizontal: false, minSegs: 2)
    p.append(.cubic(W, T + H - Rbr * (1 - K), W - Rbr * (1 - K), T + H, W - Rbr, T + H))
    p += edge((W - Rbr, T + H), (Rbl, T + H), horizontal: true, minSegs: 3)
    p.append(.cubic(Rbl * (1 - K), T + H, 0, T + H - Rbl * (1 - K), 0, T + H - Rbl))
    p += edge((0, T + H - Rbl), (0, T + Rtl), horizontal: false, minSegs: 2)
    p.append(.close)
    return p
}
