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
        controller.add(self, name: "editor")
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

private struct IslandView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

/// MarkdownEditor on a phone: the field's hand-drawn frame, the text toolbar
/// on top (the web's words, not icons — Bold, Italic | H2, H3 | List,
/// Numbered, Quote | Insert card, Insert image), a wavy rule, then the story.
struct StoryEditorField: View {
    let bridge: StoryEditorBridge
    var onInsertCard: () -> Void
    var onInsertImage: () -> Void
    var uploadingImage = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FlowRow(spacing: 2) {
                tool(L10n.Write.Editor.bold, on: bridge.active.bold, weight: .bold) { bridge.exec("bold") }
                tool(L10n.Write.Editor.italic, on: bridge.active.italic, italic: true) { bridge.exec("italic") }
                rule
                tool("H2", on: bridge.active.h2) { bridge.exec("h2") }
                tool("H3", on: bridge.active.h3) { bridge.exec("h3") }
                rule
                tool(L10n.Write.Editor.bulletList, on: bridge.active.bulletList) { bridge.exec("bulletList") }
                tool(L10n.Write.Editor.orderedList, on: bridge.active.orderedList) { bridge.exec("orderedList") }
                tool(L10n.Write.Editor.quote, on: bridge.active.blockquote) { bridge.exec("blockquote") }
                rule
                tool(L10n.Write.Editor.insertCard, icon: .cards, action: onInsertCard)
                tool(uploadingImage ? L10n.Write.Editor.imageUploading : L10n.Write.Editor.insertImage, icon: .image, action: onInsertImage)
                    .disabled(uploadingImage)
            }
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .padding(.bottom, 4)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(L10n.Write.Editor.toolbarLabel)
            WavyDivider(color: Tokens.fieldBorder, seed: 22, amp: 1.2)
            IslandView(webView: bridge.webView)
                .frame(height: bridge.height)
                .accessibilityLabel(L10n.Write.storyLabel)
        }
        .background {
            let shape = WobRectShape(radius: Double(Tokens.radiusMd), seed: 17)
            ZStack {
                RoundedRectangle(cornerRadius: Tokens.radiusMd).fill(Tokens.cream)
                shape.stroke(bridge.focused ? Tokens.terracotta : Tokens.fieldBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
            }
        }
    }

    private var rule: some View {
        WavyVerticalRule().frame(width: 8, height: 26)
    }

    /// ToolButton: the label on a wobbly wash when on.
    private func tool(_ label: String, on: Bool = false, weight: UIFont.Weight = .semibold, italic: Bool = false, icon: IconName? = nil,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon { OrganicIcon(icon, size: 15, strokeWidth: Tokens.ink) }
                Text(label).font(AppFonts.body(14, weight: weight)).italic(italic)
            }
            .foregroundStyle(on ? Tokens.terracotta : Tokens.text)
            .padding(.horizontal, 10)
            .frame(minHeight: 34)
            .background {
                if on { WobRectShape(radius: 10, seed: Double(label.count * 7 + 3), mag: 1).fill(Tokens.terracottaLight.opacity(0.45)) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// The toolbar's vertical pen rule between groups (the web's vertical Divider).
private struct WavyVerticalRule: View {
    var body: some View {
        Canvas { ctx, size in
            let path = wavyVertical(Double(size.height), seed: 7, amp: 1, steps: 3).path(offsetX: Double(size.width / 2))
            ctx.stroke(path, with: .color(Tokens.fieldBorder), style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}
