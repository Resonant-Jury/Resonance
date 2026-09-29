#if canImport(SwiftUI)
import SwiftUI

extension Array where Element == PathCommand {
    /// SwiftUI path, optionally translated (e.g. to inset a stroke).
    public func path(offsetX dx: Double = 0, offsetY dy: Double = 0) -> Path {
        var p = Path()
        for cmd in self {
            switch cmd {
            case let .move(x, y): p.move(to: CGPoint(x: x + dx, y: y + dy))
            case let .line(x, y): p.addLine(to: CGPoint(x: x + dx, y: y + dy))
            case let .cubic(x1, y1, x2, y2, x, y):
                p.addCurve(to: CGPoint(x: x + dx, y: y + dy),
                           control1: CGPoint(x: x1 + dx, y: y1 + dy),
                           control2: CGPoint(x: x2 + dx, y: y2 + dy))
            case let .quad(x1, y1, x, y):
                p.addQuadCurve(to: CGPoint(x: x + dx, y: y + dy), control: CGPoint(x: x1 + dx, y: y1 + dy))
            case .close: p.closeSubpath()
            }
        }
        return p
    }
}

/// The web's `HandDrawnBorder` / `wobRect` as a SwiftUI `Shape`. Size comes
/// from layout (no measuring pass like the web's `useElementSize`); the
/// wobble defaults follow `wobAuto`, exactly like the web component.
public struct WobRectShape: Shape {
    public var radius: Double
    public var seed: Double
    public var mag: Double?
    public var options: WobRectOptions?

    public init(radius: Double = 22, seed: Double = 1, mag: Double? = nil, options: WobRectOptions? = nil) {
        self.radius = radius
        self.seed = seed
        self.mag = mag
        self.options = options
    }

    public func path(in rect: CGRect) -> Path {
        let w = Double(rect.width), h = Double(rect.height)
        guard w > 0, h > 0 else { return Path() }
        let o = options ?? WobRectOptions(curve: autoCurve(w, h),
                                          segmentsH: .count(Double(autoSegments(w))),
                                          segmentsV: .count(Double(autoSegments(h))))
        let r = min(radius, min(w, h) / 2)
        return GeometryCache.shared.path(key: "r|\(w)|\(h)|\(r)|\(seed)|\(mag ?? autoMag(w, h))|\(o.cacheKey)") {
            wobRect(w, h, r, seed: seed, mag: mag ?? autoMag(w, h), options: o)
        }
        .path(offsetX: Double(rect.minX), offsetY: Double(rect.minY))
    }
}

public struct WobCircleShape: Shape {
    public var seed: Double
    public var options: WobCircleOptions
    public init(seed: Double = 1, options: WobCircleOptions = WobCircleOptions()) {
        self.seed = seed
        self.options = options
    }
    public func path(in rect: CGRect) -> Path {
        let r = Double(min(rect.width, rect.height)) / 2
        return wobCircle(Double(rect.midX), Double(rect.midY), r, seed: seed, options: options).path()
    }
}

/// A full-width wavy stroke (dividers, header edges).
public struct WavyLineShape: Shape {
    public var seed: Double
    public var amp: Double
    public var stepsPerPoint: Double
    public init(seed: Double = 1, amp: Double = 1.4, stepsPerPoint: Double = 1.0 / 30) {
        self.seed = seed
        self.amp = amp
        self.stepsPerPoint = stepsPerPoint
    }
    public func path(in rect: CGRect) -> Path {
        let w = Double(rect.width)
        let steps = max(3, Int((w * stepsPerPoint).rounded()))
        return wavyLine(w, seed: seed, amp: amp, steps: steps).path(offsetX: Double(rect.minX), offsetY: Double(rect.midY))
    }
}

extension WobRectOptions {
    var cacheKey: String {
        func seg(_ v: SegValue?) -> String {
            switch v {
            case nil: "-"
            case let .count(n)?: "\(n)"
            case let .range(a, b)?: "\(a)-\(b)"
            }
        }
        return "\(curve ?? -1)|\(cornerJitter ?? -1)|\(cornerOffset ?? -1)|\(seg(segmentsH))|\(seg(segmentsV))"
    }
}

/// Small LRU-ish cache: SwiftUI re-asks `path(in:)` on every layout pass, and a
/// scrolling feed lays out the same few card sizes over and over.
public final class GeometryCache: @unchecked Sendable {
    public static let shared = GeometryCache()
    private var store: [String: [PathCommand]] = [:]
    private var order: [String] = []
    private let lock = NSLock()
    private let limit = 512

    public func path(key: String, make: () -> [PathCommand]) -> [PathCommand] {
        lock.lock()
        if let hit = store[key] {
            lock.unlock()
            return hit
        }
        lock.unlock()
        let value = make()
        lock.lock()
        store[key] = value
        order.append(key)
        if order.count > limit {
            store.removeValue(forKey: order.removeFirst())
        }
        lock.unlock()
        return value
    }
}
#endif
