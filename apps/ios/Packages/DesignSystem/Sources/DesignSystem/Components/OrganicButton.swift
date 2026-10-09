import SwiftUI

// MARK: - Button

/// OrganicButton. On the web the fill reveal grows from the *cursor* on hover;
/// touch has no hover, so the same reveal grows from the *finger* on press —
/// the ink every control shares (``OrganicPressStyle``), spreading its full
/// course and then lifting — plus a light haptic and a slight scale.
public struct OrganicButton: View {
    /// A button is a filled shape and never draws a pen line — an outline marks a floating
    /// surface (a modal, a sheet, a menu), a container or an input, never a button — and every
    /// button has a fill: a bare word does not read as something to press, so a Cancel beside a
    /// verb is a pill as filled as the verb, only quieter (OrganicButton.tsx). By rank:
    /// - `solid`: the verb — deep terracotta, cream label (Publish, Sign in, Confirm).
    /// - `tonal`: everything beside it — a soft peach face, deep terracotta label: a secondary
    ///   action, Cancel / Keep / Close, Download, Load more, Unblock, Retry.
    /// - `danger`: solid in red, the final confirm of what can't be undone.
    /// - `dangerTonal`: the peach's red twin, for a button that opens a destructive flow
    ///   (Settings' Delete account), whose dialog then asks with `danger`.
    /// - `ink`: solid in the text ink, for a brand that asks for a black button (Apple's).
    /// - `paper`: the cards' paper (grain and all), ink label, for a control that must match a
    ///   paper surface.
    /// The older names keep working and wear the new faces, as on the web: `primary` is `solid`;
    /// `ghost`, `outline`, `text` and `textAccent` are `tonal`. Bare text is left to a link inside
    /// running text and to icon-only header and toolbar buttons, whose glyph is the affordance.
    public enum Variant: Sendable, CaseIterable {
        case primary, ghost, outline, solid, tonal, danger, dangerTonal, text, textAccent, paper, ink
    }
    /// `sm` is the web's dense size (dialog actions, list rows, the deletion
    /// banner); `lg` the sign-in sheet's provider buttons: a 16pt label, 12×16
    /// padding, at least 52 tall.
    public enum Size: Sendable { case md, sm, lg }

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

    /// A glyph alone on the button's face (the card box's pen to settings:
    /// tonal, small, the pad tightened to 9×11).
    public init(icon: IconName, label: String, iconSize: CGFloat = 17, variant: Variant = .tonal, size: Size = .sm,
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

    /// Stretch to the column's width, the label kept in the middle and the
    /// pill drawn at the full width (the sign-in sheet's provider buttons).
    var fillsWidth = false

    public func fillingWidth(_ fills: Bool = true) -> OrganicButton {
        var copy = self
        copy.fillsWidth = fills
        return copy
    }

    /// Set the brand mark on a white wobbly disc: Google's G keeps the light
    /// ground its guidelines ask for on a coloured face.
    var marksOnDisc = false

    public func markOnDisc() -> OrganicButton {
        var copy = self
        copy.marksOnDisc = true
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

    /// Working on the last tap ("Signing in…"): dimmed like a disabled
    /// button, showing `label`, ignoring taps. Both labels are laid out in the
    /// same spot, so the button keeps one size when it turns busy and back.
    var busyTitle: String?
    var isBusy = false

    public func busy(_ busy: Bool, label: String) -> OrganicButton {
        var copy = self
        copy.busyTitle = label
        copy.isBusy = busy
        return copy
    }

    /// Working on the last tap, the web's way for a dialog's verb (the resonate picker's 共振): the
    /// pen keeps inking where the glyph was — a small SketchLoader in the label's ink — the words
    /// stay, and taps are ignored. Not dimmed: the loader is what says it is busy. The loader
    /// takes the glyph's 16pt, so the button keeps its size. A verb without a glyph (the note's
    /// 寄出) has the loader inking where its words were, which keep their room.
    var isWorking = false

    public func working(_ working: Bool) -> OrganicButton {
        var copy = self
        copy.isWorking = working
        return copy
    }

    private var active: Bool { isEnabled && !isBusy }
    /// Takes a tap now: not while its dialog's foot waits on the last one (``ModalActions``'s
    /// `busy`, which dims the row itself rather than each button).
    private var tappable: Bool { active && !isWorking && !held }

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
    @Environment(\.organicButtonMinHeight) private var minHeight
    @Environment(\.organicButtonsHeld) private var held

    public var body: some View {
        let style = OrganicButtonStyle(variant: variant, size: size, minHeight: minHeight)
        let shape = OrganicButtonShape(seed: style.seed)
        face(style)
            .frame(maxWidth: fillsWidth ? .infinity : nil, maxHeight: fillsHeight ? .infinity : nil)
            .background {
                GeometryReader { geo in
                    ZStack {
                        style.fillLayers(shape)
                        // Ink reveal from the touch point. The circle is always there (at nothing), so a
                        // press grows it from 0 rather than inserting it at full size.
                        let p = pressPoint ?? CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
                        let maxR = hypot(max(p.x, geo.size.width - p.x), max(p.y, geo.size.height - p.y))
                        Circle()
                            .fill(style.face.pressInk)
                            .frame(width: revealed ? maxR * 2 : 0, height: revealed ? maxR * 2 : 0)
                            .position(p)
                            .clipShape(shape)
                            .opacity(ink)
                    }
                }
            }
            // The web dims the whole button (fill, grain, ink, label): not pressable yet 0.45, busy 0.6.
            .opacity(!isEnabled ? 0.45 : isBusy ? 0.6 : 1)
            .scaleEffect(pressed ? 0.97 : 1)
            .contentShape(shape)
            .onGeometryChange(for: CGSize.self) { $0.size } action: { bounds = $0 }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .updating($touching) { _, state, _ in state = true }
                    .onChanged { g in
                        guard tappable, !pressed else { return }
                        press(at: g.startLocation)
                    }
                    .onEnded { g in
                        // A real button's rule: lifting the finger off it (with a little slop) cancels.
                        guard tappable, CGRect(origin: .zero, size: bounds).insetBy(dx: -16, dy: -16).contains(g.location) else { return }
                        action()
                    }
            )
            .onChange(of: touching) { _, down in
                if !down { lift() }
            }
            .sensoryFeedback(.impact(weight: .light), trigger: pressed) { _, new in new }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(isBusy ? busyTitle ?? title : title)
            .accessibilityAddTraits(.isButton)
            .accessibilityAddTraits(isWorking ? .updatesFrequently : [])
            .accessibilityAction { if tappable { action() } }
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
                .frame(minHeight: style.minHeight)
        } else {
            style.label(title, icon: icon, image: image, onDisc: marksOnDisc, busyTitle: busyTitle, busy: isBusy, working: isWorking)
        }
    }
}

extension EnvironmentValues {
    /// The least height the buttons inside ask for (a dialog's foot: 44pt, a finger's), when any.
    @Entry public var organicButtonMinHeight: CGFloat? = nil
    /// The buttons inside take no tap (VoiceOver's included) and keep their faces: a dialog's foot
    /// while its action is on its way, the row dimmed as one (``ModalActions``'s `busy`).
    @Entry public var organicButtonsHeld = false
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

    @Environment(\.organicButtonMinHeight) private var minHeight
    var fillsWidth = false

    /// Stretch to the column's width, the label kept in the middle (as ``OrganicButton/fillingWidth(_:)``).
    public func fillingWidth(_ fills: Bool = true) -> OrganicButtonLabel {
        var copy = self
        copy.fillsWidth = fills
        return copy
    }

    public var body: some View {
        let style = OrganicButtonStyle(variant: variant, size: size, minHeight: minHeight)
        let shape = OrganicButtonShape(seed: style.seed)
        style.label(title, icon: icon, image: nil)
            .frame(maxWidth: fillsWidth ? .infinity : nil)
            .background { style.fillLayers(shape) }
            .contentShape(shape)
    }
}

/// One rank's face: what it is filled with, its label's ink, the ink a press spreads (a filled
/// face darkens, a tinted one takes a wash of its own hue), its wobble's seed and its grain.
public struct OrganicButtonFace: Equatable, Sendable {
    public let fill: Color
    public let label: Color
    public let pressInk: Color
    /// The web's BTN_SEEDS: each rank wobbles like the variant it grew out of.
    public let seed: Double
    /// The grain tile over the face and its strength.
    public let grain: String
    public let grainOpacity: Double

    static let solid = OrganicButtonFace(fill: Tokens.buttonFill, label: Tokens.cream, pressInk: .black.opacity(0.14), seed: 3)
    static let tonal = OrganicButtonFace(fill: Tokens.buttonTonal, label: Tokens.buttonOnTonal,
                                         pressInk: Tokens.terracotta.opacity(0.14), seed: 601)

    init(fill: Color, label: Color, pressInk: Color, seed: Double, grain: String = "grain-button", grainOpacity: Double = 0.38) {
        self.fill = fill
        self.label = label
        self.pressInk = pressInk
        self.seed = seed
        self.grain = grain
        self.grainOpacity = grainOpacity
    }

    public static func of(_ variant: OrganicButton.Variant) -> OrganicButtonFace {
        switch variant {
        case .primary, .solid: .solid
        case .tonal, .outline, .textAccent: .tonal
        // Cancel / Close / Keep and the ghost wobble as they did (seed 401) in the tonal face.
        case .ghost, .text: OrganicButtonFace(fill: Tokens.buttonTonal, label: Tokens.buttonOnTonal,
                                              pressInk: Tokens.terracotta.opacity(0.14), seed: 401)
        case .danger: OrganicButtonFace(fill: Tokens.dangerFill, label: Tokens.cream, pressInk: .black.opacity(0.14), seed: 3)
        case .dangerTonal: OrganicButtonFace(fill: Tokens.buttonDangerTonal, label: Tokens.buttonOnDangerTonal,
                                             pressInk: Tokens.danger.opacity(0.14), seed: 601)
        case .ink: OrganicButtonFace(fill: Tokens.text, label: Tokens.cream, pressInk: .black.opacity(0.14), seed: 3)
        // The cards' own tile, at the strength the modal's paper carries it.
        case .paper: OrganicButtonFace(fill: Tokens.cardBg, label: Tokens.text, pressInk: Tokens.terracotta.opacity(0.14),
                                       seed: 401, grain: "grain-card", grainOpacity: 0.3)
        }
    }
}

/// The .btn / .sm metrics and the rank's face, shared by the button and its label.
struct OrganicButtonStyle {
    let variant: OrganicButton.Variant
    let size: OrganicButton.Size
    /// The least height a dialog's foot asks of its buttons (44pt: a finger's), if any.
    var minHeight: CGFloat? = nil

    var face: OrganicButtonFace { .of(variant) }
    var seed: Double { face.seed }
    var textColor: Color { face.label }

    /// Label row: 16pt glyphs 7 apart; brand marks are 18pt, 10 from the text.
    /// With a `busyTitle`, both labels share one spot (the one not showing is
    /// clear), so the button is as wide in either state.
    func label(_ title: String, icon: IconName?, image: String?, onDisc: Bool = false, busyTitle: String? = nil,
               busy: Bool = false, working: Bool = false) -> some View {
        let fontSize: CGFloat = switch size { case .sm: 14; case .md: 15; case .lg: 16 }
        let padX: CGFloat = switch size { case .sm: 18; case .md: 32; case .lg: 16 }
        let padY: CGFloat = switch size { case .sm: 9; case .md: 14; case .lg: 12 }
        func text(_ s: String, scale: CGFloat = 1) -> Text {
            Text(s).font(AppFonts.body(fontSize * scale, weight: .semibold)).tracking(fontSize * scale * 0.02)
        }
        // One line: `lg` steps down to 85% first (Android's TextAutoSize steps)
        // and only past that wraps, at 85% — a long label at a large text size
        // on a narrow phone.
        @ViewBuilder func oneLine(_ s: String) -> some View {
            if size == .lg {
                ViewThatFits(in: .horizontal) {
                    text(s).lineLimit(1)
                    text(s, scale: 0.95).lineLimit(1)
                    text(s, scale: 0.9).lineLimit(1)
                    text(s, scale: 0.85).lineLimit(1)
                    text(s, scale: 0.85).multilineTextAlignment(.center)
                }
            } else {
                text(s).lineLimit(1)
            }
        }
        // No glyph to stand in for: the loader takes the words' place, in their room.
        let inkingWords = working && icon == nil && image == nil
        return HStack(spacing: image != nil ? 10 : 7) {
            if working, !inkingWords {
                SketchLoader(size: 16, color: textColor).accessibilityHidden(true)
            } else if let icon {
                OrganicIcon(icon, size: 16)
            }
            if let image { mark(image, onDisc: onDisc) }
            Group {
                if let busyTitle {
                    ZStack(alignment: .leading) {
                        oneLine(title).opacity(busy ? 0 : 1)
                        oneLine(busyTitle).opacity(busy ? 1 : 0)
                    }
                } else if size == .lg {
                    oneLine(title)
                } else {
                    text(title)
                }
            }
            .opacity(inkingWords ? 0 : 1)
            .overlay {
                if inkingWords { SketchLoader(size: 16, color: textColor).accessibilityHidden(true) }
            }
        }
        .foregroundStyle(textColor)
        .padding(.horizontal, padX)
        .padding(.vertical, padY)
        .frame(minHeight: size == .lg ? 52 : minHeight)
    }

    /// An 18pt brand mark. On a disc it sits on a white wobbly circle 30
    /// across; at `lg` a bare mark keeps the disc's room too, so Apple's and
    /// Google's buttons stand the same height.
    private func mark(_ image: String, onDisc: Bool) -> some View {
        let slot: CGFloat = onDisc || size == .lg ? 30 : 18
        return ZStack {
            if onDisc {
                WobCircleShape(seed: seed + 9, options: WobCircleOptions(segments: 8, mag: 0.7, cpJitter: 0.4))
                    .fill(Color.white)
            }
            Image(image).resizable().scaledToFit().frame(width: 18, height: 18)
        }
        .frame(width: slot, height: slot)
    }

    @ViewBuilder func fillLayers(_ shape: OrganicButtonShape) -> some View {
        shape.fill(face.fill)
        GrainLayer(shape: shape, mode: .tile, opacity: face.grainOpacity, tile: face.grain, overflow: 3)
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
