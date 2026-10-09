import DesignSystem
import Foundation
import SwiftUI
import Testing
import UIKit

/// The switch is drawn by hand, the same on all three platforms: the track (filled and inked on
/// that one path) and the knob come out of the web's own numbers (its shapes for each seed the app uses are in
/// the shared geometry fixture), the knob sits at the pad off and as far right on, and the inks are
/// the soft text ink off and the deep terracotta on.
@MainActor @Suite struct OrganicToggleTests {
    /// native/fixtures/geometry.json, which the web writes from its own wobRect / wobCircle.
    static let fixture: [String: Any] = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../native/fixtures/geometry.json").standardized
        return try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
    }()

    /// The web's drawing for these arguments, as its numbers.
    func web(_ family: String, _ matches: ([Any]) -> Bool) -> [Double]? {
        let cases = Self.fixture[family] as! [[String: Any]]
        guard let hit = cases.first(where: { matches($0["args"] as! [Any]) }), let d = hit["out"] as? String else { return nil }
        return d.split(whereSeparator: { " ,MLCQZ".contains($0) }).compactMap { Double($0) }
    }

    func num(_ v: Any) -> Double { (v as! NSNumber).doubleValue }

    func close(_ a: [Double], _ b: [Double]) -> Bool {
        a.count == b.count && zip(a, b).allSatisfy { abs($0 - $1) <= 0.006 }
    }

    @Test(arguments: [9.0, 57, 83, 89, 91])
    func theTrackAndTheKnobAreTheWebsOwn(seed: Double) throws {
        let shapes = OrganicToggleSpec.shapes(seed: seed)
        let track = try #require(web("wobRect") { a in
            a.count == 6 && num(a[0]) == 50 && num(a[1]) == 28 && num(a[2]) == 12.5 && num(a[3]) == seed && num(a[4]) == 2.4
        }, "the fixture has the web's track for seed \(seed)")
        #expect(close(shapes.track.flatMap(\.numbers), track), "seed \(seed)")
        let knob = try #require(web("wobCircle") { a in
            num(a[0]) == 10 && num(a[1]) == 10 && num(a[2]) == 10 && num(a[3]) == seed + 5
                && (a[4] as? [String: Any]).map { num($0["segments"]!) == 6 } == true
        })
        #expect(close(shapes.knob.flatMap(\.numbers), knob))
    }

    @Test func theKnobSitsAtThePadOffAndAsFarRightOn() {
        #expect(OrganicToggleSpec.knobOrigin(isOn: false) == CGPoint(x: 4, y: 4))
        #expect(OrganicToggleSpec.knobOrigin(isOn: true) == CGPoint(x: 26, y: 4))
    }

    @Test func aFingerLandsOn44PointsWhileTheRowKeepsTheDrawingsRoom() {
        // 28pt tall is under the 44pt a finger needs (Apple's HIG): the target reaches past the drawing.
        #expect(OrganicToggleSpec.hitHeight >= 44)
        let size = UIHostingController(rootView: OrganicToggle(isOn: .constant(true), label: "Anonymous", seed: 57).fixedSize())
            .sizeThatFits(in: CGSize(width: 400, height: 400))
        #expect(size == CGSize(width: OrganicToggleSpec.width, height: OrganicToggleSpec.height))
    }

    @Test func offIsASoftInkOnPaperAndOnADeepTerracotta() {
        #expect(OrganicToggleSpec.fill(isOn: false) == Tokens.creamDark)
        #expect(OrganicToggleSpec.ink(isOn: false) == Tokens.textMuted)
        #expect(OrganicToggleSpec.fill(isOn: true) == Tokens.terracotta)
        #expect(OrganicToggleSpec.ink(isOn: true) == Tokens.terracottaDeep)
        #expect(OrganicToggleSpec.disabledOpacity == 0.45)
    }
}
