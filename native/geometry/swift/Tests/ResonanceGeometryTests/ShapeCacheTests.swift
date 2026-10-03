#if canImport(SwiftUI)
import SwiftUI
import Testing
@testable import ResonanceGeometry

// WobRectShape keeps the paths it made in GeometryCache, keyed by everything that shapes them.

@Test func shapesDifferingOnlyInTheirCornersAreCachedApart() {
    let rect = CGRect(x: 0, y: 0, width: 180, height: 40)
    func bubble(_ radii: CornerRadii?) -> Path {
        WobRectShape(radius: 16.8, seed: 183, mag: 2, options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.6, cornerOffset: 1.6, segmentsH: .count(2), segmentsV: .count(1), cornerRadii: radii
        )).path(in: rect)
    }
    let round = bubble(nil)
    // A bubble in the middle of a run of your own: its right-hand corners tucked.
    let tucked = bubble(CornerRadii(topLeft: 16.8, topRight: 4, bottomRight: 4, bottomLeft: 16.8))
    #expect(round.description != tucked.description)
    // Asked again, each is the one it was.
    #expect(bubble(nil).description == round.description)
    #expect(bubble(CornerRadii(topLeft: 16.8, topRight: 4, bottomRight: 4, bottomLeft: 16.8)).description == tucked.description)
}
#endif
