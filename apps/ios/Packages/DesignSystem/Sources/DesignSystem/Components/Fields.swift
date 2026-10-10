import SwiftUI

/// Field.tsx's label: small caps in the muted ink, 10 above the control.
public struct FieldLabel: View {
    let text: String
    public init(text: String) { self.text = text }
    public var body: some View {
        Text(text.uppercased())
            .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
            .tracking(Tokens.labelSize * 0.06)
            .foregroundStyle(Tokens.textMuted)
    }
}

/// The web Input/Textarea surface (HandDrawnDashedSurface R16): auto wobble,
/// cream paper, and the ink darkening to terracotta while focused
/// (tokens: --field-border / --field-border-focus).
public struct FieldSurface: ViewModifier {
    let seed: Double
    let focused: Bool
    /// A set bow (the writer's title passes 0.8); nil keeps the size's own.
    var curve: Double?

    public init(seed: Double, focused: Bool, curve: Double? = nil) {
        self.seed = seed
        self.focused = focused
        self.curve = curve
    }

    public func body(content: Content) -> some View {
        content.background {
            let shape = curve.map { AnyShape(AutoWobRectShape(radius: Tokens.radiusMd, seed: seed, curve: $0)) }
                ?? AnyShape(WobRectShape(radius: Tokens.radiusMd, seed: seed))
            shape.fill(Tokens.cream)
            shape.stroke(focused ? Tokens.terracotta : Tokens.fieldBorder,
                         style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
        }
        .animation(.easeOut(duration: 0.15), value: focused)
    }
}

/// The web's placeholder: warm grey, italic.
/// (globals.css: every placeholder is the body face, italic, at the field's size and weight.)
public func fieldPrompt(_ text: String, size: CGFloat = 15, weight: UIFont.Weight = .regular) -> Text {
    Text(text).font(AppFonts.body(size, weight: weight, oblique: true)).foregroundStyle(Tokens.placeholder)
}

/// OrganicInput: a labelled text field in a wobbly frame.
public struct OrganicTextField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool
    var seed: Double
    @FocusState private var focused: Bool
    @Environment(\.isEnabled) private var isEnabled

    public init(_ label: String, text: Binding<String>, placeholder: String = "", isSecure: Bool = false, seed: Double = 13) {
        self.label = label
        self._text = text
        self.placeholder = placeholder
        self.isSecure = isSecure
        self.seed = seed
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FieldLabel(text: label)
            Group {
                if isSecure {
                    SecureField(text: $text, prompt: fieldPrompt(placeholder)) { Text(label) }
                } else {
                    TextField(text: $text, prompt: fieldPrompt(placeholder)) { Text(label) }
                }
            }
            .font(AppFonts.body(15))
            .foregroundStyle(Tokens.text)
            // The web's 15px on a 1.6 line box.
            .frame(minHeight: 15 * 1.6)
            .opacity(isEnabled ? 1 : 0.55)
            .focused($focused)
            .padding(.horizontal, Tokens.fieldPadX)
            .padding(.vertical, Tokens.fieldPadY)
            .modifier(FieldSurface(seed: seed, focused: focused))
        }
    }
}

/// The web's auto-growing Textarea: three lines at rest, taller as the text
/// grows, with an optional "count / max" under it (CharCount).
public struct OrganicTextArea: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var maxLength: Int?
    var seed: Double
    /// Field's `tone="display"`: the writing screen's title, set in Playfair 22/700 on two lines.
    var display: Bool
    var curve: Double?
    @FocusState private var focused: Bool

    public init(_ label: String, text: Binding<String>, placeholder: String = "", maxLength: Int? = nil, seed: Double = 17,
                display: Bool = false, curve: Double? = nil) {
        self.label = label
        self._text = text
        self.placeholder = placeholder
        self.maxLength = maxLength
        self.seed = seed
        self.display = display
        self.curve = curve
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FieldLabel(text: label).padding(.bottom, 10)
            // The global placeholder rule sets the body face in italic; the display tone keeps its size and weight.
            TextField(text: $text, prompt: display ? fieldPrompt(placeholder, size: 22, weight: .bold) : fieldPrompt(placeholder),
                      axis: .vertical) { Text(label) }
                .lineLimit(display ? 2... : 3...)
                .lineSpacing(display ? 22 * 0.35 : 15 * 0.6)
                .font(display ? AppFonts.heading(22) : AppFonts.body(15))
                .foregroundStyle(Tokens.text)
                .focused($focused)
                .padding(.horizontal, Tokens.fieldPadX)
                .padding(.vertical, Tokens.fieldPadY)
                .modifier(FieldSurface(seed: seed, focused: focused, curve: curve))
                .onChange(of: text) { _, new in
                    if let maxLength, new.count > maxLength { text = String(new.prefix(maxLength)) }
                }
            if let maxLength {
                Text(verbatim: "\(text.count) / \(maxLength)")
                    .font(AppFonts.body(11))
                    .monospacedDigit()
                    .foregroundStyle(text.count > maxLength ? Tokens.terracotta : Tokens.textMuted)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.top, 6)
            }
        }
    }
}

/// A page-level empty, not-found or error state — one component on every page (design note §1),
/// so every empty list sits the same way: a small organic mark (`icon`: the avatar's blob at 64, the
/// tonal ink's glyph on it), a Playfair title, one quiet line, then one way forward — the solid
/// button for "start writing", the tonal pill for anything else (`outline` and `link` both wear
/// it now: every button has a fill).
///
/// `fills`: the state takes the height of the region it is given (``SwiftUI/EnvironmentValues/emptyStateRegion``,
/// set by a tab's page, a pane or a modal body) and puts its centre at 45% of it; a parent that
/// can't give one (a lazy list) leaves it a 300pt box, centred. Without a mark (not-found and error
/// pages) it keeps its larger title and the old air above and below, in the same column and gaps.
public struct OrganicEmptyState: View {
    public enum ActionStyle: Sendable { case primary, outline, link }

    let title: String?
    let titleSize: CGFloat
    let message: String?
    let actionTitle: String?
    let actionStyle: ActionStyle
    let icon: IconName?
    let seed: Double
    let fills: Bool
    let action: (() -> Void)?
    @Environment(\.emptyStateRegion) private var region

    public init(title: String? = nil, titleSize: CGFloat = 22, message: String? = nil,
                actionTitle: String? = nil, actionStyle: ActionStyle = .primary,
                icon: IconName? = nil, seed: Double = 23, fills: Bool = false, action: (() -> Void)? = nil) {
        self.title = title
        self.titleSize = titleSize
        self.message = message
        self.actionTitle = actionTitle
        self.actionStyle = actionStyle
        self.icon = icon
        self.seed = seed
        self.fills = fills
        self.action = action
    }

    /// The content column: at most 340 wide, 24 in from either side.
    static let columnMax: CGFloat = 340

    public var body: some View {
        if fills || icon != nil {
            // A tab's region, else (a lazy list, a modal without one) a 300pt box with the mark centred in it.
            let height = fills ? max(region ?? 300, 0) : 300
            EmptyStatePlacement(height: height, bias: fills && region != nil ? 0.45 : 0.5) { column }
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity)
        } else {
            column
                .padding(.horizontal, 24)
                .padding(.vertical, 64)
                .frame(maxWidth: .infinity)
        }
    }

    private var column: some View {
        VStack(spacing: 0) {
            if let icon {
                EmptyStateMark(icon: icon, seed: seed)
                    .padding(.bottom, title != nil ? 18 : 14)
            }
            if let title {
                let size = icon != nil ? 20 : titleSize
                CSSText(title, font: AppFonts.scaledUIFont(.heading, size: size, weight: .regular), lineHeight: 1.3,
                        alignment: .center)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.bottom, message != nil ? 8 : (actionTitle != nil ? 20 : 0))
            }
            if let message {
                // The quiet line: the list's own size under a mark, the older 16 on a page without one.
                CSSText(message, font: AppFonts.scaledUIFont(.body, size: icon != nil ? 14.5 : 16), lineHeight: 1.6,
                        color: UIColor(Tokens.textMuted), lineLimit: icon != nil ? 3 : 0, alignment: .center)
                    .padding(.bottom, actionTitle != nil ? 20 : 0)
            }
            if let actionTitle, let action {
                switch actionStyle {
                case .primary: OrganicButton(actionTitle, size: icon != nil ? .sm : .md, action: action)
                // A retry, or the page's only way out (Back home): every button has a fill — a lone
                // terracotta word (3.5:1) did not read as one.
                case .outline, .link: OrganicButton(actionTitle, variant: .tonal, size: icon != nil ? .sm : .md, action: action)
                }
            }
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: Self.columnMax)
    }
}

extension EnvironmentValues {
    /// The height a filling ``OrganicEmptyState`` may take: the visible region between a page's bar
    /// and its tab bar (or a pane's, a modal body's). Nil where nobody says (it keeps 300).
    @Entry public var emptyStateRegion: CGFloat? = nil
}

/// The empty state's mark (design §1): the avatar's blob at 64 (`HandDrawnAvatar`'s geometry,
/// R 0.4 × size, one lopsided turn a side) in the light terracotta at half strength, the paper's
/// grain on it and no pen line, the glyph centred in the tonal ink. Decorative.
public struct EmptyStateMark: View {
    let icon: IconName
    let seed: Double
    var size: CGFloat

    public init(icon: IconName, seed: Double, size: CGFloat = 64) {
        self.icon = icon
        self.seed = seed
        self.size = size
    }

    public var body: some View {
        let shape = WobRectShape(radius: size * 0.4, seed: seed, mag: size * 0.022, options: WobRectOptions(
            curve: 1.3, cornerJitter: 3.2, cornerOffset: size * 0.06, segmentsH: .count(1), segmentsV: .count(1)))
        ZStack {
            shape.fill(Tokens.terracottaLight.opacity(0.5))
            GrainLayer(shape: shape, mode: .tile, opacity: 0.3, tile: "grain-card")
            OrganicIcon(icon, size: 28, color: Tokens.buttonOnTonal, strokeWidth: Tokens.ink)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// One child in a box `height` tall (or as tall as the child, if taller), its centre at `bias` of
/// the box's height — a little above the middle reads as centred on a page.
private struct EmptyStatePlacement: Layout {
    let height: CGFloat
    let bias: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let child = subviews.first?.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil)) ?? .zero
        return CGSize(width: proposal.width ?? child.width, height: max(height, child.height))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let first = subviews.first else { return }
        let child = first.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
        let top = min(max(0, bounds.height * bias - child.height / 2), max(0, bounds.height - child.height))
        first.place(at: CGPoint(x: bounds.midX, y: bounds.minY + top), anchor: .top,
                    proposal: ProposedViewSize(width: bounds.width, height: child.height))
    }
}

/// A list's empty line (notifications, messages, a shelf, the block list):
/// just the muted sentence, no heading and no art.
public struct EmptyNote: View {
    let text: String
    var size: CGFloat
    var centered: Bool

    public init(_ text: String, size: CGFloat = 14, centered: Bool = false) {
        self.text = text
        self.size = size
        self.centered = centered
    }

    public var body: some View {
        Text(text)
            .font(AppFonts.body(size))
            .foregroundStyle(Tokens.textMuted)
            .lineSpacing(size * 0.5)
            .multilineTextAlignment(centered ? .center : .leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
    }
}
