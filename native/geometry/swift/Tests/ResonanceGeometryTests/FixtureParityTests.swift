import Foundation
import Testing
@testable import ResonanceGeometry

// Every case in native/fixtures/geometry.json (generated from the TypeScript
// in src/lib/design by scripts/native/geometry-fixtures.ts) must come out of
// the Swift port with the same commands and every coordinate within
// `tolerance` (the web rounds its output to 0.01, so ±0.005 is exact parity).

private let fixtureURL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent() // → Tests/ResonanceGeometryTests
    .deletingLastPathComponent() // → Tests
    .deletingLastPathComponent() // → geometry/swift
    .deletingLastPathComponent() // → native/geometry
    .deletingLastPathComponent() // → native
    .appendingPathComponent("fixtures/geometry.json")

nonisolated(unsafe) private let fixtures: [String: Any] = {
    let data = try! Data(contentsOf: fixtureURL)
    return try! JSONSerialization.jsonObject(with: data) as! [String: Any]
}()

private let tolerance = fixtures["tolerance"] as! Double

private func cases(_ family: String) -> [(args: [Any], out: Any)] {
    (fixtures[family] as! [[String: Any]]).map { ($0["args"] as! [Any], $0["out"]!) }
}

private func num(_ v: Any) -> Double { (v as! NSNumber).doubleValue }
private func optNum(_ v: Any?) -> Double? { v is NSNull || v == nil ? nil : num(v!) }
private func dict(_ v: Any) -> [String: Any]? { v as? [String: Any] }

/// Tokenise SVG path data the web produced into command letters + numbers.
private func parseSVG(_ d: String) -> (letters: [Character], numbers: [Double]) {
    var letters: [Character] = []
    var numbers: [Double] = []
    var token = ""
    func flush() {
        if !token.isEmpty { numbers.append(Double(token)!); token = "" }
    }
    for ch in d {
        if "MLCQZ".contains(ch) { flush(); letters.append(ch) }
        else if ch == " " || ch == "," { flush() }
        else { token.append(ch) }
    }
    flush()
    return (letters, numbers)
}

/// Largest deviation seen per family — printed so the report can quote it.
private final class MaxError: @unchecked Sendable {
    var value = 0.0
    func track(_ e: Double) { value = max(value, e) }
}

private func expectSame(_ native: [PathCommand], _ web: String, _ label: String, _ worst: MaxError,
                        sourceLocation: SourceLocation = #_sourceLocation) {
    let expected = parseSVG(web)
    #expect(native.map(\.letter) == expected.letters, "\(label): command sequence differs", sourceLocation: sourceLocation)
    let got = native.flatMap(\.numbers)
    #expect(got.count == expected.numbers.count, "\(label): coordinate count differs", sourceLocation: sourceLocation)
    guard got.count == expected.numbers.count else { return }
    let err = zip(got, expected.numbers).map { abs($0 - $1) }.max() ?? 0
    worst.track(err)
    #expect(err <= tolerance, "\(label): max deviation \(err)", sourceLocation: sourceLocation)
}

private func expectClose(_ a: Double, _ b: Double, _ label: String, _ worst: MaxError, tol: Double? = nil,
                         sourceLocation: SourceLocation = #_sourceLocation) {
    let err = abs(a - b)
    worst.track(err)
    #expect(err <= (tol ?? tolerance), "\(label): \(a) vs \(b)", sourceLocation: sourceLocation)
}

private func segValue(_ v: Any?) -> SegValue? {
    guard let v, !(v is NSNull) else { return nil }
    if let pair = v as? [Any] { return .range(Int(num(pair[0])), Int(num(pair[1]))) }
    return .count(num(v))
}

@Suite("Geometry parity with the web")
struct FixtureParityTests {
    @Test func prngSequencesAreIdentical() throws {
        // JSONSerialization's float parsing isn't correctly rounded (it can be
        // 1 ulp off); JSONDecoder is, and bit-identity is the claim here.
        struct PrngCase: Decodable { let args: [Double]; let out: [Double] }
        struct File: Decodable { let prng: [PrngCase] }
        let file = try JSONDecoder().decode(File.self, from: Data(contentsOf: fixtureURL))
        for c in file.prng {
            var r = Prng(seed: c.args[0])
            let got = c.out.map { _ in r.next() }
            // Same IEEE-754 operations in the same order → bit-identical.
            #expect(got == c.out, "seed \(c.args[0])")
        }
    }

    @Test func seedFromStringMatchesUtf16AndInt32Wrap() {
        for c in cases("seedFromString") {
            #expect(seedFromString(c.args[0] as! String) == Int(num(c.out)), "“\(c.args[0])”")
        }
    }

    @Test func autoDefaults() {
        let worst = MaxError()
        for c in cases("wobAuto") {
            let w = num(c.args[0]), h = num(c.args[1])
            let out = dict(c.out)!
            #expect(autoSegments(w) == Int(num(out["segments"]!)))
            expectClose(autoMag(w, h), num(out["mag"]!), "autoMag", worst, tol: 1e-12)
            expectClose(autoCurve(w, h), num(out["curve"]!), "autoCurve", worst, tol: 1e-12)
        }
    }

    @Test func wobRectParity() {
        let worst = MaxError()
        for (i, c) in cases("wobRect").enumerated() {
            let o = dict(c.args[5])
            let options = WobRectOptions(
                curve: optNum(o?["curve"]),
                cornerJitter: optNum(o?["cornerJitter"]),
                cornerOffset: optNum(o?["cornerOffset"]),
                segmentsH: segValue(o?["segmentsH"]),
                segmentsV: segValue(o?["segmentsV"])
            )
            let native = wobRect(num(c.args[0]), num(c.args[1]), num(c.args[2]), seed: num(c.args[3]),
                                 mag: optNum(c.args[4]), options: options)
            expectSame(native, c.out as! String, "wobRect #\(i)", worst)
        }
        print("wobRect max deviation: \(worst.value)")
    }

    @Test func wobCircleParity() {
        let worst = MaxError()
        for (i, c) in cases("wobCircle").enumerated() {
            let o = dict(c.args[4])
            let options = WobCircleOptions(
                segments: optNum(o?["segments"]).map { Int($0) },
                mag: optNum(o?["mag"]),
                cpJitter: optNum(o?["cpJitter"])
            )
            let native = wobCircle(num(c.args[0]), num(c.args[1]), num(c.args[2]), seed: num(c.args[3]), options: options)
            expectSame(native, c.out as! String, "wobCircle #\(i)", worst)
        }
        print("wobCircle max deviation: \(worst.value)")
    }

    @Test func wobLoopParity() {
        let worst = MaxError()
        for (i, c) in cases("wobLoop").enumerated() {
            let o = dict(c.args[5])
            let options = WobLoopOptions(
                segments: optNum(o?["segments"]).map { Int($0) },
                mag: optNum(o?["mag"]),
                cpJitter: optNum(o?["cpJitter"]),
                blend: optNum(o?["blend"])
            )
            let native = wobLoop(num(c.args[0]), num(c.args[1]), num(c.args[2]), num(c.args[3]),
                                 seed: num(c.args[4]), options: options)
            expectSame(native, c.out as! String, "wobLoop #\(i)", worst)
        }
        print("wobLoop max deviation: \(worst.value)")
    }

    @Test func wobTabRectParity() {
        let worst = MaxError()
        for (i, c) in cases("wobTabRect").enumerated() {
            let o = dict(c.args[6])
            let options = WobTabRectOptions(R: optNum(o?["R"]), tabR: optNum(o?["tabR"]),
                                            mag: optNum(o?["mag"]), curve: optNum(o?["curve"]))
            let native = wobTabRect(num(c.args[0]), num(c.args[1]), tabX: num(c.args[2]), tabW: num(c.args[3]),
                                    tabH: num(c.args[4]), seed: num(c.args[5]), options: options)
            expectSame(native, c.out as! String, "wobTabRect #\(i)", worst)
        }
        print("wobTabRect max deviation: \(worst.value)")
    }

    @Test func wavyPathsParity() {
        let worst = MaxError()
        for (i, c) in cases("wavyLine").enumerated() {
            let native = wavyLine(num(c.args[0]), seed: num(c.args[1]), amp: num(c.args[2]), steps: Int(num(c.args[3])))
            expectSame(native, c.out as! String, "wavyLine #\(i)", worst)
        }
        for (i, c) in cases("penWave").enumerated() {
            let native = penWave(num(c.args[0]), seed: num(c.args[1]), amp: num(c.args[2]), half: num(c.args[3]))
            expectSame(native, c.out as! String, "penWave #\(i)", worst)
        }
        for (i, c) in cases("wavyVertical").enumerated() {
            let native = wavyVertical(num(c.args[0]), seed: num(c.args[1]), amp: num(c.args[2]), steps: Int(num(c.args[3])))
            expectSame(native, c.out as! String, "wavyVertical #\(i)", worst)
        }
        for (i, c) in cases("wavyPoints").enumerated() {
            let pts = wavyPoints(num(c.args[0]), y0: num(c.args[1]), amp: num(c.args[2]), seed: num(c.args[3]), steps: Int(num(c.args[4])))
            let out = dict(c.out)!
            let expected = (out["points"] as! [[Any]]).map { (num($0[0]), num($0[1])) }
            #expect(pts.count == expected.count)
            for (p, e) in zip(pts, expected) {
                expectClose(p.x, e.0, "wavyPoints #\(i).x", worst, tol: 1e-9)
                expectClose(p.y, e.1, "wavyPoints #\(i).y", worst, tol: 1e-9)
            }
            expectSame(pointsToBezier(pts), out["bezier"] as! String, "pointsToBezier #\(i)", worst)
        }
        print("wavy paths max deviation: \(worst.value)")
    }

    @Test func thoughtMapEdgesParity() {
        let worst = MaxError()
        func rect(_ v: Any) -> Rect {
            let d = dict(v)!
            return Rect(x: num(d["x"]!), y: num(d["y"]!), w: num(d["w"]!), h: num(d["h"]!))
        }
        func anchor(_ v: Any) -> EdgeAnchor {
            let d = dict(v)!
            return EdgeAnchor(x: num(d["x"]!), y: num(d["y"]!), nx: num(d["nx"]!), ny: num(d["ny"]!))
        }
        for (i, c) in cases("rectAnchor").enumerated() {
            let t = dict(c.args[1])!
            let got = rectAnchor(rect(c.args[0]), toward: (num(t["x"]!), num(t["y"]!)))
            let e = anchor(c.out)
            for (a, b) in [(got.x, e.x), (got.y, e.y), (got.nx, e.nx), (got.ny, e.ny)] {
                expectClose(a, b, "rectAnchor #\(i)", worst, tol: 1e-9)
            }
        }
        for (i, c) in cases("organicEdgePath").enumerated() {
            let g = organicEdgePath(rect(c.args[0]), rect(c.args[1]), seed: num(c.args[2]))
            let out = dict(c.out)!
            expectSame(g.path, out["d"] as! String, "organicEdgePath #\(i)", worst)
            let mid = dict(out["mid"]!)!
            expectClose(g.mid.x, num(mid["x"]!), "edge mid.x #\(i)", worst)
            expectClose(g.mid.y, num(mid["y"]!), "edge mid.y #\(i)", worst)
            expectClose(g.endAngle, num(out["endAngle"]!), "edge angle #\(i)", worst, tol: 1e-9)
            #expect(g.start == anchor(out["start"]!))
        }
        for (i, c) in cases("arrowHeadPath").enumerated() {
            let tip = dict(c.args[0])!
            let native = arrowHeadPath(tip: (num(tip["x"]!), num(tip["y"]!)), angle: num(c.args[1]),
                                       size: num(c.args[2]), seed: num(c.args[3]))
            expectSame(native, c.out as! String, "arrowHead #\(i)", worst)
        }
        print("thought-map edges max deviation: \(worst.value)")
    }

    @Test func organicMenuRowsParity() {
        let worst = MaxError()
        for (i, c) in cases("rowMenu").enumerated() {
            let w = num(c.args[0]), h = num(c.args[1])
            let count = Int(num(c.args[2]))
            let rowH = num(c.args[3]), pad = num(c.args[4]), amp = num(c.args[5]), seed = num(c.args[6])
            let boundaries = (0..<max(0, count - 1)).map { k in
                rowBoundary(y: rowH * Double(k + 1), w: w, seed: seed + Double(k * 7), amp: amp, pad: pad)
            }
            let out = dict(c.out)!
            let expected = out["boundaries"] as! [[[Any]]]
            for (k, (b, e)) in zip(boundaries, expected).enumerated() {
                for (p, q) in zip(b, e) {
                    expectClose(p.x, num(q[0]), "rowBoundary #\(i).\(k)", worst, tol: 1e-9)
                    expectClose(p.y, num(q[1]), "rowBoundary #\(i).\(k)", worst, tol: 1e-9)
                }
            }
            for (k, d) in (out["dividers"] as! [String]).enumerated() {
                expectSame(dividerPath(boundaries[k]), d, "divider #\(i).\(k)", worst)
            }
            for (k, d) in (out["regions"] as! [String]).enumerated() {
                expectSame(rowRegion(k, count: count, boundaries: boundaries, w: w, h: h, pad: pad), d, "region #\(i).\(k)", worst)
            }
        }
        print("organic menu rows max deviation: \(worst.value)")
    }
}

@Suite("JS number semantics")
struct JSNumberTests {
    // Values checked against (n).toFixed(2) in V8. True ties (odd/8) go away
    // from zero; 0.355 / 0.705 / 1.755 are just *below* the tie, where the
    // naive (n * 100).rounded() / 100 rounds up and toFixed doesn't.
    @Test func jsRound2FollowsToFixed() {
        #expect(jsRound2(0.125) == 0.13)
        #expect(jsRound2(-0.125) == -0.13)
        #expect(jsRound2(1.005) == 1.0)
        #expect(jsRound2(0.75 * 123.7) == 92.78)
        #expect(jsRound2(0.355) == 0.35)
        #expect(jsRound2(0.705) == 0.70)
        #expect(jsRound2(1.755) == 1.75)
    }
}
