import DesignSystem
import SwiftUI
import UIKit

/// How the app opens, as Google Maps or YouTube do: the launch screen — the icon's waves on the
/// paper (Info.plist's `UILaunchScreen`) — is drawn again by the app's first frame, so the system
/// hands over without a seam. It stays while the session restores, at most ``hold``, and then gives
/// way to the first screen: the waves grow a little as they fade, and the paper dissolves into the
/// page under it. That page is the same paper, so it reads as one surface coming to life rather
/// than a cut. With Reduce Motion the waves don't grow; the cover only fades. The twin of
/// Android's Launch.kt.
enum Launch {
    /// The longest the cover waits for the first screen; past it, the screen's own loader shows.
    static let hold: Duration = .milliseconds(700)
    /// A beat for the first screen to settle (what it keeps from the last run drawn) before the dissolve.
    static let settle: Duration = .milliseconds(80)
    /// The cover dissolving into the first screen.
    static let exit: TimeInterval = 0.32
    /// The waves fade sooner than the paper, so they are gone by the time the page shows through.
    static let iconExit: TimeInterval = 0.2
    /// How far the waves grow as they go.
    static let iconGrowth: CGFloat = 1.12
}

extension View {
    /// Lays the launch cover over a cold launch's first screen until `ready` (or ``Launch/hold``),
    /// then plays the hand-off. `covering` is true until the cover is gone: while it is, a screen
    /// that changes under it (the loader giving way to the tabs) should change at once rather than
    /// crossfade, so what the cover dissolves into is the page itself, not a loader on its way out.
    func launchCover(ready: Bool, covering: Binding<Bool>) -> some View {
        modifier(LaunchCoverModifier(ready: ready, covering: covering))
    }
}

private struct LaunchCoverModifier: ViewModifier {
    let ready: Bool
    @Binding var covering: Bool
    @Environment(\.scenePhase) private var scenePhase
    /// The app is on screen. The system shows its own picture of the launch screen until it has
    /// brought the app in (the icon's zoom, or the crossfade with Reduce Motion), which may be well
    /// after the app's first frame: a hand-off begun before then would play unseen beneath it, and
    /// the system's picture would cut straight to the page.
    @State private var shown = false
    /// The hand-off is under way (the first screen settling, or the cover leaving).
    @State private var started = false
    @State private var leaving = false

    func body(content: Content) -> some View {
        content
            .overlay {
                if covering {
                    LaunchCover(leaving: leaving) { covering = false }
                        .ignoresSafeArea()
                        // A moment's picture, not a screen: touches and VoiceOver go to the page under it.
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            .onChange(of: scenePhase, initial: true) { _, phase in
                if phase == .active { shown = true }
            }
            .onChange(of: ready && shown, initial: true) { _, go in
                if go { Task { await uncover() } }
            }
            // The longest wait counts from when the cover is seen.
            .task(id: shown) {
                guard shown else { return }
                try? await Task.sleep(for: Launch.hold)
                await uncover()
            }
    }

    private func uncover() async {
        guard covering, !started else { return }
        started = true
        try? await Task.sleep(for: Launch.settle)
        // The cover goes once its dissolve is over (LaunchCover's `gone`), counted from when it
        // reaches the screen: a timer started here would run on through a stall of the main thread.
        leaving = true
    }
}

/// The launch screen as the app draws it: the paper, and `LaunchMark` — the very image the system
/// centred — at its own size in the middle of the whole screen, where the system put it. A UIKit
/// view, so the dissolve is Core Animation's: once begun it plays on even while the first screen
/// keeps the main thread busy (stepped by SwiftUI, those frames were lost and the cover cut away).
private struct LaunchCover: UIViewRepresentable {
    let leaving: Bool
    /// The dissolve is over.
    let gone: () -> Void

    func makeUIView(context: Context) -> LaunchCoverView { LaunchCoverView() }

    func updateUIView(_ view: LaunchCoverView, context: Context) {
        if leaving { view.leave(growing: !UIAccessibility.isReduceMotionEnabled, then: gone) }
    }
}

private final class LaunchCoverView: UIView {
    private let mark = UIImageView(image: UIImage(named: "LaunchMark"))
    private var left = false

    init() {
        super.init(frame: .zero)
        backgroundColor = UIColor(Tokens.cream)
        addSubview(mark)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        mark.bounds = CGRect(origin: .zero, size: mark.image?.size ?? .zero)
        mark.center = CGPoint(x: bounds.midX, y: bounds.midY)
    }

    func leave(growing: Bool, then gone: @escaping () -> Void) {
        guard !left else { return }
        left = true
        if growing {
            UIView.animate(withDuration: Launch.iconExit, delay: 0, options: [.curveEaseOut, .beginFromCurrentState]) {
                self.mark.transform = CGAffineTransform(scaleX: Launch.iconGrowth, y: Launch.iconGrowth)
                self.mark.alpha = 0
            }
        }
        UIView.animate(withDuration: Launch.exit, delay: 0, options: [.curveEaseOut, .beginFromCurrentState]) {
            self.alpha = 0
        } completion: { _ in gone() }
    }
}
