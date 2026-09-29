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

/// A page-level empty, not-found or error state as the web sets them: a
/// Playfair line, the muted explanation, then one way forward — a filled
/// button for "start writing", or a plain terracotta link for "back".
/// (No blob: the web keeps OrganiBlob for its landing page.)
public struct OrganicEmptyState: View {
    public enum ActionStyle: Sendable { case primary, outline, link }

    let title: String?
    let titleSize: CGFloat
    let message: String?
    let actionTitle: String?
    let actionStyle: ActionStyle
    let action: (() -> Void)?

    public init(title: String? = nil, titleSize: CGFloat = 22, message: String? = nil,
                actionTitle: String? = nil, actionStyle: ActionStyle = .primary, action: (() -> Void)? = nil) {
        self.title = title
        self.titleSize = titleSize
        self.message = message
        self.actionTitle = actionTitle
        self.actionStyle = actionStyle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: 0) {
            if let title {
                Text(title)
                    .font(AppFonts.heading(titleSize, weight: .regular))
                    .foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.bottom, message == nil ? 12 : 8)
            }
            if let message {
                Text(message)
                    .font(AppFonts.body(16))
                    .foregroundStyle(Tokens.textMuted)
                    .padding(.bottom, 24)
            }
            if let actionTitle, let action {
                switch actionStyle {
                case .primary: OrganicButton(actionTitle, action: action)
                case .outline: OrganicButton(actionTitle, variant: .outline, action: action)
                case .link:
                    Button(actionTitle, action: action)
                        .font(AppFonts.body(16))
                        .foregroundStyle(Tokens.terracotta)
                        .buttonStyle(.plain)
                }
            }
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 20)
        .padding(.vertical, 64)
        .frame(maxWidth: .infinity)
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
