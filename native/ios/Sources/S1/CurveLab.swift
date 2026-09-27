import ResonanceGeometry
import SwiftUI

/// S1 Curve Lab — the web's own path (read from the golden fixture file,
/// i.e. what the TypeScript produced) drawn in red under the Swift port's path
/// in ink. If the port is right, no red shows anywhere.
struct CurveLab: View {
    private let cases: [(title: String, web: String, native: [PathCommand], size: CGSize)] = CurveLab.load()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Red = web (TypeScript) · Ink = Swift port")
                    .font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                ForEach(Array(cases.enumerated()), id: \.offset) { _, c in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(c.title).font(AppFonts.body(12, weight: .semibold)).foregroundStyle(Tokens.text)
                        ZStack(alignment: .topLeading) {
                            SVGPath(d: c.web).stroke(Color.red, lineWidth: 4)
                            c.native.path().stroke(Tokens.text, lineWidth: 1.8)
                        }
                        .frame(width: c.size.width, height: c.size.height, alignment: .topLeading)
                        .padding(8)
                    }
                }
            }
            .padding(20)
        }
        .background(Tokens.cream)
        .navigationTitle("S1 Curve Lab")
    }

    private static func load() -> [(String, String, [PathCommand], CGSize)] {
        guard let url = Bundle.main.url(forResource: "geometry", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rects = json["wobRect"] as? [[String: Any]],
              let circles = json["wobCircle"] as? [[String: Any]],
              let tabs = json["wobTabRect"] as? [[String: Any]]
        else { return [] }
        func n(_ v: Any) -> Double { (v as! NSNumber).doubleValue }
        var out: [(String, String, [PathCommand], CGSize)] = []
        // First few wobRect cases are the real component parameter sets.
        for (i, c) in rects.prefix(5).enumerated() {
            let a = c["args"] as! [Any]
            let o = a[5] as? [String: Any]
            func seg(_ v: Any?) -> SegValue? {
                guard let v, !(v is NSNull) else { return nil }
                if let p = v as? [Any] { return .range(Int(n(p[0])), Int(n(p[1]))) }
                return .count(n(v))
            }
            let native = wobRect(n(a[0]), n(a[1]), n(a[2]), seed: n(a[3]), mag: a[4] is NSNull ? nil : n(a[4]),
                                 options: WobRectOptions(curve: (o?["curve"]).map(n), cornerJitter: (o?["cornerJitter"]).map(n),
                                                         cornerOffset: (o?["cornerOffset"]).map(n),
                                                         segmentsH: seg(o?["segmentsH"]), segmentsV: seg(o?["segmentsV"])))
            let w = min(n(a[0]), 340), h = min(n(a[1]), 240)
            out.append(("wobRect #\(i) \(Int(n(a[0])))×\(Int(n(a[1])))", c["out"] as! String, native, CGSize(width: w, height: h)))
        }
        if let c = circles.first {
            let a = c["args"] as! [Any]
            let native = wobCircle(n(a[0]), n(a[1]), n(a[2]), seed: n(a[3]), options: WobCircleOptions(segments: 8, mag: 0.5, cpJitter: 0.3))
            out.append(("ToggleSwitch knob (wobCircle)", c["out"] as! String, native, CGSize(width: 24, height: 24)))
        }
        if let c = tabs.first {
            let a = c["args"] as! [Any]
            let native = wobTabRect(n(a[0]), n(a[1]), tabX: n(a[2]), tabW: n(a[3]), tabH: n(a[4]), seed: n(a[5]),
                                    options: WobTabRectOptions(R: 18, tabR: 9, mag: 2.4, curve: 1))
            out.append(("ThoughtMap node (wobTabRect)", c["out"] as! String, native, CGSize(width: 230, height: 160)))
        }
        return out
    }
}

/// Minimal parser for the web's path strings (M/L/C/Q/Z, absolute).
struct SVGPath: Shape {
    let d: String
    func path(in rect: CGRect) -> Path {
        var p = Path()
        var nums: [Double] = []
        var cmd: Character = " "
        var token = ""
        func flushCmd() {
            switch cmd {
            case "M" where nums.count >= 2: p.move(to: CGPoint(x: nums[0], y: nums[1]))
            case "L" where nums.count >= 2: p.addLine(to: CGPoint(x: nums[0], y: nums[1]))
            case "C" where nums.count >= 6:
                p.addCurve(to: CGPoint(x: nums[4], y: nums[5]), control1: CGPoint(x: nums[0], y: nums[1]), control2: CGPoint(x: nums[2], y: nums[3]))
            case "Q" where nums.count >= 4: p.addQuadCurve(to: CGPoint(x: nums[2], y: nums[3]), control: CGPoint(x: nums[0], y: nums[1]))
            case "Z": p.closeSubpath()
            default: break
            }
            nums = []
        }
        for ch in d + " " {
            if "MLCQZ".contains(ch) {
                if !token.isEmpty { nums.append(Double(token)!); token = "" }
                flushCmd()
                cmd = ch
            } else if ch == " " || ch == "," {
                if !token.isEmpty { nums.append(Double(token)!); token = "" }
            } else {
                token.append(ch)
            }
        }
        flushCmd()
        return p
    }
}
