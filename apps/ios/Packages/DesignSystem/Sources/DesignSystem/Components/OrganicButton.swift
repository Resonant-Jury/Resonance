import SwiftUI

// MARK: - Button

/// OrganicButton. On the web the fill reveal grows from the *cursor* on hover;
/// touch has no hover, so the same reveal grows from the *finger* on press —
/// plus a light haptic and a slight scale, which the web cannot do.
public struct OrganicButton: View {
    public enum Variant: Sendable { case primary, ghost, outline }

    let title: String
    var icon: String?
    var image: String?
    var variant: Variant
    var action: () -> Void

    /// `icon` is an SF Symbol; `image` an asset in the app's catalog (e.g. a brand mark).
    public init(_ title: String, icon: String? = nil, image: String? = nil, variant: Variant = .primary, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.image = image
        self.variant = variant
        self.action = action
    }

    @State private var pressPoint: CGPoint? = nil
    @State private var revealed = false

    private var fill: Color {
        switch variant {
        case .primary: Tokens.terracotta
        case .ghost, .outline: .clear
        }
    }
    private var stroke: Color {
        switch variant {
        case .primary: Tokens.terracottaInk
        case .ghost: Tokens.ghostStroke
        case .outline: Tokens.terracotta
        }
    }
    private var textColor: Color {
        switch variant {
        case .primary: Tokens.cream
        case .ghost: Tokens.text
        case .outline: Tokens.terracotta
        }
    }

    public var body: some View {
        let shape = WobRectShape(radius: 16, seed: variant == .primary ? 3 : 401, options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.3, segmentsH: .range(2, 3), segmentsV: .count(1)))
        HStack(spacing: 8) {
            if let icon { Image(systemName: icon).font(.system(size: 16, weight: .semibold)) }
            if let image { Image(image).resizable().scaledToFit().frame(width: 18, height: 18) }
            Text(title).font(AppFonts.body(15, weight: .semibold)).tracking(0.3)
        }
        .foregroundStyle(textColor)
        .padding(.horizontal, 26)
        .padding(.vertical, 13)
        .background {
            GeometryReader { geo in
                ZStack {
                    shape.fill(fill)
                    if variant == .primary {
                        GrainLayer(shape: shape, mode: .tile, opacity: 0.38, tile: "grain-button")
                    }
                    // Ink reveal from the touch point.
                    if let p = pressPoint {
                        let maxR = hypot(max(p.x, geo.size.width - p.x), max(p.y, geo.size.height - p.y))
                        Circle()
                            .fill(variant == .primary ? Color.black.opacity(0.14) : Tokens.terracotta.opacity(0.14))
                            .frame(width: revealed ? maxR * 2 : 0, height: revealed ? maxR * 2 : 0)
                            .position(p)
                            .clipShape(shape)
                    }
                    shape.stroke(stroke, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                }
            }
        }
        .scaleEffect(revealed ? 0.97 : 1)
        .contentShape(shape)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { g in
                    guard pressPoint == nil else { return }
                    pressPoint = g.startLocation
                    withAnimation(.linear(duration: 0.34)) { revealed = true }
                }
                .onEnded { _ in
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
        .accessibilityAction { action() }
    }
}
