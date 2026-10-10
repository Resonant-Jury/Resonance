import SwiftUI

/// The lines of an expanded window's two-pane Messages (round 5 D4) — one pen with the header's
/// full-width wavy edge above both panes:
/// - the web's wavy vertical rule between the panes (MessagesPage `vRule`: seed 71, a turn every 34
///   or so), in the detail pane's leading gutter (12 | rule | 12), from a few points up under the
///   window's header — so it meets the header's line wherever its wave is — through the bottom
///   inset to the window's foot;
/// - the detail pane's own bar's foot (the pushed pages' wave, seed 211), from the rule to the pane's
///   trailing edge. The bar itself draws only its paper (``HeaderLineInk/hidden``), so its line starts
///   where the rule is rather than at the pane's edge.
///
/// All three are one constant ink (``ink``) at `INK`, which no scrolling changes; opaque, so where
/// two meet nothing darkens. Laid over the pane, above its bar, under anything the pane lifts over
/// itself (a message's menu).
public struct PaneLines: View {
    /// The detail pane's leading room for the rule.
    public static let gutter: CGFloat = 24
    /// How far the rule's top reaches up under the window's header (its wave swings 1.4 about a line
    /// 3.2 above the header's foot).
    public static let tuck: CGFloat = 8
    /// The rule's ink — the field border at 35 % — mixed onto the paper.
    public static let ink = Tokens.cream.mix(with: Tokens.fieldBorderHover, by: 0.35, in: .device)

    /// The pane's bar as drawn (its height from the pane's top); nil, no bar line yet.
    let barHeight: CGFloat?

    public init(barHeight: CGFloat?) {
        self.barHeight = barHeight
    }

    public var body: some View {
        GeometryReader { geo in
            let rule = PaneRuleGeometry(height: Double(geo.size.height))
            let style = StrokeStyle(lineWidth: Tokens.ink, lineCap: .round)
            ZStack(alignment: .topLeading) {
                rule.path.stroke(Self.ink, style: style)
                if let barHeight, barHeight > 0 {
                    // The bar's wave in the bar's own box (its top is the pane's), cut where the rule
                    // crosses it: the cut end lies under the rule's stroke, in the same ink.
                    let bar = CGRect(x: 0, y: Self.tuck, width: geo.size.width, height: barHeight)
                    let start = rule.x(at: Double(HeaderEdgeShape.lineY(in: bar)))
                    HeaderEdgeShape(closed: false).path(in: bar)
                        .stroke(Self.ink, style: style)
                        .mask(alignment: .topLeading) {
                            Rectangle().padding(.leading, CGFloat(start))
                        }
                }
            }
        }
        .padding(.top, -Self.tuck)
        .ignoresSafeArea(edges: .bottom)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The vertical rule's curve in a box `height` tall: a turn every 34 or so, 2 to either side of the
/// gutter's middle, run 40 past the box's foot.
public nonisolated struct PaneRuleGeometry {
    let commands: [PathCommand]
    let centre: Double

    public init(height: Double) {
        let h = height + 40
        let steps = max(2, Int((h / 34).rounded()))
        commands = wavyVertical(h, seed: 71, amp: 2, steps: steps)
        centre = Double(PaneLines.gutter) / 2
    }

    public var path: Path { commands.path(offsetX: centre, offsetY: 0) }

    /// Where the rule is across at height `y`: each turn is a cubic whose height runs evenly with
    /// its parameter (handles a third of the way along each end's vertical) and whose x eases from
    /// one end's to the other's, `x0 + (x1 − x0)(3t² − 2t³)`.
    public func x(at y: Double) -> Double {
        var last: (x: Double, y: Double)?
        for command in commands {
            switch command {
            case let .move(x, y0):
                last = (x, y0)
            case let .cubic(_, _, _, _, x1, y1):
                guard let (x0, y0) = last else { continue }
                if y >= y0, y <= y1, y1 > y0 {
                    let t = (y - y0) / (y1 - y0)
                    return centre + x0 + (x1 - x0) * (3 * t * t - 2 * t * t * t)
                }
                last = (x1, y1)
            default:
                continue
            }
        }
        return centre + (last?.x ?? 0)
    }
}
