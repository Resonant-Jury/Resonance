import Foundation

// MARK: - Path commands

/// One drawing command, in the same order and meaning as the SVG path strings
/// the web builds (`M`, `L`, `C`, `Q`, `Z`). Keeping the command list (not a
/// platform path) as the output makes every shape testable without UIKit.
public enum PathCommand: Equatable, Sendable {
    case move(Double, Double)
    case line(Double, Double)
    case cubic(Double, Double, Double, Double, Double, Double)
    case quad(Double, Double, Double, Double)
    case close

    public var letter: Character {
        switch self {
        case .move: "M"
        case .line: "L"
        case .cubic: "C"
        case .quad: "Q"
        case .close: "Z"
        }
    }

    public var numbers: [Double] {
        switch self {
        case let .move(x, y), let .line(x, y): [x, y]
        case let .cubic(a, b, c, d, e, f): [a, b, c, d, e, f]
        case let .quad(a, b, c, d): [a, b, c, d]
        case .close: []
        }
    }
}

extension Array where Element == PathCommand {
    /// SVG path data, formatted like the web (two decimals) — handy for debugging.
    public var svg: String {
        map { cmd in
            let nums = cmd.numbers.map { String(format: "%.2f", $0) }
            switch cmd {
            case .close: return "Z"
            case .move, .line: return "\(cmd.letter) \(nums[0]),\(nums[1])"
            case .cubic: return "C \(nums[0]),\(nums[1]) \(nums[2]),\(nums[3]) \(nums[4]),\(nums[5])"
            case .quad: return "Q \(nums[0]),\(nums[1]) \(nums[2]),\(nums[3])"
            }
        }.joined(separator: " ")
    }
}

public typealias Point = (x: Double, y: Double)

// MARK: - JS number semantics

/// `+n.toFixed(2)` — used where the web rounds a value *before* computing with
/// it again (row menus, edge midpoints).
///
/// toFixed rounds the *exact* decimal value of the double. `(n * 100).rounded()`
/// does not: the multiply can round a value just below .xx5 up onto the tie
/// (92.774999… × 100 → 9277.5), which the golden fixtures caught. printf also
/// rounds the exact value, but breaks true ties to even where toFixed goes
/// away from zero — and a true tie at two decimals means n = odd / 8.
public func jsRound2(_ n: Double) -> Double {
    let eighths = n * 8 // exact: scaling by a power of two
    if eighths == eighths.rounded(.towardZero), eighths.truncatingRemainder(dividingBy: 2) != 0 {
        let away = (abs(n) * 100).rounded(.up) / 100 // n*100 = odd*12.5, exact
        return n < 0 ? -away : away
    }
    return Double(String(format: "%.2f", n))!
}

/// `Math.round` — half rounds toward +∞.
@inlinable
public func jsRound(_ n: Double) -> Double {
    (n + 0.5).rounded(.down)
}

// MARK: - Seeded PRNG (src/lib/design/prng.ts)

/// The web's linear congruential generator. It runs on Doubles with a
/// truncating remainder — exactly JavaScript's `number` and `%` — so every
/// seed (including negative or fractional ones) yields the same sequence.
public struct Prng: Sendable {
    private var s: Double

    public init(seed: Double) {
        s = (seed * 9301 + 49297).truncatingRemainder(dividingBy: 233280)
    }

    public mutating func next() -> Double {
        s = (s * 9301 + 49297).truncatingRemainder(dividingBy: 233280)
        return s / 233280
    }
}

/// Stable small seed from a string (`seedFromString`). Walks UTF-16 code
/// units like `charCodeAt`, and wraps at 32 bits like the web's `| 0`.
public func seedFromString(_ string: String) -> Int {
    var h: Int32 = 0
    for unit in string.utf16 {
        h = h &* 31 &+ Int32(unit)
    }
    // Math.abs(-2^31) is 2^31 in JS; Int32 would overflow, so widen first.
    return Int(Int64(h).magnitude % 9973) + 1
}

// MARK: - Size-aware defaults (src/lib/design/wobAuto.ts)

@inlinable func clamp(_ n: Double, _ lo: Double, _ hi: Double) -> Double { max(lo, min(hi, n)) }

public func autoSegments(_ edge: Double) -> Int { Int(clamp(jsRound(edge / 95), 2, 8)) }
public func autoMag(_ w: Double, _ h: Double) -> Double { clamp(2 + min(w, h) * 0.013, 2.4, 4) }
public func autoCurve(_ w: Double, _ h: Double) -> Double { clamp(1.8 - min(w, h) * 0.003, 0.6, 1.6) }
