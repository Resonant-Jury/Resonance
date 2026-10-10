import SwiftUI
import UIKit

/// How far a window's own controls (iPadOS 26's ••• and the traffic lights of an app in a window)
/// reach into a bar's row: what the system's corner-adapted safe area adds to the plain one over the
/// row, as UIKit's own toolbars clear them. Nothing on a phone or a full-screen iPad, where no corner
/// holds controls, nor over a row the controls don't reach (one that starts past them, or lies below).
public nonisolated struct WindowControlsInset: Equatable, Sendable {
    public var leading: CGFloat
    public var trailing: CGFloat

    public init(leading: CGFloat = 0, trailing: CGFloat = 0) {
        self.leading = leading
        self.trailing = trailing
    }

    public static let zero = WindowControlsInset()

    /// What the corner adds: the adapted region's insets less the plain region's, never below 0, and
    /// rounded to the point (so a layout pass's fractions never move the row).
    public static func added(adapted: NSDirectionalEdgeInsets, plain: NSDirectionalEdgeInsets) -> WindowControlsInset {
        WindowControlsInset(leading: max(0, (adapted.leading - plain.leading).rounded(.up)),
                            trailing: max(0, (adapted.trailing - plain.trailing).rounded(.up)))
    }
}

extension View {
    /// Keeps `inset` at what the window's controls add over this view (``WindowControlsInset``). Put
    /// it on the bar's row outside any padding it sets from `inset`, so what it measures never moves.
    public func windowControlsInset(_ inset: Binding<WindowControlsInset>) -> some View {
        background { WindowControlsProbe(inset: inset) }
    }
}

/// A view laid behind the row that asks UIKit for its corner-adapted safe area on each layout.
private struct WindowControlsProbe: UIViewRepresentable {
    @Binding var inset: WindowControlsInset

    func makeUIView(context: Context) -> ProbeView {
        let view = ProbeView()
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ view: ProbeView, context: Context) {
        view.report = { found in if inset != found { inset = found } }
        view.measure()
    }

    final class ProbeView: UIView {
        var report: (WindowControlsInset) -> Void = { _ in }
        private var last = WindowControlsInset.zero

        override func layoutSubviews() {
            super.layoutSubviews()
            measure()
        }

        override func safeAreaInsetsDidChange() {
            super.safeAreaInsetsDidChange()
            measure()
        }

        override func layoutMarginsDidChange() {
            super.layoutMarginsDidChange()
            measure()
        }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            measure()
        }

        func measure() {
            guard #available(iOS 26.0, *), window != nil else { return }
            // The safe area, not the margins: a bar's content starts at the row's own edge (its pad is
            // outside the row), and the corner-adapted safe area is where that edge must be to clear the
            // controls with the system's room after them.
            let found = WindowControlsInset.added(
                adapted: directionalEdgeInsets(for: .safeArea(cornerAdaptation: .horizontal)),
                plain: directionalEdgeInsets(for: .safeArea()))
            guard found != last else { return }
            last = found
            // Not during the layout pass that measured it.
            let report = report
            DispatchQueue.main.async { report(found) }
        }
    }
}
