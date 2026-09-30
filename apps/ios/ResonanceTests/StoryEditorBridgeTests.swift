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
