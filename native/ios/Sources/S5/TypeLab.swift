import SwiftUI
import UIKit

/// S5 — how close can mixed Chinese/English typography get to the web?
///
/// The same samples, fonts (the TTFs in native/fonts) and widths as
/// native/typelab/index.html. For each sample we measure where lines break
/// and where each line box sits, print it as JSON (S5RESULT), and compare
/// with the browser's numbers.
struct TypeSample: Codable {
    let id: String
    let text: String
    let family: String // "heading" | "body"
    let size: CGFloat
    let weight: CGFloat // CSS weight
    let lineHeight: CGFloat
    let width: CGFloat

    static let all: [TypeSample] = [
        .init(id: "title", text: "一場雨後的散步 After the Rain", family: "heading", size: 28, weight: 700, lineHeight: 1.25, width: 335),
        .init(id: "body", text: "雨停的時候，巷口的積水映出整排路燈。I remembered walking home through puddles like this — 小時候也是這樣踩著水窪回家，鞋子濕了也不在意。", family: "body", size: 16, weight: 400, lineHeight: 1.7, width: 335),
        .init(id: "excerpt", text: "水溫太高，粉也磨得太細，但那是第一次覺得早晨是屬於自己的。「慢一點也沒關係。」她說。", family: "body", size: 14, weight: 400, lineHeight: 1.65, width: 280),
        .init(id: "cardTitle", text: "The quiet after moving out 搬家後的安靜", family: "heading", size: 18, weight: 700, lineHeight: 1.3, width: 260),
    ]
}

struct TypeMeasurement: Codable {
    let id: String
    let platform: String
    let bundledCJK: Bool
    let lines: [Line]
    let height: CGFloat
    struct Line: Codable {
        let start: Int // UTF-16 offset of the first character on the line
        let text: String
        let top: CGFloat
        let height: CGFloat
        /// Baseline of the line's first glyph, measured from the line box top.
        let baseline: CGFloat
    }
}

@MainActor
enum TypeMeasurer {
    static func uiWeight(_ css: CGFloat) -> UIFont.Weight {
        switch css {
        case ..<450: .regular
        case ..<550: .medium
        case ..<650: .semibold
        case ..<750: .bold
        default: .heavy
        }
    }

    static func measure(_ s: TypeSample) -> TypeMeasurement {
        let font = AppFonts.uiFont(s.family == "heading" ? .heading : .body, size: s.size, weight: uiWeight(s.weight))
        let attributed = NSMutableAttributedString(string: s.text, attributes: [.font: font])
        let storage = NSTextStorage(attributedString: attributed)
        let layout = NSLayoutManager()
        let lineBoxes = CSSLineBoxes(font: font, lineHeight: s.lineHeight)
        layout.delegate = lineBoxes
        let container = NSTextContainer(size: CGSize(width: s.width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        var lines: [TypeMeasurement.Line] = []
        let ns = s.text as NSString
        layout.enumerateLineFragments(forGlyphRange: layout.glyphRange(for: container)) { rect, _, _, glyphRange, _ in
            let chars = layout.characterRange(forGlyphRange: glyphRange, actualGlyphRange: nil)
            let baseline = layout.location(forGlyphAt: glyphRange.location).y
            lines.append(.init(start: chars.location, text: ns.substring(with: chars), top: rect.minY, height: rect.height, baseline: baseline))
        }
        let height = layout.usedRect(for: container).height
        withExtendedLifetime(lineBoxes) {}
        return TypeMeasurement(id: s.id, platform: "ios", bundledCJK: AppFonts.useBundledCJK, lines: lines, height: height)
    }
}

struct TypeLab: View {
    var autorun = false
    @State private var bundled = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Toggle("Bundled Noto TC (off = system PingFang fallback)", isOn: $bundled)
                    .font(.caption)
                    .onChange(of: bundled) { AppFonts.useBundledCJK = bundled }
                Text(String(format: "Font registration: %d files, %.0f ms", AppFonts.registeredCount, AppFonts.registrationSeconds * 1000))
                    .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                ForEach(TypeSample.all, id: \.id) { s in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(s.id) · \(Int(s.size))pt · line-height \(String(format: "%.2f", s.lineHeight))")
                            .font(.caption2.monospaced()).foregroundStyle(.secondary)
                        CSSText(text: s.text,
                                font: AppFonts.uiFont(s.family == "heading" ? .heading : .body, size: s.size, weight: TypeMeasurer.uiWeight(s.weight)),
                                lineHeight: s.lineHeight)
                            .frame(width: s.width, alignment: .leading)
                            .overlay(alignment: .topLeading) {
                                // Red rules at each measured line box top — compare with the web page's.
                                ForEach(TypeMeasurer.measure(s).lines, id: \.start) { l in
                                    Rectangle().fill(Color.red.opacity(0.35)).frame(width: 6, height: 1).offset(x: -8, y: l.top)
                                }
                            }
                            .id(bundled)
                    }
                }
                Text("Handwritten (陳宇落雁):").font(.caption).foregroundStyle(.secondary)
                Text("雨停的時候，巷口的積水映出整排路燈。")
                    .font(AppFonts.font(.handwritten, size: 22))
                    .foregroundStyle(Tokens.text)
            }
            .padding(20)
        }
        .background(Tokens.cream)
        .navigationTitle("S5 Typography")
        .task {
            guard autorun else { return }
            for useBundled in [true, false] {
                AppFonts.useBundledCJK = useBundled
                for s in TypeSample.all {
                    let m = TypeMeasurer.measure(s)
                    print("S5RESULT " + String(data: try! JSONEncoder().encode(m), encoding: .utf8)!)
                }
            }
            AppFonts.useBundledCJK = true
            print(String(format: "S5FONTREG files=%d ms=%.1f", AppFonts.registeredCount, AppFonts.registrationSeconds * 1000))
        }
    }
}
