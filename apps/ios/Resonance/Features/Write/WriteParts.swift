import DesignSystem
import ResonanceKit
import SwiftUI

/// TagField.tsx: the writer's tags as one control. A single input frame (the
/// field's line; terracotta while anything inside it has focus) holds the
/// chosen tags as bare `md` pills — one frame per layer, so none draws a pen
/// line — then the text input and one trailing action that follows the
/// context: with nothing typed it asks the model for tags (the action breathes
/// while it thinks), with something typed it adds that tag. Return, a comma
/// (，、 too) or the action adds. The pills wrap, and the input with its
/// action goes down together once the line is full (``TagFlow``). The helper
/// line under it is the caller's.
struct TagField: View {
    let tags: [String]
    @Binding var draft: String
    let placeholder: String
    let suggesting: Bool
    let onRemove: (String) -> Void
    let onAdd: () -> Void
    let onSuggest: () -> Void

    @FocusState private var focused: Bool
    @State private var breathing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var canAdd: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var thinking: Bool { suggesting && !canAdd }

    var body: some View {
        TagFlow {
            ForEach(tags, id: \.self) { tag in
                TagPill(tag, fill: Tokens.terracottaLight, size: .md) { onRemove(tag) }
            }
            HStack(spacing: 4) {
                TextField(text: $draft, prompt: fieldPrompt(placeholder)) { Text(placeholder) }
                    .font(AppFonts.body(15))
                    .foregroundStyle(Tokens.text)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit(commit)
                    // The line box of a 15pt body (1.6), as the other fields.
                    .frame(minHeight: 15 * 1.6)
                OrganicButton(actionTitle, icon: canAdd ? .plus : .sparkle, variant: .textAccent, size: .sm) {
                    if canAdd { commit() } else { onSuggest() }
                }
                // The sparkle breathes (the action fades as a whole: the button draws its label and glyph together) until the tags arrive.
                .opacity(thinking ? (breathing ? 1 : 0.45) : 1)
            }
        }
        // The action carries its own room, so the right edge pads less.
        .padding(.leading, Tokens.fieldPadX)
        .padding(.trailing, 4)
        .padding(.vertical, 8)
        .modifier(FieldSurface(seed: 53, focused: focused))
        // The empty parts of the frame are the input's too; the pills' ✕ and the action take their own taps first.
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onChange(of: thinking) { _, on in
            if on, !reduceMotion {
                withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { breathing = true }
            } else {
                withAnimation(.easeOut(duration: 0.15)) { breathing = false }
            }
        }
    }

    private var actionTitle: String {
        if canAdd { return L10n.Write.tagsAdd }
        return suggesting ? L10n.Write.tagsSuggesting : L10n.Write.tagsSuggest
    }

    /// Add what is typed and stay for the next one (Return would otherwise put the keyboard away).
    private func commit() {
        guard canAdd else { return }
        onAdd()
        Task { @MainActor in focused = true }
    }
}

/// The tag field's flow: the pills in order, wrapping as words do, then the
/// input row (the last child) on whatever is left of the last line — or, when
/// less than `entryMin` of it is left, on a line of its own. FlowRow can't say
/// "fill the rest of the line, but not less than this", so the lines are broken
/// by ``TagInput/breakLines(pillWidths:entryMin:maxWidth:gap:)``. Children sit
/// centred on their line.
private struct TagFlow: Layout {
    var spacing: CGFloat = 8
    var entryMin: CGFloat = 190

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        return CGSize(width: width, height: arrange(width, subviews).height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (index, frame) in arrange(bounds.width, subviews).frames.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                                  proposal: ProposedViewSize(frame.size))
        }
    }

    private func arrange(_ maxWidth: CGFloat, _ subviews: Subviews) -> (frames: [CGRect], height: CGFloat) {
        guard let entry = subviews.last else { return ([], 0) }
        let sizes = subviews.dropLast().map { $0.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil)) }
        let lines = TagInput.breakLines(pillWidths: sizes.map(\.width), entryMin: entryMin, maxWidth: maxWidth, gap: spacing)
        var frames: [CGRect] = []
        var y: CGFloat = 0
        var next = 0
        for (i, line) in lines.enumerated() {
            var items = Array(sizes[next ..< next + line.pills])
            next += line.pills
            if line.entry {
                let used = items.reduce(0) { $0 + $1.width } + spacing * CGFloat(items.count)
                let width = max(0, maxWidth - used)
                let size = entry.sizeThatFits(ProposedViewSize(width: width, height: nil))
                items.append(CGSize(width: width, height: size.height))
            }
            let height = items.map(\.height).max() ?? 0
            var x: CGFloat = 0
            for item in items {
                frames.append(CGRect(x: x, y: y + (height - item.height) / 2, width: item.width, height: item.height))
                x += item.width + spacing
            }
            y += height + (i < lines.count - 1 ? spacing : 0)
        }
        return (frames, y)
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
