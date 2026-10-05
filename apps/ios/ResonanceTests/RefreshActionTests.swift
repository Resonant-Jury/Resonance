import DesignSystem
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// The feed and the card box (a `TabScreen` with a `.refreshable`) offer their pull to refresh as
/// a "Refresh" accessibility action on every row — VoiceOver's actions on whatever has its focus —
/// since the system's refresh control offers none. At the top it refreshes as a pull does: the
/// system's control running, the list drawn down to the room it keeps, back once it is done.
/// Further down the list stays where it is. Never two refreshes at once.
///
/// Read through the accessibility tree VoiceOver reads, which UIKit and SwiftUI build only once
/// accessibility is on: the tests turn it on as XCUITest does (`AccessibilityOn`).
@MainActor @Suite(.serialized) struct RefreshActionTests {
    /// The screen's refresh: how many have started, held open until the test lets them finish.
    @MainActor final class Probe {
        var runs = 0
        let gate = Gate<Bool>()
        func began() { runs += 1 }
    }

    struct Screen: View {
        let probe: Probe
        var body: some View {
            TabScreen("Feed") {
                ForEach(0..<30, id: \.self) { i in Text(verbatim: "Row \(i)").frame(maxWidth: .infinity, minHeight: 80) }
            }
            .refreshable { [probe] in
                probe.began()
                _ = await probe.gate.wait()
            }
        }
    }

    /// A window showing `view` (the test hides it when it ends), its list and the list's refresh control.
    private func show(_ view: some View) throws -> (UIWindow, UIScrollView, UIRefreshControl) {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.rootViewController = UIHostingController(rootView: view)
        window.makeKeyAndVisible()
        window.layoutIfNeeded()
        let scrollView = try #require(Self.scrollViews(in: window).first { $0.refreshControl != nil })
        return (window, scrollView, try #require(scrollView.refreshControl))
    }

    private static func scrollViews(in view: UIView) -> [UIScrollView] {
        ((view as? UIScrollView).map { [$0] } ?? []) + view.subviews.flatMap { scrollViews(in: $0) }
    }

    @Test func everyRowOffersRefreshAndAtTheTopItRefreshesAsAPullDoes() async throws {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let probe = Probe()
        let (window, scrollView, control) = try show(Screen(probe: probe))
        defer { window.isHidden = true }
        let rest = scrollView.contentOffset.y

        // Whatever VoiceOver is on, the action is among its actions, under the app's own word.
        var actions: [UIAccessibilityCustomAction] = []
        #expect(await eventually { actions = AccessibilityOn.actions(L10n.Native.refresh, in: window); return actions.count >= 5 })
        #expect(AccessibilityOn.elements(in: window).filter { ($0.accessibilityLabel ?? "").hasPrefix("Row ") }
            .allSatisfy { ($0.accessibilityCustomActions ?? []).contains { $0.name == L10n.Native.refresh } })
        let refresh = try #require(actions.first)

        #expect(AccessibilityOn.perform(refresh))
        #expect(await eventually { probe.runs == 1 })
        // The system's refresh is running and the list has come down to the room it keeps, as after a pull.
        #expect(control.isRefreshing)
        #expect(await eventually { scrollView.contentOffset.y < rest - 30 })
        // Asked again meanwhile: the refresh running is the answer.
        #expect(AccessibilityOn.perform(refresh))
        try await Task.sleep(for: .milliseconds(100))
        #expect(probe.runs == 1)

        await probe.gate.open(true)
        #expect(await eventually { !control.isRefreshing && abs(scrollView.contentOffset.y - rest) < 1 })
        // Once it is done, the next one runs.
        #expect(AccessibilityOn.perform(refresh))
        #expect(await eventually { probe.runs == 2 })
        #expect(await eventually { !control.isRefreshing && abs(scrollView.contentOffset.y - rest) < 1 })
    }

    @Test func furtherDownItRefreshesInPlaceAndAPullMeanwhileWaitsForIt() async throws {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let probe = Probe()
        let (window, scrollView, control) = try show(Screen(probe: probe))
        defer { window.isHidden = true }

        var actions: [UIAccessibilityCustomAction] = []
        #expect(await eventually { actions = AccessibilityOn.actions(L10n.Native.refresh, in: window); return !actions.isEmpty })
        let refresh = try #require(actions.first)
        scrollView.setContentOffset(CGPoint(x: 0, y: 900), animated: false)
        try await Task.sleep(for: .milliseconds(200))

        #expect(AccessibilityOn.perform(refresh))
        #expect(await eventually { probe.runs == 1 })
        // No control started, no gap: the reader's place stays.
        #expect(!control.isRefreshing)
        #expect(scrollView.contentOffset.y == 900)
        #expect(AccessibilityOn.perform(refresh))
        // A pull meanwhile (the system starting its refresh) waits for the refresh already running.
        control.beginRefreshing()
        control.sendActions(for: .valueChanged)
        try await Task.sleep(for: .milliseconds(200))
        #expect(probe.runs == 1)

        await probe.gate.open(true)
        #expect(await eventually { !control.isRefreshing })
        #expect(probe.runs == 1)
    }

    @Test func furtherDownTheScreensRefreshInPlaceRunsAndAtTheTopThePulls() async throws {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let probe = Probe(), inPlace = Probe()
        let (window, scrollView, control) = try show(Screen(probe: probe).sketchRefreshInPlace { [inPlace] in
            inPlace.began()
            _ = await inPlace.gate.wait()
        })
        defer { window.isHidden = true }
        let rest = scrollView.contentOffset.y

        var actions: [UIAccessibilityCustomAction] = []
        #expect(await eventually { actions = AccessibilityOn.actions(L10n.Native.refresh, in: window); return !actions.isEmpty })
        let refresh = try #require(actions.first)
        scrollView.setContentOffset(CGPoint(x: 0, y: 900), animated: false)
        try await Task.sleep(for: .milliseconds(200))

        // Away from the top: the refresh that keeps the reader's place, not the pull's.
        #expect(AccessibilityOn.perform(refresh))
        #expect(await eventually { inPlace.runs == 1 })
        #expect(probe.runs == 0)
        #expect(!control.isRefreshing)
        #expect(scrollView.contentOffset.y == 900)
        // Still one at a time: a pull meanwhile waits for it.
        control.beginRefreshing()
        control.sendActions(for: .valueChanged)
        try await Task.sleep(for: .milliseconds(200))
        #expect(probe.runs == 0 && inPlace.runs == 1)
        await inPlace.gate.open(true)
        #expect(await eventually { !control.isRefreshing })

        // At the top it refreshes as a pull does.
        scrollView.setContentOffset(CGPoint(x: 0, y: rest), animated: false)
        try await Task.sleep(for: .milliseconds(200))
        #expect(AccessibilityOn.perform(refresh))
        #expect(await eventually { probe.runs == 1 })
        #expect(inPlace.runs == 1)
        await probe.gate.open(true)
        #expect(await eventually { !control.isRefreshing })
    }

    @Test func theSystemsRefreshableAloneOffersVoiceOverNoAction() async throws {
        // Why the list adds its own: a plain `.refreshable` list's rows carry no action, and its control is no element.
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let view = ScrollView { VStack { ForEach(0..<5, id: \.self) { Text(verbatim: "Row \($0)").frame(height: 80) } } }.refreshable {}
        let (window, _, control) = try show(view)
        defer { window.isHidden = true }
        #expect(await eventually { AccessibilityOn.elements(in: window).contains { $0.accessibilityLabel == "Row 0" } })
        #expect(AccessibilityOn.elements(in: window).allSatisfy { ($0.accessibilityCustomActions ?? []).isEmpty })
        #expect(!control.isAccessibilityElement)
    }
}

/// Accessibility turned on for the test process, as XCUITest (and AccessibilitySnapshot) do, so
/// UIKit and SwiftUI build the element tree VoiceOver reads; `restore` puts the setting back.
@MainActor struct AccessibilityOn {
    private typealias Get = @convention(c) () -> Int32
    private typealias Set = @convention(c) (Int32) -> Void
    private let set: Set?
    private let was: Int32

    init() {
        let root = ProcessInfo.processInfo.environment["IPHONE_SIMULATOR_ROOT"] ?? ""
        let library = dlopen(root + "/usr/lib/libAccessibility.dylib", RTLD_NOW)
        let get = dlsym(library, "_AXSAutomationEnabled").map { unsafeBitCast($0, to: Get.self) }
        set = dlsym(library, "_AXSSetAutomationEnabled").map { unsafeBitCast($0, to: Set.self) }
        was = get?() ?? 0
        set?(1)
    }

    func restore() { set?(was) }

    /// Every accessibility element under `root`, as VoiceOver walks them.
    static func elements(in root: NSObject) -> [NSObject] {
        var found: [NSObject] = []
        func visit(_ node: NSObject, depth: Int) {
            guard depth < 60 else { return }
            if node.isAccessibilityElement { found.append(node) }
            var children: [NSObject] = (node.accessibilityElements as? [NSObject]) ?? []
            if children.isEmpty {
                let count = node.accessibilityElementCount()
                if count != NSNotFound, count > 0 { children = (0..<count).compactMap { node.accessibilityElement(at: $0) as? NSObject } }
            }
            if children.isEmpty, let view = node as? UIView { children = view.subviews }
            children.forEach { visit($0, depth: depth + 1) }
        }
        visit(root, depth: 0)
        return found
    }

    /// The custom actions named `name` on the elements under `root`.
    static func actions(_ name: String, in root: NSObject) -> [UIAccessibilityCustomAction] {
        elements(in: root).flatMap { $0.accessibilityCustomActions ?? [] }.filter { $0.name == name }
    }

    /// What VoiceOver does when the action is chosen.
    static func perform(_ action: UIAccessibilityCustomAction) -> Bool {
        if let handler = action.actionHandler { return handler(action) }
        guard let target = action.target as? NSObject else { return false }
        _ = target.perform(action.selector, with: action)
        return true
    }
}
