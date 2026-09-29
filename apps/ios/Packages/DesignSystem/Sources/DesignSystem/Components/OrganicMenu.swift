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

/// The web's organic「⋯」dropdown: a wobbly chip that drops a hand-drawn
/// panel — wavy pen lines between the rows, a wash under the one being
/// pressed, and the warning wash under a destructive row. Rides the theme
/// terracotta, or a card's hue.
public struct OrganicMenu: View {
    let items: [OrganicMenuItem]
    let label: String
    var seed: Double
    var hue: Double?
    var triggerSize: CGFloat
    var icon: IconName

    public init(items: [OrganicMenuItem], label: String, seed: Double = 7, hue: Double? = nil,
                triggerSize: CGFloat = 38, icon: IconName = .dots) {
        self.items = items
        self.label = label
        self.seed = seed
        self.hue = hue
        self.triggerSize = triggerSize
        self.icon = icon
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
            OrganicMenuChip(size: triggerSize, seed: seed, icon: icon, colors: colors, active: open)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { anchor = $0 }
        .fullScreenCover(isPresented: $open) {
            MenuStage(items: items, seed: panelSeed, colors: colors, anchor: anchor, triggerSize: triggerSize) { item in
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

/// OrganicMenu's trigger chip as a face of its own, for other header actions
/// that should read as the same control (a ShareLink's label).
public struct OrganicChipFace: View {
    let icon: IconName
    var size: CGFloat
    var seed: Double
    var hue: Double?

    public init(_ icon: IconName, size: CGFloat = 38, seed: Double = 7, hue: Double? = nil) {
        self.icon = icon
        self.size = size
        self.seed = seed
        self.hue = hue
    }

    public var body: some View {
        OrganicMenuChip(size: size, seed: seed, icon: icon, colors: MenuColors(hue: hue), active: false)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}

/// The trigger: a squircle chip (radius 0.42 of its side, one turn a side)
/// in the menu's cream at 90% with its ink rim, the glyph at 0.53 of the side.
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
            .background {
                shape.fill(colors.cream.opacity(0.9))
                shape.stroke(colors.border, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
            }
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
    @State private var pressed: Int?

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
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                Button { close(item) } label: {
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
                .buttonStyle(MenuRowStyle(index: i, pressed: $pressed))
            }
        }
        .frame(minWidth: 180 - 16, alignment: .leading)
        .padding(.horizontal, 8)
        .fixedSize()
        .background {
            GeometryReader { geo in
                MenuPanelBackground(size: geo.size, seed: seed, colors: colors,
                                    dangerIndex: items.firstIndex(where: \.danger), pressed: pressed, count: items.count)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

/// Reports the pressed row, so the panel can wash its wavy region.
struct MenuRowStyle: ButtonStyle {
    let index: Int
    @Binding var pressed: Int?

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, isPressed in
                if isPressed { pressed = index } else if pressed == index { pressed = nil }
            }
    }
}

/// The panel's paper, washes, pen dividers and rim (rowMenu.ts), drawn in
/// one pass so every wash stops exactly at the wobbly outline.
struct MenuPanelBackground: View {
    let size: CGSize
    let seed: Double
    let colors: MenuColors
    let dangerIndex: Int?
    let pressed: Int?
    let count: Int

    var body: some View {
        let geometry = MenuPanelShape(seed: seed, count: count)
        Canvas { ctx, size in
            let rect = CGRect(origin: .zero, size: size)
            let outer = geometry.outline(in: rect)
            let boundaries = geometry.boundaries(width: Double(size.width))
            let pad = geometry.pad(height: Double(size.height))
            var inside = ctx
            inside.clip(to: outer)
            inside.fill(outer, with: .color(colors.cream))
            func region(_ i: Int) -> Path {
                rowRegion(i, count: count, boundaries: boundaries, w: Double(size.width), h: Double(size.height), pad: pad).path()
            }
            if let dangerIndex {
                inside.fill(region(dangerIndex), with: .color(colors.dangerWash(pressed: pressed == dangerIndex)))
            }
            if let pressed, pressed != dangerIndex {
                inside.fill(region(pressed), with: .color(colors.borderHover.opacity(0.15)))
            }
            for pts in boundaries {
                inside.stroke(dividerPath(pts).path(), with: .color(colors.divider),
                              style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
            }
            ctx.stroke(outer, with: .color(colors.border), style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
        }
        .frame(width: size.width, height: size.height)
        .allowsHitTesting(false)
    }
}

/// OrganicMenu's geometry: 42pt rows, a radius-16 outline with the auto
/// wobble, and a wavy boundary (amplitude 2) between each pair of rows.
nonisolated struct MenuPanelShape {
    static let rowHeight: CGFloat = 42
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
