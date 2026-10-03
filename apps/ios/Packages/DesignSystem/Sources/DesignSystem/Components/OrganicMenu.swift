import SwiftUI

// MARK: - Menu

/// One row of an ``OrganicMenu``.
public struct OrganicMenuItem: Identifiable {
    public let id: String
    public let title: String
    public let icon: IconName
    /// Destructive rows sit on the warning wash.
    public var danger: Bool
    public let action: () -> Void

    public init(id: String, title: String, icon: IconName, danger: Bool = false, action: @escaping () -> Void) {
        self.id = id
        self.title = title
        self.icon = icon
        self.danger = danger
        self.action = action
    }
}

/// How a menu's trigger is drawn. In a bar (the card page's header) it is a
/// `bare` glyph like the back arrow beside it — the bar is the frame. Over
/// content (a card's cover in the card box) it is a `chip`: a wobbly cream
/// squircle with no rim, so it stays legible over a picture without adding a
/// pen line.
public enum MenuTrigger: Sendable { case chip, bare }

/// The web's organic「⋯」dropdown: a trigger that drops a hand-drawn panel —
/// wavy pen lines between the rows, ink spreading from the finger under the
/// one being pressed (every control's press), and the warning wash under a
/// destructive row. Rides the theme terracotta, or a card's hue.
public struct OrganicMenu: View {
    let items: [OrganicMenuItem]
    let label: String
    var seed: Double
    var hue: Double?
    var triggerSize: CGFloat
    var icon: IconName
    var trigger: MenuTrigger

    public init(items: [OrganicMenuItem], label: String, seed: Double = 7, hue: Double? = nil,
                triggerSize: CGFloat = 38, icon: IconName = .dots, trigger: MenuTrigger = .chip) {
        self.items = items
        self.label = label
        self.seed = seed
        self.hue = hue
        self.triggerSize = triggerSize
        self.icon = icon
        self.trigger = trigger
    }

    @State private var open = false
    @State private var anchor: CGRect = .zero
    @State private var panelSeed: Double = 0

    public var body: some View {
        let colors = MenuColors(hue: hue)
        Button {
            // A fresh panel each time, like the web's.
            panelSeed = Double(Int.random(in: 0..<10_000))
            withTransaction(\.disablesAnimations, true) { open = true }
        } label: {
            Group {
                if trigger == .bare {
                    OrganicIcon(icon, size: 20, color: open ? Tokens.terracotta : Tokens.text)
                } else {
                    OrganicMenuChip(size: triggerSize, seed: seed, icon: icon, colors: colors, active: open)
                }
            }
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: trigger == .bare ? 4 : max(0, (44 - triggerSize) / 2)))
        .accessibilityLabel(label)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { anchor = $0 }
        .fullScreenCover(isPresented: $open) {
            // A bare glyph's wash is 36 in its 44 box: the panel hangs from that, as from a chip.
            MenuStage(items: items, seed: panelSeed, colors: colors, anchor: anchor, triggerSize: trigger == .bare ? 36 : triggerSize) { item in
                withTransaction(\.disablesAnimations, true) { open = false }
                // After the cover is gone, so a dialog the row opens can present.
                if let item {
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(150))
                        item.action()
                    }
                }
            }
            .presentationBackground(.clear)
        }
    }
}

/// OrganicMenu's trigger as a face of its own, for other header actions that
/// should read as the same control (a ShareLink's label): bare in a bar, a
/// chip over content.
public struct OrganicChipFace: View {
    let icon: IconName
    var size: CGFloat
    var seed: Double
    var hue: Double?
    var trigger: MenuTrigger

    public init(_ icon: IconName, size: CGFloat = 38, seed: Double = 7, hue: Double? = nil, trigger: MenuTrigger = .chip) {
        self.icon = icon
        self.size = size
        self.seed = seed
        self.hue = hue
        self.trigger = trigger
    }

    public var body: some View {
        Group {
            if trigger == .bare {
                OrganicIcon(icon, size: 20, color: Tokens.text)
            } else {
                OrganicMenuChip(size: size, seed: seed, icon: icon, colors: MenuColors(hue: hue), active: false)
            }
        }
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
    }
}

/// The trigger: a squircle chip (radius 0.42 of its side, one turn a side)
/// in the menu's cream, no rim, the glyph at 0.53 of the side in the pen.
struct OrganicMenuChip: View {
    let size: CGFloat
    let seed: Double
    let icon: IconName
    let colors: MenuColors
    var active: Bool

    var body: some View {
        let shape = WobRectShape(radius: size * 0.42, seed: seed, mag: size * 0.03, options: WobRectOptions(
            curve: 1.4, cornerJitter: 2.4, segmentsH: .count(1), segmentsV: .count(1)))
        OrganicIcon(icon, size: (size * 0.53).rounded(), color: active ? colors.borderHover : colors.border, strokeWidth: Tokens.ink)
            .frame(width: size, height: size)
            .background { shape.fill(colors.cream.opacity(0.94)) }
    }
}

/// The dropped panel, anchored 8 under the trigger's trailing edge; a tap
/// anywhere else closes it.
struct MenuStage: View {
    let items: [OrganicMenuItem]
    let seed: Double
    let colors: MenuColors
    let anchor: CGRect
    let triggerSize: CGFloat
    let close: (OrganicMenuItem?) -> Void
    @State private var shown = false

    var body: some View {
        GeometryReader { geo in
            let screen = geo.frame(in: .global)
            ZStack(alignment: .topTrailing) {
                Color.black.opacity(0.001)
                    .onTapGesture { close(nil) }
                    .accessibilityHidden(true)
                panel
                    .scaleEffect(shown ? 1 : 0.94, anchor: .topTrailing)
                    .offset(y: shown ? 0 : -4)
                    .opacity(shown ? 1 : 0)
                    // The chip is centred in its 44pt hit box.
                    .padding(.top, anchor.midY + triggerSize / 2 + 8 - screen.minY)
                    .padding(.trailing, max(12, screen.maxX - anchor.midX - triggerSize / 2))
            }
        }
        .ignoresSafeArea()
        .accessibilityAction(.escape) { close(nil) }
        .onAppear { withAnimation(.timingCurve(0.2, 0.8, 0.3, 1, duration: 0.18)) { shown = true } }
    }

    private var panel: some View {
        OrganicMenuPanel(items: items, seed: seed, colors: colors) { close($0) }
    }
}

/// The rows of an organic menu on their hand-drawn panel (rowMenu.ts): wavy pen lines between the
/// rows, ink spreading from the finger under the one being pressed, the warning wash under a
/// destructive row — and, with a `footer`, one quieter line under the rows (a message's time, under
/// its long-press menu). ``OrganicMenu`` drops it from its trigger; a screen can hang it anywhere
/// (the thread's long-press). `onChoose` comes a moment after the tap, once the ink has been seen;
/// the panel takes one choice.
public struct OrganicMenuPanel: View {
    let items: [OrganicMenuItem]
    let seed: Double
    let footer: String?
    let colors: MenuColors
    let onChoose: (OrganicMenuItem) -> Void
    @State private var pressed: Int?
    @State private var ink = MenuInk()
    @State private var choosing = false

    public init(items: [OrganicMenuItem], seed: Double, footer: String? = nil, hue: Double? = nil,
                onChoose: @escaping (OrganicMenuItem) -> Void) {
        self.init(items: items, seed: seed, footer: footer, colors: MenuColors(hue: hue), onChoose: onChoose)
    }

    init(items: [OrganicMenuItem], seed: Double, footer: String? = nil, colors: MenuColors, onChoose: @escaping (OrganicMenuItem) -> Void) {
        self.items = items
        self.seed = seed
        self.footer = footer
        self.colors = colors
        self.onChoose = onChoose
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                Button { choose(item) } label: {
                    HStack(spacing: 8) {
                        OrganicIcon(item.icon, size: 17, color: pressed == i ? colors.borderHover : colors.border, strokeWidth: Tokens.ink)
                        Text(item.title)
                            .font(AppFonts.body(14))
                            .foregroundStyle(pressed == i ? colors.borderHover : Tokens.text)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 8)
                    .frame(maxWidth: .infinity, minHeight: MenuPanelShape.rowHeight, maxHeight: MenuPanelShape.rowHeight, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(MenuRowStyle(index: i, pressed: $pressed, ink: $ink))
                // Where the finger landed, in the panel's space: the ink spreads from there.
                .simultaneousGesture(DragGesture(minimumDistance: 0, coordinateSpace: .named(MenuPanelShape.space)).onChanged { g in
                    if g.translation == .zero { ink.origin = g.startLocation }
                })
            }
            if let footer {
                Text(footer)
                    .font(AppFonts.body(12))
                    .foregroundStyle(Tokens.textMuted)
                    .lineLimit(1)
                    .padding(.horizontal, 8)
                    .frame(maxWidth: .infinity, minHeight: MenuPanelShape.footerHeight, maxHeight: MenuPanelShape.footerHeight, alignment: .leading)
            }
        }
        .frame(minWidth: 180 - 16, alignment: .leading)
        .padding(.horizontal, 8)
        .fixedSize()
        .background {
            GeometryReader { geo in
                MenuPanelBackground(size: geo.size, seed: seed, colors: colors,
                                    dangerIndex: items.firstIndex(where: \.danger), ink: ink, count: items.count,
                                    bands: items.count + (footer == nil ? 0 : 1))
            }
        }
        .coordinateSpace(.named(MenuPanelShape.space))
        .accessibilityElement(children: .contain)
    }

    /// A tap is shorter than the ink's spread: the choice is told once it has shown.
    private func choose(_ item: OrganicMenuItem) {
        guard !choosing else { return }
        choosing = true
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(150))
            onChoose(item)
        }
    }
}

/// The pressed row's ink: where it started, how far it has spread (0…1 of
/// the way to the panel's far corner) and how much is still on the paper.
struct MenuInk {
    var row: Int?
    var origin: CGPoint?
    var reach: CGFloat = 0
    var opacity: Double = 0
}

/// Reports the pressed row and runs its ink: the spread on press, the lift
/// once the finger is up and the spread has run its course.
struct MenuRowStyle: ButtonStyle {
    let index: Int
    @Binding var pressed: Int?
    @Binding var ink: MenuInk

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, isPressed in
                if isPressed {
                    pressed = index
                    ink.row = index
                    ink.opacity = 1
                    ink.reach = 0
                    withAnimation(InkTiming.spread) { ink.reach = 1 }
                } else {
                    if pressed == index { pressed = nil }
                    // A quick tap still shows the spread before it lifts (unless another row has the ink by then).
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(200))
                        guard ink.row == index, pressed == nil else { return }
                        withAnimation(InkTiming.lift) { ink.opacity = 0 }
                    }
                }
            }
    }
}

/// The panel's paper, washes, pen dividers and rim (rowMenu.ts), every wash
/// stopping exactly at the wobbly outline. The pen line wobbles a little past
/// the panel's box, so the drawing has `bleed` of room on every side — a
/// canvas cut at the box would show the outline clipped straight.
struct MenuPanelBackground: View {
    let size: CGSize
    let seed: Double
    let colors: MenuColors
    let dangerIndex: Int?
    let ink: MenuInk
    /// The rows; `bands` counts a footer under them too (a divider above it, no ink in it).
    let count: Int
    var bands: Int? = nil
    private let bleed: CGFloat = 6

    var body: some View {
        let geometry = MenuPanelShape(seed: seed, count: bands ?? count)
        let rect = CGRect(origin: .zero, size: size)
        let w = Double(size.width), h = Double(size.height)
        let boundaries = geometry.boundaries(width: w)
        let pad = geometry.pad(height: h)
        let outer = geometry.outline(in: rect)
        ZStack(alignment: .topLeading) {
            Canvas { ctx, _ in
                ctx.translateBy(x: bleed, y: bleed)
                var inside = ctx
                inside.clip(to: outer)
                inside.fill(outer, with: .color(colors.cream))
                if let dangerIndex {
                    let region = rowRegion(dangerIndex, count: bands ?? count, boundaries: boundaries, w: w, h: h, pad: pad).path()
                    inside.fill(region, with: .color(colors.dangerWash(pressed: false)))
                }
            }
            if let row = ink.row, row < count {
                let origin = ink.origin ?? CGPoint(x: size.width / 2, y: (CGFloat(row) + 0.5) * MenuPanelShape.rowHeight)
                let far = hypot(max(origin.x, size.width - origin.x), max(origin.y, size.height - origin.y)) + 4
                let region = rowRegion(row, count: bands ?? count, boundaries: boundaries, w: w, h: h, pad: pad).path()
                Circle()
                    .fill(row == dangerIndex ? colors.dangerWash(pressed: true) : colors.borderHover.opacity(0.15))
                    .frame(width: far * 2 * ink.reach, height: far * 2 * ink.reach)
                    .position(origin)
                    .frame(width: size.width, height: size.height)
                    .clipShape(PathShape(path: region.intersection(outer)))
                    .opacity(ink.opacity)
                    .offset(x: bleed, y: bleed)
            }
            Canvas { ctx, _ in
                ctx.translateBy(x: bleed, y: bleed)
                var inside = ctx
                inside.clip(to: outer)
                for pts in boundaries {
                    inside.stroke(dividerPath(pts).path(), with: .color(colors.divider),
                                  style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
                }
                ctx.stroke(outer, with: .color(colors.border), style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: size.width + 2 * bleed, height: size.height + 2 * bleed)
        .offset(x: -bleed, y: -bleed)
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .allowsHitTesting(false)
    }
}

/// A fixed path as a shape (a row's region, for clipping its ink).
private nonisolated struct PathShape: Shape {
    let path: Path
    func path(in rect: CGRect) -> Path { path }
}

/// OrganicMenu's geometry: 42pt rows, a radius-16 outline with the auto
/// wobble, and a wavy boundary (amplitude 2) between each pair of rows (and
/// above a footer: `count` is the bands, the footer one of them).
nonisolated struct MenuPanelShape {
    static let rowHeight: CGFloat = 42
    /// A footer line under the rows is a little shorter than a row.
    static let footerHeight: CGFloat = 38
    /// The panel's coordinate space, where a row's press is placed.
    static let space = "organicMenuPanel"
    let seed: Double
    let count: Int

    func outline(in rect: CGRect) -> Path {
        WobRectShape(radius: 16, seed: seed + 100).path(in: rect)
    }

    func pad(height: Double) -> Double { max(10, height * 0.04) }

    func boundaries(width: Double) -> [[Point]] {
        let h = Double(count) * Double(Self.rowHeight)
        return (0..<max(0, count - 1)).map { i in
            rowBoundary(y: Double(i + 1) * Double(Self.rowHeight), w: width, seed: seed + Double(i) * 31 + 7, amp: 2, pad: pad(height: h))
        }
    }
}

/// The --menu-* colors: theme terracotta, or a card's hue.
struct MenuColors {
    let border: Color
    let borderHover: Color
    let cream: Color
    let divider: Color
    /// The cream the washes mix into, as oklch.
    private let creamLCH: (Double, Double, Double)

    init(hue: Double?) {
        if let hue {
            border = OKLCHColor.color(0.52, 0.11, hue)
            borderHover = OKLCHColor.color(0.38, 0.09, hue)
            creamLCH = (0.98, 0.01, hue)
            divider = OKLCHColor.color(0.55, 0.04, hue, alpha: 0.4)
        } else {
            border = Tokens.terracotta
            borderHover = Tokens.terracottaDeep
            creamLCH = (0.965, 0.015, 75)
            divider = Tokens.terracotta.opacity(0.4)
        }
        cream = OKLCHColor.color(creamLCH.0, creamLCH.1, creamLCH.2)
    }

    /// color-mix(in oklch, yellow 25% — 45% while pressed —, menu-cream).
    func dangerWash(pressed: Bool) -> Color {
        let t = pressed ? 0.45 : 0.25
        let yellow = (0.88, 0.10, 90.0)
        let dh = (yellow.2 - creamLCH.2 + 540).truncatingRemainder(dividingBy: 360) - 180
        return OKLCHColor.color(creamLCH.0 + (yellow.0 - creamLCH.0) * t,
                                creamLCH.1 + (yellow.1 - creamLCH.1) * t,
                                creamLCH.2 + dh * t)
    }
}
