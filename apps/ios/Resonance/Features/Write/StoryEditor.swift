import DesignSystem
import ResonanceKit
import SwiftUI
import WebKit

/// The story editor island (native/editor, the web's Tiptap schema) in a
/// WKWebView, embedded: the page is transparent and never scrolls; it
/// reports its height, its Markdown and which toolbar buttons are on, and
/// takes toolbar commands (ResonanceEditor.exec).
@MainActor @Observable
final class StoryEditorBridge: NSObject, WKScriptMessageHandler {
    struct Active: Equatable {
        var bold = false, italic = false, h2 = false, h3 = false
        var bulletList = false, orderedList = false, blockquote = false
    }

    private(set) var ready = false
    private(set) var height: CGFloat = 200
    private(set) var active = Active()
    private(set) var canUndo = false
    private(set) var focused = false
    /// The story as the editor serializes it (the web's Markdown).
    var onChange: (String) -> Void = { _ in }

    @ObservationIgnored let webView: WKWebView
    @ObservationIgnored private var pendingMarkdown: String?

    init(placeholder: String) {
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        config.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        // The content controller keeps its handlers alive, and the web view
        // (which this bridge holds) keeps the controller: registered directly,
        // the bridge and its web view would never be freed. The go-between
        // holds the bridge weakly, so closing the writer lets both go.
        controller.add(WeakScriptMessageHandler(self), name: "editor")
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        // The writing screen scrolls; the island only grows.
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        #if DEBUG
        webView.isInspectable = true
        #endif
        if let url = Bundle.main.url(forResource: "editor", withExtension: "html"),
           var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            components.queryItems = [
                URLQueryItem(name: "embed", value: "1"),
                URLQueryItem(name: "fonts", value: "fonts/"),
                URLQueryItem(name: "placeholder", value: placeholder),
            ]
            webView.loadFileURL(components.url!, allowingReadAccessTo: Bundle.main.bundleURL)
        }
    }

    /// Loads a saved story (kept out of undo history by the island).
    func setMarkdown(_ markdown: String) {
        guard ready else {
            pendingMarkdown = markdown
            return
        }
        Task { _ = try? await webView.callAsyncJavaScript("return ResonanceEditor.setMarkdown(md)", arguments: ["md": markdown], contentWorld: .page) }
    }

    /// A toolbar command; `args` for insertCard (href, title) and insertImage (src, alt).
    func exec(_ command: String, _ args: [String: String] = [:]) {
        Task { _ = try? await webView.callAsyncJavaScript("return ResonanceEditor.exec(c, a)", arguments: ["c": command, "a": args], contentWorld: .page) }
    }

    func focus() {
        Task { _ = try? await webView.callAsyncJavaScript("ResonanceEditor.focus()", arguments: [:], contentWorld: .page) }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            ready = true
            if let pendingMarkdown { setMarkdown(pendingMarkdown) }
            pendingMarkdown = nil
        case "change":
            onChange(body["markdown"] as? String ?? "")
        case "height":
            if let px = body["px"] as? Double { height = max(200, CGFloat(px)) }
        case "state":
            let a = body["active"] as? [String: Bool] ?? [:]
            active = Active(bold: a["bold"] ?? false, italic: a["italic"] ?? false, h2: a["h2"] ?? false, h3: a["h3"] ?? false,
                            bulletList: a["bulletList"] ?? false, orderedList: a["orderedList"] ?? false, blockquote: a["blockquote"] ?? false)
            canUndo = body["canUndo"] as? Bool ?? false
        case "focus":
            focused = body["focused"] as? Bool ?? false
        default:
            break
        }
    }
}

/// Passes the island's messages to a handler it doesn't keep alive.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

private struct IslandView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

/// MarkdownEditor on a phone: the field's hand-drawn frame (seed 17), the
/// text toolbar on top (the web's words, not icons — Bold, Italic | H2, H3 |
/// List, Numbered, Quote | Insert card, Insert image) over its wavy bottom
/// line, then the story.
struct StoryEditorField: View {
    let bridge: StoryEditorBridge
    var onInsertCard: () -> Void
    var onInsertImage: () -> Void
    var uploadingImage = false
    /// MarkdownEditor's `seed`; the buttons, rules and wave offset from it.
    private let seed = 17.0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FlowRow(spacing: 2) {
                tool(L10n.Write.Editor.bold, on: bridge.active.bold, seed: 21) { bridge.exec("bold") }
                tool(L10n.Write.Editor.italic, on: bridge.active.italic, seed: 28) { bridge.exec("italic") }
                rule(3)
                tool("H2", on: bridge.active.h2, seed: 35) { bridge.exec("h2") }
                tool("H3", on: bridge.active.h3, seed: 42) { bridge.exec("h3") }
                rule(9)
                tool(L10n.Write.Editor.bulletList, on: bridge.active.bulletList, seed: 49) { bridge.exec("bulletList") }
                tool(L10n.Write.Editor.orderedList, on: bridge.active.orderedList, seed: 56) { bridge.exec("orderedList") }
                tool(L10n.Write.Editor.quote, on: bridge.active.blockquote, seed: 63) { bridge.exec("blockquote") }
                rule(15)
                tool(L10n.Write.Editor.insertCard, icon: .cards, seed: 70, action: onInsertCard)
                tool(L10n.Write.Editor.insertImage, icon: .image, busy: uploadingImage, seed: 77, action: onInsertImage)
                    .disabled(uploadingImage)
            }
            .padding(.bottom, 4)
            // toolbarWrap: 10 above and beside, 12 below for the wave.
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .padding(.bottom, 12)
            .background { ToolbarWave(seed: seed + 5) }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(L10n.Write.Editor.toolbarLabel)
            IslandView(webView: bridge.webView)
                .frame(height: bridge.height)
                .accessibilityLabel(L10n.Write.storyLabel)
        }
        .background {
            let shape = WobRectShape(radius: Double(Tokens.radiusMd), seed: seed)
            ZStack {
                RoundedRectangle(cornerRadius: Tokens.radiusMd).fill(Tokens.cream)
                shape.stroke(bridge.focused ? Tokens.terracotta : Tokens.fieldBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
            }
        }
    }

    /// The toolbar's vertical Divider (amplitude 1.2, 4 either side), as tall as a button.
    private func rule(_ offset: Double) -> some View {
        OrganicVerticalRule(seed: seed + offset, amp: 1.2)
            .frame(height: 27)
            .padding(.horizontal, 4)
    }

    /// ToolButton: 13pt semibold on nothing, or on its wobbly terracotta wash when on.
    private func tool(_ label: String, on: Bool = false, icon: IconName? = nil, busy: Bool = false, seed: Double,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if busy {
                    SketchLoader(size: 15)
                } else if let icon {
                    OrganicIcon(icon, size: 15, color: on ? Tokens.terracotta : Tokens.text)
                }
                Text(label).font(AppFonts.body(13, weight: .semibold))
            }
            .foregroundStyle(on ? Tokens.terracotta : Tokens.text)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background { if on { ToolWashShape(seed: self.seed + seed).fill(Tokens.terracottaLight.opacity(0.7)) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(ToolButtonStyle())
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// A disabled tool fades (the web's 0.6).
private struct ToolButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(enabled ? 1 : 0.6)
    }
}

/// ToolButton's wash: a soft two-turn pill (R 0.4h, mag 1.4, bow 1.5).
private nonisolated struct ToolWashShape: Shape {
    let seed: Double
    func path(in rect: CGRect) -> Path {
        let h = Double(rect.height)
        return WobRectShape(radius: h * 0.4, seed: seed, mag: 1.4, options: WobRectOptions(
            curve: 1.5, cornerJitter: 2.6, cornerOffset: h * 0.05, segmentsH: .count(2), segmentsV: .count(1)
        )).path(in: rect)
    }
}

/// The toolbar's pen line: AppHeader's construction — ten turns across an
/// 800×54 box stretched over the toolbar, low in it, edge to edge.
private struct ToolbarWave: View {
    let seed: Double

    var body: some View {
        Canvas { ctx, size in
            let line = pointsToBezier(wavyPoints(800, y0: 42 + 12 * 0.35, amp: 2, seed: seed, steps: 10)).path()
            let fitted = line.applying(CGAffineTransform(scaleX: size.width / 800, y: size.height / 54))
            ctx.stroke(fitted, with: .color(Tokens.fieldBorderHover.opacity(0.45)), style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}
