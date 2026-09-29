import Testing
@testable import ResonanceGeometry

// Vectors computed from src/components/molecules/ThoughtMap/mapMath.ts (the
// web's own functions, real 232×178 cards) and mapMath.test.ts.

private func near(_ a: Double, _ b: Double, _ tol: Double = 1e-9) -> Bool { abs(a - b) <= tol }
private func near(_ c: MapCamera, _ x: Double, _ y: Double, _ s: Double) -> Bool {
    near(c.x, x, 1e-6) && near(c.y, y, 1e-6) && near(c.s, s, 1e-12)
}
private func node(_ x: Double, _ y: Double) -> Rect { mapNodeRect(x, y) }

struct MapMathTests {
    @Test func screenToWorldAndZoomAt() {
        let cam = MapCamera(x: 40, y: -20, s: 0.5)
        let w = screenToWorld(cam, 140, 80)
        #expect(near(w.x, 200) && near(w.y, 200))
        let o = screenToWorld(cam, 0, 0)
        #expect(near(o.x, -80) && near(o.y, 40))
        #expect(near(zoomAt(cam, 300, 200, 1.3), -38, -86, 0.65))
        #expect(near(zoomAt(cam, 300, 200, 100), -740, -680, 2))
        #expect(near(zoomAt(cam, 0, 0, 0.001), 20, -10, 0.25))
        #expect(near(zoomAt(MapCamera(x: 0, y: 0, s: 1), 195, 422, 1.25), -48.75, -105.5, 1.25))
        #expect(near(zoomAt(MapCamera(x: 0, y: 0, s: 1), 195, 422, 1 / 1.25), 39, 84.4, 0.8))
        #expect(near(zoomAt(MapCamera(x: 10, y: 20, s: 1.6), 100, 100, 1.25), -12.5, 0, 2))
        // The world point under the focus stays put.
        let z = zoomAt(cam, 300, 200, 1.3)
        let before = screenToWorld(cam, 300, 200), after = screenToWorld(z, 300, 200)
        #expect(near(before.x, after.x, 1e-9) && near(before.y, after.y, 1e-9))
    }

    @Test func coverageAndMajority() {
        let outer = Rect(x: 0, y: 0, w: 100, h: 100)
        #expect(coverage(Rect(x: 10, y: 10, w: 20, h: 20), outer) == 1)
        #expect(coverage(Rect(x: 200, y: 0, w: 20, h: 20), outer) == 0)
        #expect(near(coverage(Rect(x: 90, y: 0, w: 20, h: 20), outer), 0.5))

        let groups = [MapGroupRect(id: "g1", rect: Rect(x: 0, y: 0, w: 600, h: 400)),
                      MapGroupRect(id: "inner", rect: Rect(x: 50, y: 50, w: 300, h: 300))]
        #expect(majorityGroupId(node(-116, 100), groups) == nil) // exactly half is not a majority
        #expect(majorityGroupId(node(-115, 100), groups) == "g1")
        #expect(near(coverage(node(-115, 100), groups[0].rect), 0.5043103448275862))
        #expect(majorityGroupId(node(60, 60), groups) == "inner") // the tightest region wins

        // mapMath.test.ts, with its 224×136 cards.
        let small = { (x: Double, y: Double) in Rect(x: x, y: y, w: 224, h: 136) }
        #expect(majorityGroupId(small(-100, 100), groups) == "g1")
        #expect(majorityGroupId(small(-120, 100), groups) == nil)
        #expect(majorityGroupId(small(-112, 100), groups) == nil)
        #expect(majorityGroupId(small(360, 200), groups) == "g1")
        #expect(majorityGroupId(small(450, 100), groups) == "g1")
        #expect(majorityGroupId(small(520, 100), groups) == nil)
    }

    @Test func resolveOverlapSettles() {
        func settle(_ x: Double, _ y: Double, _ obstacles: [Rect]) -> (Double, Double) {
            let p = resolveOverlap(node(x, y), obstacles)
            return (p.x, p.y)
        }
        let o = [node(0, 0)]
        #expect(settle(0, 0, o) == (0, 190)) // two passes: +178, then +12
        #expect(settle(30, 20, o) == (30, 190))
        #expect(settle(-30, 0, o) == (-30, 190))
        #expect(settle(0, 150, o) == (0, 190))
        #expect(settle(244, 0, o) == (244, 0)) // already exactly at the gap
        #expect(settle(243, 0, o) == (244, 0))
        #expect(settle(1000, 1000, o) == (1000, 1000))

        let small = { (x: Double, y: Double) in Rect(x: x, y: y, w: 224, h: 136) }
        let p = resolveOverlap(small(0, 120), [small(0, 0)])
        #expect(p.x == 0 && p.y == 148)
        let two = [small(0, 0), small(260, 0)]
        let q = resolveOverlap(small(40, 10), two)
        #expect(two.allSatisfy { !rectsIntersect(small(q.x, q.y), $0) })
    }

    @Test func fitCameraFramesEverything() {
        #expect(fitCamera([], 800, 500) == MapCamera(x: 280, y: 160, s: 1))
        #expect(fitCamera([], 390, 844) == MapCamera(x: 75, y: 332, s: 1))
        #expect(fitCamera([node(0, 0)], 0, 0) == MapCamera(x: -120, y: -90, s: 1))
        #expect(near(fitCamera([Rect(x: 0, y: 0, w: 224, h: 136), Rect(x: 900, y: 600, w: 224, h: 136)], 800, 500),
                     125.10869565217394, 70, 0.4891304347826087))
        #expect(near(fitCamera([node(0, 0)], 390, 844), 79, 333, 1))
        #expect(near(fitCamera([node(0, 0), node(400, 300)], 390, 844), 70, 327.4588607594937, 0.39556962025316456))
        #expect(near(fitCamera([node(0, 0), node(3000, 2000)], 390, 844), -209, 149.75, 0.25))
        #expect(near(fitCamera([Rect(x: 0, y: 0, w: 460, h: 340)], 390, 844), 70, 329.60869565217394, 0.5434782608695652))
    }

    @Test func seedsMatchTheWeb() {
        #expect(seedFromString("c1") == 3119)
        #expect(seedFromString("mine") == 708)
        #expect(seedFromString("theirs") == 4565)
        #expect(seedFromString("c1_c2") == 4474)
        #expect(seedFromString("g1") == 3243)
    }
}
