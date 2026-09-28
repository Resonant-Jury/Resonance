import SwiftUI

/// One path of a hand-drawn icon: its commands (see Generated/Icons.swift),
/// whether it is filled with the icon's color instead of stroked, and its pen
/// width relative to the icon's.
public nonisolated struct IconStroke: Sendable {
    let filled: Bool
    let width: Double
    let commands: [Double]

    func path(scale: Double) -> Path {
        var p = Path()
        var i = 0
        func pt(_ k: Int) -> CGPoint { CGPoint(x: commands[k] * scale, y: commands[k + 1] * scale) }
        while i < commands.count {
            switch commands[i] {
            case 0: p.move(to: pt(i + 1)); i += 3
            case 1: p.addLine(to: pt(i + 1)); i += 3
            case 2: p.addCurve(to: pt(i + 5), control1: pt(i + 1), control2: pt(i + 3)); i += 7
            default: p.closeSubpath(); i += 1
            }
        }
        return p
    }
}

public nonisolated struct IconGlyph: Sendable {
    let viewBox: Double
    /// Takes an interior fill (the bookmark).
    let fillable: Bool
    let strokes: [IconStroke]
}

/// The web's `<Icon>`: one of its hand-drawn glyphs, generated from
/// src/components/atoms/Icon so both stay the same drawing. Draws in the
/// current foreground style unless given a color; `strokeWidth` is in the
/// glyph's own 24-unit box, like the web's prop (default INK_STRONG).
public struct OrganicIcon: View {
    let name: IconName
    var size: CGFloat
    var color: Color?
    var strokeWidth: CGFloat
    var fill: Color?

    public init(_ name: IconName, size: CGFloat = 22, color: Color? = nil, strokeWidth: CGFloat = Tokens.inkStrong, fill: Color? = nil) {
        self.name = name
        self.size = size
        self.color = color
        self.strokeWidth = strokeWidth
        self.fill = fill
    }

    public var body: some View {
        let glyph = name.glyph
        let color = color
        let fill = fill
        let scale = Double(size) / glyph.viewBox
        let pen = Double(strokeWidth) * scale
        Canvas { ctx, _ in
            let ink: GraphicsContext.Shading = color.map { .color($0) } ?? .foreground
            for stroke in glyph.strokes {
                let path = stroke.path(scale: scale)
                if stroke.filled {
                    ctx.fill(path, with: ink)
                } else {
                    if glyph.fillable, let fill { ctx.fill(path, with: .color(fill)) }
                    ctx.stroke(path, with: ink, style: StrokeStyle(lineWidth: pen * stroke.width, lineCap: .round, lineJoin: .round))
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

extension OrganicIcon {
    private static var imageCache: [String: Image] = [:]

    /// The glyph as a template image, for places that take only images
    /// (menus, which UIKit draws).
    public static func image(_ name: IconName, size: CGFloat = 22) -> Image {
        let key = "\(name.rawValue)|\(size)"
        if let cached = imageCache[key] { return cached }
        let renderer = ImageRenderer(content: OrganicIcon(name, size: size, color: .black))
        renderer.scale = 3
        guard let ui = renderer.uiImage else { return Image(systemName: "circle") }
        let image = Image(uiImage: ui.withRenderingMode(.alwaysTemplate))
        imageCache[key] = image
        return image
    }
}

/// A hand-drawn radio: a wobbly ring, and an inked dot when chosen. The web
/// has no radio (it uses its organic select), so this pairs the ring of
/// `OrganicIconButton` with the knob of `OrganicToggle`.
public struct OrganicRadio: View {
    let isOn: Bool
    var seed: Double

    public init(isOn: Bool, seed: Double = 21) {
        self.isOn = isOn
        self.seed = seed
    }

    public var body: some View {
        ZStack {
            WobCircleShape(seed: seed, options: WobCircleOptions(segments: 7, mag: 0.7, cpJitter: 0.4))
                .stroke(isOn ? Tokens.terracottaDeep : Tokens.toggleOffStroke, lineWidth: Tokens.ink)
            WobCircleShape(seed: seed + 5, options: WobCircleOptions(segments: 6, mag: 0.5, cpJitter: 0.3))
                .fill(Tokens.terracotta)
                .padding(5.5)
                .scaleEffect(isOn ? 1 : 0.2)
                .opacity(isOn ? 1 : 0)
        }
        .frame(width: 22, height: 22)
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isOn)
        .accessibilityHidden(true)
    }
}
