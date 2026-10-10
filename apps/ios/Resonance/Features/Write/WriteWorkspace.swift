import DesignSystem
import ResonanceKit
import SwiftUI

/// The editor pane's width at the split (round 5 E5), as a share of the workspace's: what a drag on
/// its grip makes of it. Between 32 % and 50 % it resizes the pane (the web's limits); past 32 %
/// toward the trailing edge the pane, kept at 32 %, slides after the finger; under 18 % shown, it is
/// in the hide zone, where letting go hides it. Let go between 18 % and 32 %, it springs back to 32 %.
enum EditorSplit {
    /// The web's MIN_EDITOR_FRAC and MAX_EDITOR_FRAC.
    static let minFraction: CGFloat = 0.32
    static let maxFraction: CGFloat = 0.5
    /// Narrower than this shown, a release hides the pane.
    static let hideFraction: CGFloat = 0.18
    /// One VoiceOver swipe on the grip.
    static let step: CGFloat = 0.05

    /// The pane under a finger.
    struct Drag: Equatable {
        /// The pane's own width: never under the minimum (past it the pane slides instead).
        var width: CGFloat
        /// How much of it shows.
        var shown: CGFloat
        /// Let go here, the pane hides (it dims, the pill says so).
        var hides: Bool
    }

    /// The pane with its boundary at `x` in a workspace `width` across.
    static func drag(to x: CGFloat, width: CGFloat) -> Drag {
        guard width > 0 else { return Drag(width: maxFraction, shown: maxFraction, hides: false) }
        let shown = min(max((width - x) / width, 0), maxFraction)
        return Drag(width: max(shown, minFraction), shown: shown, hides: shown < hideFraction)
    }

    enum Release: Equatable {
        /// The pane stays, this wide (sprung back to the minimum when let go below it).
        case resize(CGFloat)
        case hide
    }

    static func release(shown: CGFloat) -> Release {
        shown < hideFraction ? .hide : .resize(min(max(shown, minFraction), maxFraction))
    }

    /// The pane `steps` VoiceOver swipes wider (negative: narrower), within the limits.
    static func adjusted(_ fraction: CGFloat, steps: Int) -> CGFloat {
        min(max(fraction + CGFloat(steps) * step, minFraction), maxFraction)
    }

    /// A drag on the docked grip shows the pane again once it has gone this far toward the leading
    /// side — or as a tap, barely moving.
    static func showsAgain(translation: CGSize) -> Bool {
        translation.width < -12 || (abs(translation.width) < 8 && abs(translation.height) < 8)
    }
}

/// What the workspace asks of the card in its pane, filled in by its ``WriteScreen``.
@MainActor final class WritePane {
    /// Saves what is written now (hiding the pane, opening another card in it).
    var saveNow: () -> Void = {}
    /// Whether the page should ask before it goes back (writing to put away).
    var holds: () -> Bool = { false }
    /// The writer's way back: the question first while there is writing, then the page goes.
    var goBack: (() -> Void)?

    func clear() {
        saveNow = {}
        holds = { false }
        goBack = nil
    }
}

/// The writer and the thought map, one page (round 5 E5). From 1200 across: the map on the leading
/// side and the editor pane on the trailing side, with no bar over either — the way back is the Back
/// floating on the canvas, which asks the writer's question while the pane holds writing — and a
/// grip on their boundary, the only way to hide the pane (``EditorSplit``). The writer opens it with
/// the pane open on its card; the map page with the pane closed. One of my cards tapped on the map
/// opens in the pane, in place (the card there saved first); anyone else's opens its page. Hidden,
/// the map takes the width and the grip docks at the trailing edge while there is a card to show
/// again, as it was. Narrower than 1200 nothing changes: the writer is the editor under its bar, the
/// map page the map alone, whose cards push the writer.
struct WriteWorkspace: View {
    enum Entry: Equatable {
        case writer(WriteLauncher.Request)
        case map
    }

    let entry: Entry
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.openRoute) private var openRoute
    @Environment(\.dismiss) private var dismiss
    @Environment(\.window) private var window
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The card the pane holds (the writer's, or the last one opened on the map) and whether the map opened it.
    @State private var card: WriteLauncher.Request?
    @State private var fromMap = false
    @State private var open: Bool
    /// The pane's width as last set (a share of the workspace's).
    @State private var fraction = EditorSplit.maxFraction
    /// A drag on the open pane's grip, while it lasts.
    @State private var drag: EditorSplit.Drag?
    /// A drag on the docked grip: how much of the pane shows meanwhile.
    @State private var docking: CGFloat?
    /// The pane's opacity as reduced motion fades it out or in, rather than sliding it.
    @State private var fade: Double = 1
    /// Each hiding, for its tick.
    @State private var hidings = 0
    @State private var pane = WritePane()
    private static let space = "write.workspace"

    /// The pane's first line, level with the Back floating on the canvas (both under the status bar).
    static let paneTop: CGFloat = 8

    init(entry: Entry) {
        self.entry = entry
        if case let .writer(request) = entry {
            _card = State(initialValue: request)
            _open = State(initialValue: true)
        } else {
            _open = State(initialValue: false)
        }
    }

    private var split: Bool { window.writerSplit }
    private var isWriter: Bool { entry != .map }

    var body: some View {
        GeometryReader { geo in
            content(width: geo.size.width)
        }
        .coordinateSpace(.named(Self.space))
        .background(Tokens.cream)
        .toolbar(.hidden, for: .navigationBar)
        // The edge swipe asks the writer's question while the pane's card holds writing.
        .takesSwipeBack(while: { pane.holds() }) { back() }
        .sensoryFeedback(.impact(weight: .light), trigger: drag?.hides ?? false) { was, now in !was && now }
        .sensoryFeedback(.impact(weight: .light), trigger: hidings)
        // Narrowed under the split, the map page is the map alone again: a card in its pane is saved
        // and let go (its cards then push the writer, which would otherwise open it twice).
        .onChange(of: split) { _, now in
            guard !now, entry == .map, card != nil else { return }
            pane.saveNow()
            forget()
        }
    }

    @ViewBuilder private func content(width w: CGFloat) -> some View {
        let showsMap = split || entry == .map
        let shown = paneShown * w
        ZStack(alignment: .topLeading) {
            if showsMap {
                ThoughtMapScreen(openCard: split ? { openFromMap($0) } : nil, back: { back() })
                    .frame(width: split ? max(0, w - shown) : w)
            }
            if let card, split || isWriter {
                let paneW = split ? paneWidth * w : w
                WriteScreen(request: card, pane: pane, showsBar: !split, onDone: fromMap ? { done() } : nil)
                    .id(card)
                    .frame(width: paneW)
                    // The boundary: a hair of line on the pane's own leading edge, from the top.
                    .overlay(alignment: .leading) {
                        if split {
                            Rectangle().fill(Tokens.fieldBorder).frame(width: 1).offset(x: -1)
                                .ignoresSafeArea().accessibilityHidden(true)
                        }
                    }
                    .opacity(fade * (drag?.hides == true ? 0.5 : 1))
                    .offset(x: split ? w - shown : 0)
                    .allowsHitTesting(!split || (open && drag == nil))
                    .accessibilityHidden(split && !open)
            }
            if split, card != nil {
                grip(width: w, shown: shown)
            }
        }
        .frame(width: w, alignment: .leading)
    }

    /// How much of the pane shows (a share of the width).
    private var paneShown: CGFloat {
        if let drag { return drag.shown }
        if let docking { return docking }
        return open ? fraction : 0
    }

    /// The pane's own width: its last width, or the drag's (never under the minimum).
    private var paneWidth: CGFloat { drag?.width ?? fraction }

    // MARK: - The grip

    /// The web's grip (a small inked chip with ⟷) on the boundary, or docked at the trailing edge while
    /// the pane is hidden; a finger's 44 around it. VoiceOver adjusts the pane's width with it and has
    /// it hide or show the pane.
    private func grip(width w: CGFloat, shown: CGFloat) -> some View {
        let docked = !open && drag == nil
        // Docked, and drawn out by a finger: the grip rides the pane's edge once it is past the dock.
        let x = docked ? w - max(Self.dockInset, shown) : w - shown
        return GeometryReader { geo in
            EditorGripFace(active: drag != nil || docking != nil)
                    .frame(width: Self.gripTarget.width, height: Self.gripTarget.height)
                    .contentShape(Rectangle())
                    .gesture(gripDrag(width: w))
                    // The pill by the grip, toward the map, while a release would hide the pane.
                    .overlay(alignment: .trailing) {
                        if drag?.hides == true {
                            ReleasePill()
                                .fixedSize()
                                // Its trailing end 4 before the grip's target, 12 before its face.
                                .offset(x: -(Self.gripTarget.width + 4))
                                .transition(.opacity)
                        }
                    }
                    .accessibilityElement()
                    .accessibilityLabel(L10n.Write.resizeDivider)
                    .accessibilityValue(open ? Double(fraction).formatted(.percent.precision(.fractionLength(0))) : "")
                    .accessibilityAdjustableAction { direction in
                        switch direction {
                        case .increment: if open { fraction = EditorSplit.adjusted(fraction, steps: 1) } else { show() }
                        case .decrement: if open { fraction = EditorSplit.adjusted(fraction, steps: -1) }
                        @unknown default: break
                        }
                    }
                    .accessibilityAction(named: open ? L10n.Write.closeEditor : L10n.Write.openEditor) {
                        if open { hide() } else { show() }
                    }
                    .position(x: x, y: geo.size.height / 2)
            .animation(.easeOut(duration: 0.12), value: drag?.hides ?? false)
        }
    }

    /// The docked grip's centre, in from the trailing edge.
    static let dockInset: CGFloat = 22
    static let gripTarget = CGSize(width: 44, height: 64)

    /// On the open pane's boundary it resizes the pane, slides it out past the minimum and hides it
    /// from the zone; on the docked grip a tap, or a drag toward the leading side, shows it again at
    /// its last width.
    private func gripDrag(width w: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named(Self.space))
            .onChanged { value in
                if open {
                    // The boundary follows the finger from where the drag took it, wherever on the grip that was.
                    drag = EditorSplit.drag(to: w - fraction * w + value.translation.width, width: w)
                } else if value.translation.width < 0 {
                    docking = min(-value.translation.width / w, fraction)
                }
            }
            .onEnded { value in
                if open {
                    let last = EditorSplit.drag(to: w - fraction * w + value.translation.width, width: w)
                    switch EditorSplit.release(shown: last.shown) {
                    case .hide:
                        hide()
                    case let .resize(share):
                        withAnimation(reduceMotion ? nil : .spring(duration: 0.3, bounce: 0.12)) {
                            fraction = share
                            drag = nil
                        }
                    }
                } else if EditorSplit.showsAgain(translation: value.translation) {
                    show()
                } else {
                    withAnimation(.easeOut(duration: 0.2)) { docking = nil }
                }
            }
    }

    // MARK: - Showing, hiding, opening

    /// Hides the pane (slides out in 200 ms; reduced motion: fades), the draft saved at once and the
    /// editor kept as it is.
    private func hide() {
        pane.saveNow()
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        hidings += 1
        if reduceMotion {
            withAnimation(.easeOut(duration: 0.2)) { fade = 0 } completion: {
                open = false
                drag = nil
                fade = 1
            }
        } else {
            withAnimation(.easeOut(duration: 0.2)) {
                open = false
                drag = nil
            }
        }
    }

    /// Shows the pane again at its last width, with its card as it was.
    private func show() {
        if reduceMotion {
            fade = 0
            open = true
            docking = nil
            withAnimation(.easeOut(duration: 0.2)) { fade = 1 }
        } else {
            withAnimation(.easeOut(duration: 0.2)) {
                open = true
                docking = nil
            }
        }
    }

    /// A card tapped on the map at the split: one of mine opens in the pane (the card there saved
    /// first); anyone else's opens its page.
    private func openFromMap(_ tapped: MapCard) {
        guard tapped.authorId == session.uid else {
            openRoute(.card(tapped.slug ?? tapped.id))
            return
        }
        if card?.cardId == tapped.id {
            if !open { show() }
            return
        }
        if card != nil {
            // Saved, and the lists (the map's own titles among them) hear of what it wrote.
            pane.saveNow()
            pane.clear()
        }
        card = WriteLauncher.Request(cardId: tapped.id, showsCard: false)
        fromMap = true
        if !open { show() }
    }

    /// Done with a card the map opened (published, revised, dropped, saved and left): the pane hides
    /// and lets it go — there is nothing to show again.
    private func done() {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
            open = false
            drag = nil
        } completion: {
            forget()
        }
    }

    private func forget() {
        pane.clear()
        card = nil
        fromMap = false
        open = false
        drag = nil
        docking = nil
    }

    /// The Back on the canvas and the edge swipe: the writer's rule while the pane holds a card (the
    /// question first when there is writing), otherwise the page goes.
    private func back() {
        if card != nil, let goBack = pane.goBack { goBack() } else { dismiss() }
    }
}

/// The grip's face: the web's railGrip — 28 × 34, a hair of the field's ink round uneven corners, the
/// page's paper, ⟷ in the muted ink; darker under the finger.
private struct EditorGripFace: View {
    let active: Bool

    var body: some View {
        let shape = UnevenRoundedRectangle(topLeadingRadius: 11, bottomLeadingRadius: 14, bottomTrailingRadius: 12,
                                           topTrailingRadius: 13)
        ZStack {
            shape.fill(Tokens.cream)
            shape.strokeBorder(active ? Tokens.fieldBorderHover : Tokens.fieldBorder, lineWidth: 1)
            OrganicIcon(.arrowsHorizontal, size: 16, color: active ? Tokens.text : Tokens.textMuted)
        }
        .frame(width: 28, height: 34)
        .animation(.easeOut(duration: 0.12), value: active)
    }
}

/// 「放開以收起編輯區」: the small tonal pill by the grip while a release would hide the pane.
private struct ReleasePill: View {
    var body: some View {
        Text(L10n.Write.releaseToClose)
            .font(AppFonts.body(13, weight: .medium))
            .foregroundStyle(Tokens.buttonOnTonal)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background { WobRectShape(radius: 14, seed: 83).fill(Tokens.buttonTonal) }
            .accessibilityHidden(true)
    }
}
