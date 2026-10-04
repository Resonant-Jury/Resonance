import SwiftUI
import UIKit

/// A pull to refresh as the Resonance loader draws it: as the list is pulled
/// past its top, the loader's loop is traced in the gap that opens, as far as
/// the pull has come; the refresh starts as the loop closes (a light tick),
/// the dashes travel once the finger lets go, and they keep travelling, fading,
/// while the list eases back up. What it shows comes from a few facts, kept
/// apart from the view so they can be checked.
public struct RefreshPull: Equatable {
    /// How far the top of the list stands below its resting place (negative
    /// once it is scrolled into).
    public var gap: CGFloat
    /// The finger has taken the list and it hasn't come back to rest since:
    /// only a pull is traced, never a gap that a layout opens on its own.
    public var pulling: Bool
    /// The refresh is running.
    public var refreshing: Bool
    /// The finger is still on the list.
    public var holding: Bool
    /// A refresh has finished since the list was last at rest or held.
    public var ending: Bool

    public init(gap: CGFloat, pulling: Bool = false, refreshing: Bool = false, holding: Bool = false, ending: Bool = false) {
        self.gap = gap
        self.pulling = pulling
        self.refreshing = refreshing
        self.holding = holding
        self.ending = ending
    }

    /// The loader's size, in the gap it opens.
    public static let size: CGFloat = 36
    /// The room the system's refresh keeps open while it runs.
    public static let dock: CGFloat = 60
    /// How far the list is pulled before the loop shows at all, and when it is
    /// closed: just before the system starts the refresh (about 170 down).
    static let lead: CGFloat = 8
    public static let reach: CGFloat = 160

    public enum Look: Equatable {
        /// Nothing: the list is at rest, or scrolled into.
        case none
        /// The pen at rest, the loop traced this far (0…1).
        case tracing(Double)
        /// The dashes going round.
        case travelling
    }

    public var look: Look {
        // Started under the finger, the loop stays closed until it lets go.
        if refreshing { return holding ? .tracing(1) : .travelling }
        guard gap > 0.5, pulling || ending else { return .none }
        return ending && !holding ? .travelling : .tracing(progress)
    }

    /// How much of the loop the pull has traced.
    public var progress: Double {
        Double(min(max((gap - Self.lead) / (Self.reach - Self.lead), 0), 1))
    }

    /// Fading in with the first part of the loop; out with the gap as the list eases back up.
    public var opacity: Double {
        switch look {
        case .none: 0
        case let .tracing(traced): min(traced / 0.35, 1)
        case .travelling: refreshing ? 1 : Double(min(max(gap / Self.dock, 0), 1))
        }
    }

    /// Growing a little as it is traced, from four fifths of its size.
    public var scale: CGFloat {
        guard case let .tracing(traced) = look else { return 1 }
        return 0.8 + 0.2 * CGFloat(min(traced / 0.6, 1))
    }

    /// The loader's centre, down from the top of the gap: in the middle of the
    /// gap while it is no taller than the room a refresh keeps, then riding
    /// just above the list.
    public var center: CGFloat {
        let open = max(gap, 0)
        return open - min(open, Self.dock) / 2
    }
}

extension View {
    /// `.refreshable(action)` on a scroll view, drawn with the Resonance loader
    /// (`RefreshPull`) instead of the system's spinner. The system's refresh
    /// still runs it — the pull that starts it, the room it keeps open while it
    /// runs, VoiceOver's way to it — with its own drawing faded out. Nothing
    /// without an action.
    @ViewBuilder public func sketchRefreshable(_ action: RefreshAction?) -> some View {
        if let action { modifier(SketchRefresh(action: action)) } else { self }
    }
}

private struct SketchRefresh: ViewModifier {
    let action: RefreshAction
    /// The scroll view's content offset, and its top safe area: where the list rests.
    @State private var offset: CGFloat = 0
    @State private var top: CGFloat = 0
    @State private var pulling = false
    @State private var holding = false
    @State private var refreshing = false
    @State private var ending = false
    /// Each pull begun: the system's spinner is faded out again before it can show.
    @State private var pulls = 0
    /// A refresh answered at once still shows the pen at work, briefly.
    private let shortest: Duration = .milliseconds(500)

    func body(content: Content) -> some View {
        let pull = RefreshPull(gap: -(offset + top), pulling: pulling, refreshing: refreshing, holding: holding, ending: ending)
        content
            .refreshable {
                refreshing = true
                // In a task of its own: SwiftUI cancels the refresh it started as soon as the screen
                // redraws (the feed puts up its skeleton), and a feed cancelled halfway through its
                // load is left waiting for a screen that never comes back.
                let shortest = shortest
                await Task {
                    let started = ContinuousClock.now
                    await action()
                    try? await Task.sleep(until: started + shortest)
                }.value
                refreshing = false
                ending = true
                settle()
            }
            .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top } action: { top = $0 }
            .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, y in
                offset = y
                settle()
            }
            .onScrollPhaseChange { _, phase in
                holding = phase == .interacting
                if holding {
                    pulling = true
                    ending = false
                    pulls += 1
                }
                settle()
            }
            .overlay(alignment: .top) { PullLoader(pull: pull) }
            .background(SystemSpinnerFade(pulls: pulls))
            .sensoryFeedback(.impact(weight: .light), trigger: refreshing) { was, now in !was && now }
    }

    /// Let go of and back at rest (or scrolled into): the pull, and a finished refresh, are over.
    private func settle() {
        guard !holding, -(offset + top) <= 0.5 else { return }
        pulling = false
        ending = false
    }
}

/// The loader in the gap a pull opens, clipped to it.
private struct PullLoader: View {
    let pull: RefreshPull
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack(alignment: .top) {
            switch pull.look {
            case .none: EmptyView()
            case let .tracing(traced): SketchLoader(size: RefreshPull.size, progress: traced)
            case .travelling: SketchLoader(size: RefreshPull.size).transition(.opacity)
            }
        }
        .scaleEffect(reduceMotion ? 1 : pull.scale)
        .opacity(pull.opacity)
        .offset(y: pull.center - RefreshPull.size / 2)
        .animation(.easeOut(duration: 0.2), value: pull.look == .travelling)
        .frame(maxWidth: .infinity, maxHeight: max(pull.gap, 0), alignment: .top)
        .clipped()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Fades out the system refresh control's own drawing — its spinner and the
/// ticks a pull draws — in the scroll view beside it, keeping the control
/// itself (what starts the refresh and keeps the room open; hiding the
/// control, or clearing its tint, stops it starting). Done as the view
/// arrives and again as each pull begins, should SwiftUI have made a new
/// control since. Were UIKit ever to draw it otherwise, the system's spinner
/// would simply show again beside the loader.
private struct SystemSpinnerFade: UIViewRepresentable {
    let pulls: Int

    func makeUIView(context: Context) -> Finder { Finder() }
    func updateUIView(_ finder: Finder, context: Context) { finder.fade() }

    final class Finder: UIView {
        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
            isAccessibilityElement = false
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            // The control is added once the scroll view is in place: a moment later.
            DispatchQueue.main.async { [weak self] in self?.fade() }
        }

        /// The nearest refresh controls up the hierarchy: the scroll view this background belongs to.
        func fade() {
            var level = superview
            while let ancestor = level {
                let controls = Self.refreshControls(in: ancestor)
                if !controls.isEmpty {
                    for control in controls { control.subviews.forEach { $0.alpha = 0 } }
                    return
                }
                level = ancestor.superview
            }
        }

        private static func refreshControls(in view: UIView) -> [UIRefreshControl] {
            var found: [UIRefreshControl] = []
            var queue = [view]
            while !queue.isEmpty {
                let next = queue.removeFirst()
                if let control = (next as? UIScrollView)?.refreshControl { found.append(control) }
                queue.append(contentsOf: next.subviews)
            }
            return found
        }
    }
}
