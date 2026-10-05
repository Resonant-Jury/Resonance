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
    /// runs, VoiceOver's three-finger scroll at the top — with its own drawing
    /// faded out. Its content offers the same refresh as an accessibility
    /// action with `sketchRefreshAction(named:)`. Nothing without an action.
    @ViewBuilder public func sketchRefreshable(_ action: RefreshAction?) -> some View {
        if let action { modifier(SketchRefresh(action: action)) } else { self }
    }

    /// The pull for whoever can't pull (VoiceOver, Switch Control, Voice Control): an accessibility
    /// action named `label` on everything in the content of a scroll view that has
    /// `sketchRefreshable`, so VoiceOver offers it among the actions of whichever row has its focus.
    /// (The system's `.refreshable` offers none: its control is no accessibility element.) At the
    /// list's top it refreshes as a pull let go past the threshold does — the list drawn down and
    /// the loader docked while it runs; further down the list stays where it is (a docked loader
    /// would sit over the stories in view, and the reader's place would move). Asked for while a
    /// refresh runs, that refresh is the answer. Nothing outside such a scroll view.
    public func sketchRefreshAction(named label: String) -> some View {
        modifier(SketchRefreshActionModifier(label: label))
    }
}

extension EnvironmentValues {
    /// The refresh of the scroll view this content is in (`sketchRefreshable`), for `sketchRefreshAction`.
    @Entry var sketchRefreshRun: SketchRefreshRun? = nil
}

/// A list's refresh, pulled or asked for, one at a time: a pull while an asked-for refresh runs (or
/// the action while a pulled one does) is answered by the refresh already running, never a second.
@MainActor final class SketchRefreshRun {
    /// The screen's refresh, as its `.refreshable` gave it last.
    var action: RefreshAction?
    /// The list rests at its top (or is pulled past it), where an asked-for refresh shows as a pull's does.
    var atTop = true
    /// The system's refresh control beside the list, which an asked-for refresh at the top starts as a pull would.
    weak var system: SystemSpinnerFade.Finder?
    private var running: Task<Void, Never>?
    /// Which refresh `running` is, so the one that ends clears only itself.
    private var started = 0

    /// The refresh running, or a new one: what a pull runs, and awaits.
    func run() async {
        await start()?.value
    }

    /// The accessibility action: at the top, the system's refresh started as a pull let go past the
    /// threshold starts it (the list drawn down, the loader docked, the screen's `.refreshable` run
    /// through `run`); further down — or with no control to start — the same refresh, in place.
    func ask() {
        guard running == nil, system?.isRefreshing != true else { return }
        if atTop, system?.pull() == true { return }
        start()
    }

    @discardableResult private func start() -> Task<Void, Never>? {
        if let running { return running }
        guard let action else { return nil }
        started += 1
        let mine = started
        // Not the caller's task: SwiftUI cancels the refresh it started as soon as the screen redraws.
        let task = Task { [weak self] in
            await action()
            if self?.started == mine { self?.running = nil }
        }
        running = task
        return task
    }
}

/// `sketchRefreshAction(named:)`: the action, wherever a `sketchRefreshable` scroll view is around.
private struct SketchRefreshActionModifier: ViewModifier {
    let label: String
    @Environment(\.sketchRefreshRun) private var run

    func body(content: Content) -> some View {
        content.accessibilityActions {
            if let run { Button(label) { run.ask() } }
        }
    }
}

private struct SketchRefresh: ViewModifier {
    let action: RefreshAction
    /// The refresh itself, shared with the content's accessibility action (`sketchRefreshAction`).
    @State private var run = SketchRefreshRun()
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
        let _ = run.action = action
        content
            .refreshable {
                refreshing = true
                // In a task of its own: SwiftUI cancels the refresh it started as soon as the screen
                // redraws (the feed puts up its skeleton), and a feed cancelled halfway through its
                // load is left waiting for a screen that never comes back. (`run` keeps it one: a pull
                // while the accessibility action's refresh runs waits for that one.)
                let shortest = shortest, run = run
                await Task {
                    let started = ContinuousClock.now
                    await run.run()
                    try? await Task.sleep(until: started + shortest)
                }.value
                refreshing = false
                ending = true
                settle()
            }
            .environment(\.sketchRefreshRun, run)
            .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top } action: {
                top = $0
                run.atTop = -(offset + top) > -1
            }
            .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, y in
                offset = y
                run.atTop = -(offset + top) > -1
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
            .background(SystemSpinnerFade(pulls: pulls, run: run))
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
/// would simply show again beside the loader. It is also how the accessibility
/// action reaches the control (`Finder.pull`).
struct SystemSpinnerFade: UIViewRepresentable {
    let pulls: Int
    let run: SketchRefreshRun

    func makeUIView(context: Context) -> Finder { Finder() }
    func updateUIView(_ finder: Finder, context: Context) {
        run.system = finder
        finder.fade()
    }

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
            for (_, control) in nearest() { control.subviews.forEach { $0.alpha = 0 } }
        }

        /// The system's refresh is running (pulled, or started by `pull`).
        var isRefreshing: Bool { nearest().contains { $0.control.isRefreshing } }

        /// Starts the system's refresh as a pull let go past its threshold does: the control
        /// refreshing, the list eased down to the room it keeps open, and the scroll view's
        /// `.refreshable` run (SwiftUI's own handler, which ends the control once it returns).
        /// False when there is no control to start.
        func pull() -> Bool {
            guard let (scrollView, control) = nearest().first else { return false }
            if control.isRefreshing { return true }
            fade()
            control.beginRefreshing()
            // The room the control keeps open is in the inset now: the list goes down to meet it.
            scrollView.setContentOffset(CGPoint(x: scrollView.contentOffset.x, y: -scrollView.adjustedContentInset.top), animated: true)
            control.sendActions(for: .valueChanged)
            return true
        }

        private func nearest() -> [(scrollView: UIScrollView, control: UIRefreshControl)] {
            var level = superview
            while let ancestor = level {
                let controls = Self.refreshControls(in: ancestor)
                if !controls.isEmpty { return controls }
                level = ancestor.superview
            }
            return []
        }

        private static func refreshControls(in view: UIView) -> [(scrollView: UIScrollView, control: UIRefreshControl)] {
            var found: [(scrollView: UIScrollView, control: UIRefreshControl)] = []
            var queue = [view]
            while !queue.isEmpty {
                let next = queue.removeFirst()
                if let scrollView = next as? UIScrollView, let control = scrollView.refreshControl { found.append((scrollView, control)) }
                queue.append(contentsOf: next.subviews)
            }
            return found
        }
    }
}
