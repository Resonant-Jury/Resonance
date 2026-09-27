import SwiftUI

/// feTurbulence's lattice (SVG 1.1 §15.25 reference `init`), built once per
/// seed on the CPU and passed to Grain.metal as a flat float table.
enum TurbulenceLattice {
    private static let bSize = 0x100
    private static let n = bSize + bSize + 2
    private static var cache: [Int: [Float]] = [:]

    static func table(seed: Int) -> [Float] {
        if let hit = cache[seed] { return hit }
        let randM = 2147483647, randA = 16807, randQ = 127773, randR = 2836
        func random(_ s: Int) -> Int {
            var r = randA * (s % randQ) - randR * (s / randQ)
            if r <= 0 { r += randM }
            return r
        }
        var s = seed
        if s <= 0 { s = -(s % (randM - 1)) + 1 }
        if s > randM - 1 { s = randM - 1 }

        var selector = [Int](repeating: 0, count: n)
        var gradient = [[Double]](repeating: [Double](repeating: 0, count: n * 2), count: 4)
        for k in 0..<4 {
            for i in 0..<bSize {
                selector[i] = i
                for j in 0..<2 {
                    s = random(s)
                    gradient[k][i * 2 + j] = Double((s % (bSize + bSize)) - bSize) / Double(bSize)
                }
                let gx = gradient[k][i * 2], gy = gradient[k][i * 2 + 1]
                let len = (gx * gx + gy * gy).squareRoot()
                gradient[k][i * 2] = gx / len
                gradient[k][i * 2 + 1] = gy / len
            }
        }
        var i = bSize - 1
        while i > 0 {
            let k = selector[i]
            s = random(s)
            let j = s % bSize
            selector[i] = selector[j]
            selector[j] = k
            i -= 1
        }
        for i in 0..<(bSize + 2) {
            selector[bSize + i] = selector[i]
            for k in 0..<4 {
                gradient[k][(bSize + i) * 2] = gradient[k][i * 2]
                gradient[k][(bSize + i) * 2 + 1] = gradient[k][i * 2 + 1]
            }
        }
        let table = selector.map(Float.init) + gradient.flatMap { $0.map(Float.init) }
        cache[seed] = table
        return table
    }
}

extension View {
    /// The web's grain computed per pixel on the GPU (see Grain.metal).
    /// Apply to a filled shape: the fill's coverage becomes the clip.
    public func turbulenceGrain(frequency: Double, octaves: Int, seed: Int, opacity: Double, mode: Float = 0) -> some View {
        let table = TurbulenceLattice.table(seed: seed)
        return visualEffect { content, proxy in
            content.colorEffect(ShaderLibrary.bundle(.module).grain(
                .floatArray(table),
                .float2(proxy.size),
                .float(frequency),
                .float(Float(octaves)),
                .float(opacity),
                .float(mode)
            ))
        }
    }
}
