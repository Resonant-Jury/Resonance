import SwiftUI

/// OrganicInput: a labelled text field in a wobbly frame. The frame darkens
/// to terracotta while focused (tokens: --field-border / --field-border-focus).
public struct OrganicTextField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool
    var seed: Double
    @FocusState private var focused: Bool

    public init(_ label: String, text: Binding<String>, placeholder: String = "", isSecure: Bool = false, seed: Double = 21) {
        self.label = label
        self._text = text
        self.placeholder = placeholder
        self.isSecure = isSecure
        self.seed = seed
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
                .tracking(Tokens.labelSize * 0.06)
                .foregroundStyle(Tokens.textMuted)
            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                }
            }
            .font(AppFonts.body(16))
            .foregroundStyle(Tokens.text)
            .focused($focused)
            .padding(.horizontal, Tokens.fieldPadX)
            .padding(.vertical, Tokens.fieldPadY)
            .background {
                let shape = WobRectShape(radius: Tokens.radiusMd, seed: seed, mag: 1.4)
                shape.fill(Tokens.cardBg)
                shape.stroke(focused ? Tokens.terracotta : Tokens.fieldBorder, lineWidth: Tokens.ink)
            }
            .animation(.easeOut(duration: 0.15), value: focused)
        }
    }
}

/// An empty or error state in the web's voice: a hand-drawn blob, a line of copy,
/// and an optional action. Empty states teach (docs/ux-user-flows.md §4).
public struct OrganicEmptyState: View {
    let message: String
    let actionTitle: String?
    let action: (() -> Void)?

    public init(_ message: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: 18) {
            WobCircleShape(seed: 41, options: WobCircleOptions(segments: 9, mag: 3, cpJitter: 0.6))
                .fill(Tokens.terracottaLight.opacity(0.5))
                .overlay {
                    WobCircleShape(seed: 41, options: WobCircleOptions(segments: 9, mag: 3, cpJitter: 0.6))
                        .stroke(Tokens.terracotta.opacity(0.5), lineWidth: Tokens.inkLight)
                }
                .frame(width: 72, height: 72)
                .accessibilityHidden(true)
            Text(message)
                .font(AppFonts.body(15))
                .foregroundStyle(Tokens.textMuted)
                .multilineTextAlignment(.center)
                .lineSpacing(15 * 0.6)
                .frame(maxWidth: 320)
            if let actionTitle, let action {
                OrganicButton(actionTitle, variant: .outline, action: action)
            }
        }
        .padding(.horizontal, 32)
        .padding(.vertical, 40)
        .frame(maxWidth: .infinity)
    }
}
