import DesignSystem
import ResonanceKit
import SwiftUI

/// CardEditor's AddTagButton — the AI pill: a quiet frame in the field's line
/// (R ≤ 18, seed 67), a small plus and muted 12pt text.
struct AddTagButton: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                OrganicIcon(.plus, size: 12, color: Tokens.textMuted)
                Text(label).font(AppFonts.body(12))
            }
            .foregroundStyle(Tokens.textMuted)
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .background {
                GeometryReader { geo in
                    WobRectShape(radius: min(geo.size.height / 2, 18), seed: 67)
                        .stroke(Tokens.fieldBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// CardEditor's TagInput: a two-segment bar — the text on the left, Add on
/// the right — under one wobbly line (seed 53) with a wavy divider between,
/// the Add segment washed in the light terracotta.
struct TagInputBar: View {
    @Binding var text: String
    let placeholder: String
    let addLabel: String
    let onAdd: () -> Void
    @FocusState private var focused: Bool
    @State private var addWidth: CGFloat = 96

    private var canAdd: Bool { !text.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        HStack(spacing: 0) {
            TextField(text: $text, prompt: fieldPrompt(placeholder)) { Text(placeholder) }
                .font(AppFonts.body(15))
                .foregroundStyle(Tokens.text)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit(commit)
                .padding(.horizontal, Tokens.fieldPadX)
                .padding(.vertical, Tokens.fieldPadY)
            Button(action: commit) {
                HStack(spacing: 6) {
                    OrganicIcon(.plus, size: 12, color: canAdd ? Tokens.terracotta : Tokens.textMuted)
                    Text(addLabel).font(AppFonts.body(13, weight: .semibold))
                }
                .foregroundStyle(canAdd ? Tokens.terracotta : Tokens.textMuted)
                .opacity(canAdd ? 1 : 0.7)
                .padding(.horizontal, 18)
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!canAdd)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { addWidth = $0 }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background { TagBarBackdrop(addWidth: addWidth, stroke: focused ? Tokens.terracotta : Tokens.fieldBorder) }
    }

    private func commit() {
        guard canAdd else { return }
        onAdd()
    }
}

/// The tag bar's drawing: SegmentedActionBar's wobble recipe, cream paper,
/// the Add segment's wash up to the shared boundary, and the boundary's line.
private struct TagBarBackdrop: View {
    let addWidth: CGFloat
    let stroke: Color

    /// Room past the bar's box: the wobble swings outside it (the web's SVG is overflow: visible).
    private let spill: CGFloat = 8

    var body: some View {
        Canvas { ctx, size in
            let w = Double(size.width - spill * 2), h = Double(size.height - spill * 2)
            guard w > 0, h > 0 else { return }
            ctx.translateBy(x: spill, y: spill)
            let outer = wobRect(w, h, 16, seed: 53, mag: min(w, h) * 0.05, options: WobRectOptions(
                curve: 1.2, cornerJitter: 1.2, cornerOffset: h * 0.04, segmentsH: .range(7, 9), segmentsV: .range(2, 3)
            )).path()
            let pad = max(12, h * 0.3)
            let boundary = boundaryPoints(x: w - Double(addWidth), h: h, seed: 53 + 11, amp: 1.6, pad: pad)
            var region = Path(polyline: boundary)
            region.addLine(to: CGPoint(x: w + pad, y: h + pad))
            region.addLine(to: CGPoint(x: w + pad, y: -pad))
            region.closeSubpath()
            ctx.drawLayer { layer in
                layer.clip(to: outer)
                layer.fill(outer, with: .color(Tokens.cream))
                layer.fill(region, with: .color(Tokens.terracottaLight.opacity(0.6)))
                layer.stroke(Path(polyline: boundary), with: .color(stroke), style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
            }
            ctx.stroke(outer, with: .color(stroke), style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
        }
        .padding(-spill)
        .animation(.easeOut(duration: 0.15), value: stroke)
        .accessibilityHidden(true)
    }
}

/// One half of the image surface (upload or illustrate): the terracotta glyph,
/// the muted title and its fainter hint, centred.
struct MediaHalf: View {
    let icon: IconName
    let title: String
    let hint: String

    var body: some View {
        VStack(spacing: 6) {
            OrganicIcon(icon, size: 26, color: Tokens.terracotta)
            Text(title).font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.textMuted)
            Text(hint).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).opacity(0.75)
        }
        .multilineTextAlignment(.center)
        .padding(.vertical, 22)
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
    }
}

/// The image surface's frame (HandDrawnDashedSurface R16, seed 31, bow 0.8):
/// the field's line, terracotta while something is on its way in.
struct MediaFrame: ViewModifier {
    var busy = false

    func body(content: Content) -> some View {
        content.background {
            AutoWobRectShape(radius: 16, seed: 31, curve: 0.8)
                .stroke(busy ? Tokens.terracotta : Tokens.fieldBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
        }
    }
}
