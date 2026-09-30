import SwiftUI

// MARK: - Button

/// OrganicButton. On the web the fill reveal grows from the *cursor* on hover;
/// touch has no hover, so the same reveal grows from the *finger* on press —
/// the ink every control shares (``OrganicPressStyle``), spreading its full
/// course and then lifting — plus a light haptic and a slight scale.
public struct OrganicButton: View {
    /// primary, ghost and outline are the web's; the rest keep a control from
    /// adding a pen line inside something already framed (a modal, a card, a
    /// bar): `solid` is primary without its rim, `danger` the same in red for
    /// what can't be undone, and `text` / `textAccent` draw no frame at all —
    /// only the ink while pressed (Cancel beside a confirm, "load more").
    /// `paper` is the card's own paper (grain and all, as the modal's) with no
    /// rim and ink for a label: a control floating over busy content (the
    /// thought map's toolbar) that needs a ground to read on but no outline
    /// of its own.
    public enum Variant: Sendable { case primary, ghost, outline, solid, danger, text, textAccent, paper }
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

    /// Stretch to the row's height (the thread's Send beside a growing field: `height: 100%`).
    var fillsHeight = false

    public func fillingHeight() -> OrganicButton {
        var copy = self
        copy.fillsHeight = true
        return copy
    }

    /// Flip a glyph-only chip's icon (arrow-right as "back": `transform: scaleX(-1)`).
    var mirrorsIcon = false
    /// A glyph-only chip at the size's own padding (sm: 9×18) instead of the tight 9×11.
    var roomyIcon = false

    public func roomy() -> OrganicButton {
        var copy = self
        copy.roomyIcon = true
        return copy
    }

    public func mirroringIcon() -> OrganicButton {
        var copy = self
        copy.mirrorsIcon = true
        return copy
    }

    @State private var pressPoint: CGPoint? = nil
    @State private var revealed = false
    @State private var ink: Double = 0
    @State private var pressed = false
    @State private var pressedAt: Date?
    /// Bumped on every press, so a lift scheduled by an earlier tap can't wipe the ink of a later one.
    @State private var generation = 0
    @State private var bounds: CGSize = .zero
    /// True while a finger is down; resets by itself when the touch ends *or is taken away* (the edge
    /// swipe claiming it, an alert) — so the button can't stay stuck pressed.
    @GestureState private var touching = false
    @Environment(\.isEnabled) private var isEnabled

    public var body: some View {
        let style = OrganicButtonStyle(variant: variant, size: size)
        let shape = OrganicButtonShape(seed: style.seed)
        face(style)
            .frame(maxHeight: fillsHeight ? .infinity : nil)
            .background {
                GeometryReader { geo in
                    ZStack {
                        style.fillLayers(shape)
                        // Ink reveal from the touch point. The circle is always there (at nothing), so a
                        // press grows it from 0 rather than inserting it at full size.
                        let p = pressPoint ?? CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
                        let maxR = hypot(max(p.x, geo.size.width - p.x), max(p.y, geo.size.height - p.y))
                        Circle()
                            .fill(style.filled ? Color.black.opacity(0.14) : Tokens.terracotta.opacity(0.14))
                            .frame(width: revealed ? maxR * 2 : 0, height: revealed ? maxR * 2 : 0)
                            .position(p)
                            .clipShape(shape)
                            .opacity(ink)
                        if style.stroked {
                            shape.stroke(style.stroke, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                        }
                    }
                }
            }
            // Busy / inactive: the web dims the whole button (fill, grain, ink, label).
            .opacity(isEnabled ? 1 : 0.6)
            .scaleEffect(pressed ? 0.97 : 1)
            .contentShape(shape)
            .onGeometryChange(for: CGSize.self) { $0.size } action: { bounds = $0 }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .updating($touching) { _, state, _ in state = true }
                    .onChanged { g in
                        guard isEnabled, !pressed else { return }
                        press(at: g.startLocation)
                    }
                    .onEnded { g in
                        // A real button's rule: lifting the finger off it (with a little slop) cancels.
                        guard isEnabled, CGRect(origin: .zero, size: bounds).insetBy(dx: -16, dy: -16).contains(g.location) else { return }
                        action()
                    }
            )
            .onChange(of: touching) { _, down in
                if !down { lift() }
            }
            .sensoryFeedback(.impact(weight: .light), trigger: pressed) { _, new in new }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(title)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { if isEnabled { action() } }
    }

    private func press(at point: CGPoint) {
        generation += 1
        pressedAt = .now
        pressPoint = point
        ink = 1
        revealed = false
        withAnimation(.easeOut(duration: 0.12)) { pressed = true }
        withAnimation(InkTiming.spread) { revealed = true }
    }

    /// The finger is up (or the touch was taken away): the ink finishes its spread, then lifts.
    private func lift() {
        guard pressed else { return }
        withAnimation(.easeOut(duration: 0.12)) { pressed = false }
        let mine = generation
        let wait = max(0, 0.3 - (pressedAt.map { Date.now.timeIntervalSince($0) } ?? 1))
        Task { @MainActor in
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard generation == mine else { return }
            withAnimation(InkTiming.lift) { ink = 0 }
            try? await Task.sleep(for: .milliseconds(220))
            guard generation == mine else { return }
            revealed = false
        }
    }
}

extension OrganicButton {
    @ViewBuilder fileprivate func face(_ style: OrganicButtonStyle) -> some View {
        if let iconOnlySize, let icon {
            OrganicIcon(icon, size: iconOnlySize)
                .scaleEffect(x: mirrorsIcon ? -1 : 1)
                .foregroundStyle(style.textColor)
                .padding(.horizontal, roomyIcon ? (size == .sm ? 18 : 32) : 11)
                .padding(.vertical, roomyIcon ? (size == .sm ? 9 : 14) : 9)
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
                    if style.stroked {
                        shape.stroke(style.stroke, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                    }
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
        case .primary, .solid, .danger: 3
        case .ghost, .text, .paper: 401
        case .outline, .textAccent: 601
        }
    }
    /// A filled face (the ink over it darkens rather than tints). The paper
    /// is light, so it tints terracotta like the frameless variants.
    var filled: Bool {
        switch variant {
        case .primary, .solid, .danger: true
        case .ghost, .outline, .text, .textAccent, .paper: false
        }
    }
    /// Whether the pen line is drawn: only the web's own three variants.
    var stroked: Bool {
        switch variant {
        case .primary, .ghost, .outline: true
        case .solid, .danger, .text, .textAccent, .paper: false
        }
    }
    var fill: Color {
        switch variant {
        case .primary, .solid: Tokens.terracotta
        case .danger: Tokens.danger
        case .paper: Tokens.cardBg
        case .ghost, .outline, .text, .textAccent: .clear
        }
    }
    var stroke: Color {
        switch variant {
        case .primary: Tokens.terracottaInk
        case .ghost: Tokens.ghostStroke
        // Darker than the label: the pen line reads apart from the text.
        case .outline: Tokens.terracottaOutline
        case .solid, .danger, .text, .textAccent, .paper: .clear
        }
    }
    var textColor: Color {
        switch variant {
        case .primary, .solid, .danger: Tokens.cream
        case .ghost, .paper: Tokens.text
        case .text: Tokens.textMuted
        case .outline, .textAccent: Tokens.terracotta
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
        if filled {
            GrainLayer(shape: shape, mode: .tile, opacity: 0.38, tile: "grain-button")
        } else if variant == .paper {
            // The cards' own tile, at the strength the modal's paper carries it.
            GrainLayer(shape: shape, mode: .tile, opacity: 0.3, tile: "grain-card")
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
