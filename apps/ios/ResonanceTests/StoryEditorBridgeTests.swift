import Testing
import WebKit
@testable import Resonance

/// Closing the writer frees its editor: the bridge and its web view (with the
/// 600 KB island and its web content process) don't outlive the screen.
@MainActor @Suite struct StoryEditorBridgeTests {
    final class Weak<T: AnyObject> {
        weak var value: T?
    }

    @Test func aClosedEditorLetsGoOfItsWebView() async throws {
        let bridge = Weak<StoryEditorBridge>(), webView = Weak<WKWebView>()
        try await openEditor(bridge, webView)
        // Its only owner (the writer's model) is gone; WebKit may let go over the next turns of the run loop.
        let end = ContinuousClock.now.advanced(by: .seconds(3))
        while bridge.value != nil || webView.value != nil, ContinuousClock.now < end {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(bridge.value == nil)
        #expect(webView.value == nil)
    }

    /// The story is one field: the web form bar (‹ › Done) WebKit puts over the keyboard is left
    /// out — the view that takes the keyboard answers no accessory view.
    @Test func theEditorHasNoFormBarOverTheKeyboard() {
        let editor = StoryEditorBridge(placeholder: "Write")
        let content = editor.webView.scrollView.subviews.first { String(describing: type(of: $0)).hasPrefix("WKContent") }
        #expect(content != nil)
        #expect(content.map { NSStringFromClass(type(of: $0)).hasSuffix("_ResonanceNoAccessory") } == true)
        #expect(content?.inputAccessoryView == nil)
        // Asked again (the page's "ready"), nothing changes.
        editor.webView.hideFormAccessoryBar()
        #expect(content.map { NSStringFromClass(type(of: $0)).hasSuffix("_ResonanceNoAccessory") } == true)
    }

    /// An editor as the writer holds one, loaded and talking — the island has
    /// said "ready" through the script message handler — then let go.
    private func openEditor(_ bridge: Weak<StoryEditorBridge>, _ webView: Weak<WKWebView>) async throws {
        let editor = StoryEditorBridge(placeholder: "Write")
        bridge.value = editor
        webView.value = editor.webView
        let end = ContinuousClock.now.advanced(by: .seconds(15))
        while !editor.ready, ContinuousClock.now < end { try await Task.sleep(for: .milliseconds(50)) }
        #expect(editor.ready)
    }
}
