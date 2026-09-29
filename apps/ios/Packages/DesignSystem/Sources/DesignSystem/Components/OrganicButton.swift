import SwiftUI

// MARK: - Button

/// OrganicButton. On the web the fill reveal grows from the *cursor* on hover;
/// touch has no hover, so the same reveal grows from the *finger* on press —
/// plus a light haptic and a slight scale, which the web cannot do.
public struct OrganicButton: View {
    public enum Variant: Sendable { case primary, ghost, outline }
    /// `sm` is the web's dense size (dialog actions, list rows, the deletion banner).
    public enum Size: Sendable { case md, sm }

    let title: String
    var icon: IconName?
    var image: String?
    var variant: Variant
    var size: Size
    /// Set for a glyph-only chip; `title` is then its accessibility label.
    var iconOnlySize: CGFloat?
    var action: () -> Void

    /// `icon` is one of the web's hand-drawn glyphs; `image` an asset in the
    /// app's catalog, for brand marks only (Google's, Apple's).
    public init(_ title: String, icon: IconName? = nil, image: String? = nil,
                variant: Variant = .primary, size: Size = .md, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.image = image
        self.variant = variant
        self.size = size
        self.action = action
    }

    /// A glyph alone in the button's outline (the card box's pen to settings:
    /// ghost, small, the pad tightened to 9×11).
    public init(icon: IconName, label: String, iconSize: CGFloat = 17, variant: Variant = .ghost, size: Size = .sm,
                action: @escaping () -> Void) {
        self.title = label
        self.icon = icon
        self.variant = variant
        self.size = size
        self.iconOnlySize = iconSize
        self.action = action
    }

    @State private var pressPoint: CGPoint? = nil
    @State private var revealed = false
    @Environment(\.isEnabled) private var isEnabled

    public var body: some View {
        let style = OrganicButtonStyle(variant: variant, size: size)
        let shape = OrganicButtonShape(seed: style.seed)
        face(style)
            .background {
                GeometryReader { geo in
                    ZStack {
                        style.fillLayers(shape)
                        // Ink reveal from the touch point.
                        if let p = pressPoint {
                            let maxR = hypot(max(p.x, geo.size.width - p.x), max(p.y, geo.size.height - p.y))
                            Circle()
                                .fill(variant == .primary ? Color.black.opacity(0.14) : Tokens.terracotta.opacity(0.14))
                                .frame(width: revealed ? maxR * 2 : 0, height: revealed ? maxR * 2 : 0)
                                .position(p)
                                .clipShape(shape)
                        }
                        shape.stroke(style.stroke, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                    }
                }
            }
            // Busy / inactive: the web dims the whole button (fill, grain, ink, label).
            .opacity(isEnabled ? 1 : 0.6)
            .scaleEffect(revealed ? 0.97 : 1)
            .contentShape(shape)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        guard isEnabled, pressPoint == nil else { return }
                        pressPoint = g.startLocation
                        withAnimation(.linear(duration: 0.34)) { revealed = true }
                    }
                    .onEnded { _ in
                        guard isEnabled else { return }
                        action()
                        withAnimation(.easeOut(duration: 0.2)) { revealed = false }
                        Task { @MainActor in
                            try? await Task.sleep(for: .milliseconds(200))
                            pressPoint = nil
                        }
                    }
            )
            .sensoryFeedback(.impact(weight: .light), trigger: revealed) { _, new in new }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(title)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { if isEnabled { action() } }
    }
}

extension OrganicButton {
    @ViewBuilder fileprivate func face(_ style: OrganicButtonStyle) -> some View {
        if let iconOnlySize, let icon {
            OrganicIcon(icon, size: iconOnlySize)
                .foregroundStyle(style.textColor)
                .padding(.horizontal, 11)
                .padding(.vertical, 9)
        } else {
            style.label(title, icon: icon, image: image)
        }
    }
}

/// The button's face without its gesture, for system controls that bring
/// their own tap (a ShareLink's label).
public struct OrganicButtonLabel: View {
    let title: String
    var icon: IconName?
    var variant: OrganicButton.Variant
    var size: OrganicButton.Size

    public init(_ title: String, icon: IconName? = nil, variant: OrganicButton.Variant = .primary, size: OrganicButton.Size = .md) {
        self.title = title
        self.icon = icon
        self.variant = variant
        self.size = size
    }

    public var body: some View {
        let style = OrganicButtonStyle(variant: variant, size: size)
        let shape = OrganicButtonShape(seed: style.seed)
        style.label(title, icon: icon, image: nil)
            .background {
                ZStack {
                    style.fillLayers(shape)
                    shape.stroke(style.stroke, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                }
            }
            .contentShape(shape)
    }
}

/// BTN_VARIANTS and the .btn / .sm metrics, shared by the button and its label.
struct OrganicButtonStyle {
    let variant: OrganicButton.Variant
    let size: OrganicButton.Size

    /// The web's BTN_SEEDS, so each variant wobbles like its web twin.
    var seed: Double {
        switch variant {
        case .primary: 3
        case .ghost: 401
        case .outline: 601
        }
    }
    var fill: Color {
        switch variant {
        case .primary: Tokens.terracotta
        case .ghost, .outline: .clear
        }
    }
    var stroke: Color {
        switch variant {
        case .primary: Tokens.terracottaInk
        case .ghost: Tokens.ghostStroke
        // Darker than the label: the pen line reads apart from the text.
        case .outline: Tokens.terracottaOutline
        }
    }
    var textColor: Color {
        switch variant {
        case .primary: Tokens.cream
        case .ghost: Tokens.text
        case .outline: Tokens.terracotta
        }
    }

    /// Label row: 16pt glyphs 7 apart; brand marks are 18pt, 10 from the text.
    func label(_ title: String, icon: IconName?, image: String?) -> some View {
        let fontSize: CGFloat = size == .sm ? 14 : 15
        return HStack(spacing: image != nil ? 10 : 7) {
            if let icon { OrganicIcon(icon, size: 16) }
            if let image { Image(image).resizable().scaledToFit().frame(width: 18, height: 18) }
            Text(title).font(AppFonts.body(fontSize, weight: .semibold)).tracking(fontSize * 0.02)
        }
        .foregroundStyle(textColor)
        .padding(.horizontal, size == .sm ? 18 : 32)
        .padding(.vertical, size == .sm ? 9 : 14)
    }

    @ViewBuilder func fillLayers(_ shape: OrganicButtonShape) -> some View {
        shape.fill(fill)
        if variant == .primary {
            GrainLayer(shape: shape, mode: .tile, opacity: 0.38, tile: "grain-button")
        }
    }
}

/// OrganicButton.tsx's outline: a calm pill — radius 16, two or three gentle
/// turns along the long edges, one on the short ones, and the wobble and
/// corner drift scaled to the button (4% and 3% of its short side). A fixed
/// wobble reads as lumpy on a 48pt-tall button, most of all along the top edge.
public nonisolated struct OrganicButtonShape: Shape {
    public var seed: Double

    public init(seed: Double) {
        self.seed = seed
    }

    public func path(in rect: CGRect) -> Path {
        let m = Double(min(rect.width, rect.height))
        return WobRectShape(radius: 16, seed: seed, mag: m * 0.04, options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.3, cornerOffset: m * 0.03, segmentsH: .range(2, 3), segmentsV: .count(1)))
            .path(in: rect)
    }
}
