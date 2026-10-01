import Foundation
import Testing
import WebKit
@testable import Resonance

/// The editor island reaches nothing but its own page and fonts: anything
/// else in the bundle doesn't exist for it, its policy refuses whatever the
/// page didn't bring, and the web view never leaves the page — a web link
/// the writer taps opens in the in-app browser instead.
@MainActor @Suite struct EditorPageTests {
    let handler = EditorPageHandler()
    let page = EditorPage.url(placeholder: "Write")

    private func url(_ string: String) -> URL { URL(string: string)! }

    @Test func thePageAndItsFontsAreAllItCanLoad() throws {
        let served = try #require(handler.resource(for: page))
        let html = String(decoding: served.data, as: UTF8.self)
        let policy = try #require(served.headers["Content-Security-Policy"])
        #expect(html.contains(#"<meta http-equiv="Content-Security-Policy" content="\#(policy)">"#))
        #expect(html.contains("ResonanceEditor"))
        #expect(handler.resource(for: url("resonance-editor://editor/fonts/DMSans.ttf"))?.data.isEmpty == false)

        // Elsewhere in the bundle, beside the fonts, or past them: nothing.
        for other in ["resonance-editor://editor/Info.plist", "resonance-editor://editor/en.json",
                      "resonance-editor://editor/GoogleService-Info.plist", "resonance-editor://editor/fonts/ChenYuluoyanThin.ttf",
                      "resonance-editor://editor/fonts/../Info.plist", "resonance-editor://editor/fonts/fonts/DMSans.ttf",
                      "resonance-editor://other/editor.html", "file:///editor.html"] {
            #expect(handler.resource(for: url(other)) == nil, "\(other)")
        }
    }

    @Test func onlyThePagesOwnScriptsMayRun() throws {
        let html = try String(contentsOf: try #require(Bundle.main.url(forResource: "editor", withExtension: "html")), encoding: .utf8)
        let scripts = EditorPage.inlineScripts(in: html)
        #expect(scripts.count == 2)
        let policy = EditorPage.contentSecurityPolicy(for: html)
        #expect(policy.contains("default-src 'none'"))
        #expect(!policy.contains("unsafe-eval"))
        #expect(policy.components(separatedBy: "'sha256-").count == 3)
        #expect(!policy.contains("script-src 'unsafe-inline'"))
    }

    @Test func theWebViewStaysOnThePage() {
        #expect(EditorNavigation.decide(page, mainFrame: true, tapped: false) == .allow)
        // A web link the writer tapped: the in-app browser, not the editor's web view.
        let essay = url("https://example.com/essay")
        #expect(EditorNavigation.decide(essay, mainFrame: true, tapped: true) == .openInBrowser(essay))
        // The page sending itself away, a frame, other schemes, a card link resolved against the page: refused.
        #expect(EditorNavigation.decide(essay, mainFrame: true, tapped: false) == .cancel)
        #expect(EditorNavigation.decide(page, mainFrame: false, tapped: false) == .cancel)
        #expect(EditorNavigation.decide(url("file:///etc/hosts"), mainFrame: true, tapped: true) == .cancel)
        #expect(EditorNavigation.decide(url("javascript:alert(1)"), mainFrame: true, tapped: true) == .cancel)
        #expect(EditorNavigation.decide(url("mailto:a@b.c"), mainFrame: true, tapped: true) == .cancel)
        #expect(EditorNavigation.decide(url("resonance-editor://editor/card/a-walk"), mainFrame: true, tapped: true) == .cancel)
        #expect(EditorNavigation.decide(nil, mainFrame: true, tapped: true) == .cancel)
    }

    /// The real page in a real web view: what the policy refuses, it refuses;
    /// what the editor needs (its fonts, a photo, the bridge) still works.
    @Test func inTheWebViewThePolicyHolds() async throws {
        var opened: [URL] = []
        let editor = StoryEditorBridge(placeholder: "Write", openInBrowser: { opened.append($0) })
        let end = ContinuousClock.now.advanced(by: .seconds(15))
        while !editor.ready, ContinuousClock.now < end { try await Task.sleep(for: .milliseconds(50)) }
        try #require(editor.ready)

        let result = try await editor.webView.callAsyncJavaScript("""
            const violations = [];
            document.addEventListener('securitypolicyviolation', e => violations.push(e.effectiveDirective));
            const fetched = await fetch('https://example.com/').then(() => 'fetched', () => 'refused');
            const s = document.createElement('script');
            s.textContent = 'window.injected = true';
            document.body.append(s);
            const fonts = await document.fonts.load('16px "DM Sans"');
            const photo = await new Promise(done => {
                const img = new Image();
                img.onload = () => done(img.naturalWidth);
                img.onerror = () => done(-1);
                img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
            });
            const file = await new Promise(done => {
                const img = new Image();
                img.onload = () => done('loaded');
                img.onerror = () => done('refused');
                img.src = 'file:///System/Library/CoreServices/SystemVersion.plist';
            });
            await new Promise(done => setTimeout(done, 50));
            return { fetched, injected: window.injected === true, fonts: fonts.length, photo, file, violations: violations.join(',') };
            """, arguments: [:], in: nil, contentWorld: .page) as? [String: Any]

        #expect(result?["fetched"] as? String == "refused")
        #expect(result?["injected"] as? Bool == false)
        #expect((result?["fonts"] as? Int ?? 0) > 0)
        #expect(result?["photo"] as? Int == 1)
        #expect(result?["file"] as? String == "refused")
        let violations = result?["violations"] as? String ?? ""
        #expect(violations.contains("connect-src"))
        #expect(violations.contains("script-src"))

        // The page tries to leave: it stays, and nothing opens.
        _ = try await editor.webView.callAsyncJavaScript("location.href = 'https://example.com/'", arguments: [:], in: nil, contentWorld: .page)
        try await Task.sleep(for: .milliseconds(300))
        #expect(editor.webView.url.map(EditorPage.isPage) == true)
        #expect(opened.isEmpty)

        // The bridge the writing screen drives still works.
        editor.setMarkdown("Before.")
        editor.exec("insertCard", ["href": "/card/a-walk", "title": "A walk"])
        try await Task.sleep(for: .milliseconds(300))
        let markdown = try await editor.webView.callAsyncJavaScript("return ResonanceEditor.getMarkdown()", arguments: [:], in: nil, contentWorld: .page) as? String
        #expect(markdown?.contains("[A walk](/card/a-walk)") == true)
    }
}
