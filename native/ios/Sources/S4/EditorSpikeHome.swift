import SwiftUI
import UIKit
import WebKit

/// S4 — the story editor on iOS, two ways:
///  • Island: the web's Tiptap schema in a WKWebView (native/editor), bridged
///    to Swift. Rich (WYSIWYG) and byte-identical Markdown with the web.
///  • Native: a Markdown *source* editor (UITextView) that styles the syntax
///    as you type. Lossless by construction — the text is the Markdown — and
///    fully native (IME, selection, Dynamic Type), but the writer sees marks.
///
///   xcrun simctl launch booted com.resonance.spikes -spike editor -editor island -run 1
struct EditorSpikeHome: View {
    let initial: String?
    @State private var mode: String

    init(initial: String?) {
        self.initial = initial
        _mode = State(initialValue: initial ?? "island")
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Editor", selection: $mode) {
                    Text("Island (WebView)").tag("island")
                    Text("Native source").tag("native")
                }
                .pickerStyle(.segmented)
                .padding(12)
                if mode == "island" {
                    IslandEditorScreen(autorun: LaunchArgs.autorun)
                } else {
                    NativeMarkdownEditorScreen()
                }
            }
            .background(Tokens.cream)
            .navigationTitle("S4 Editor")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Island

struct CorpusCase: Decodable {
    let id: String
    let markdown: String
    let canonical: String

    static func load() -> [CorpusCase] {
        struct File: Decodable { let cases: [CorpusCase] }
        guard let url = Bundle.main.url(forResource: "markdown-corpus", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode(File.self, from: data).cases) ?? []
    }
}

@MainActor
final class IslandBridge: NSObject, ObservableObject, WKScriptMessageHandler {
    @Published var markdown = ""
    @Published var status = "loading…"
    let webView: WKWebView
    private let created = CFAbsoluteTimeGetCurrent()
    private var onReady: (() -> Void)?

    override init() {
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        config.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        controller.add(self, name: "editor")
        webView.isOpaque = false
        webView.backgroundColor = UIColor(Tokens.cream)
        webView.scrollView.keyboardDismissMode = .interactive
        #if DEBUG
        webView.isInspectable = true
        #endif
    }

    func load(onReady: @escaping () -> Void) {
        self.onReady = onReady
        guard let url = Bundle.main.url(forResource: "editor", withExtension: "html") else {
            status = "editor.html missing — run scripts/native/build-editor.mjs"
            return
        }
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "fonts", value: "fonts/")]
        webView.loadFileURL(components.url!, allowingReadAccessTo: Bundle.main.bundleURL)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            let ms = (CFAbsoluteTimeGetCurrent() - created) * 1000
            status = String(format: "ready in %.0f ms (page script %.0f ms)", ms, body["ms"] as? Double ?? 0)
            print("S4RESULT island-ready " + status)
            onReady?()
        case "change":
            markdown = body["markdown"] as? String ?? ""
        default:
            break
        }
    }

    /// Calls `ResonanceEditor.<fn>(arg)` in the page and returns the string result.
    func call(_ fn: String, _ arg: String) async throws -> String {
        let result = try await webView.callAsyncJavaScript("return ResonanceEditor[fn](arg)", arguments: ["fn": fn, "arg": arg], contentWorld: .page)
        return result as? String ?? ""
    }

    /// Every corpus case through the island: must equal the web's canonical form, and be stable.
    func runCorpus() async {
        let cases = CorpusCase.load()
        var failed: [String] = []
        let start = CFAbsoluteTimeGetCurrent()
        for c in cases {
            let once = (try? await call("roundtrip", c.markdown)) ?? "<error>"
            let twice = (try? await call("roundtrip", once)) ?? "<error>"
            if once != c.canonical || twice != once { failed.append(c.id) }
        }
        let ms = (CFAbsoluteTimeGetCurrent() - start) * 1000
        status = "corpus \(cases.count - failed.count)/\(cases.count) identical to web" + (failed.isEmpty ? "" : " — failed: \(failed.joined(separator: ", "))")
        print(String(format: "S4RESULT island-corpus passed=%d total=%d ms=%.0f failed=%@", cases.count - failed.count, cases.count, ms, failed.joined(separator: ",")))
        // Leave a real story in the editor to type into.
        let sample = cases.filter { ["headings", "inline-marks", "link", "card-embed", "blockquote", "lists"].contains($0.id) }
            .map(\.canonical).joined(separator: "\n\n")
        markdown = (try? await call("setMarkdown", sample)) ?? ""
        print("S4RESULT island-done")
    }
}

struct IslandWebView: UIViewRepresentable {
    let bridge: IslandBridge
    func makeUIView(context: Context) -> WKWebView { bridge.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

struct IslandEditorScreen: View {
    var autorun = false
    @StateObject private var bridge = IslandBridge()

    var body: some View {
        VStack(spacing: 0) {
            IslandWebView(bridge: bridge)
            Divider()
            VStack(alignment: .leading, spacing: 4) {
                Text(bridge.status).font(.caption.monospaced())
                Text("Markdown: \(bridge.markdown.prefix(80))…").font(.caption2.monospaced()).foregroundStyle(.secondary).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(.bar)
        }
        .onAppear {
            bridge.load {
                Task { await bridge.runCorpus() }
            }
        }
    }
}

// MARK: - Native Markdown source editor

/// Styles Markdown syntax in place (headings, emphasis, quotes, list markers,
/// links) while leaving every character as typed.
///
/// IME: Zhuyin/Cangjie compose inside *marked text*; touching the attributes
/// of that range cancels the composition (the candidate bar vanishes, keys
/// get committed as Latin). So restyling waits while `markedTextRange` is
/// non-nil and runs once the composition commits.
final class MarkdownStyler: NSObject, UITextViewDelegate {
    var onChange: ((String) -> Void)?
    private let body = AppFonts.uiFont(.body, size: 17)
    private let heading = AppFonts.uiFont(.heading, size: 22, weight: .bold)
    private let rules: [(NSRegularExpression, (NSTextStorage, NSTextCheckingResult) -> Void)]

    override init() {
        func re(_ p: String) -> NSRegularExpression { try! NSRegularExpression(pattern: p, options: [.anchorsMatchLines]) }
        let muted = UIColor(Tokens.textMuted)
        let accent = UIColor(Tokens.terracotta)
        let boldFont = AppFonts.uiFont(.body, size: 17, weight: .bold)
        let italicFont = UIFont(descriptor: AppFonts.uiFont(.body, size: 17).fontDescriptor.withSymbolicTraits(.traitItalic) ?? AppFonts.uiFont(.body, size: 17).fontDescriptor, size: 17)
        rules = [
            (re("^#{1,6} .*$"), { [heading] s, m in s.addAttribute(.font, value: heading, range: m.range) }),
            (re("^> .*$"), { s, m in s.addAttributes([.foregroundColor: muted], range: m.range) }),
            (re("\\*\\*[^*\\n]+\\*\\*"), { s, m in s.addAttribute(.font, value: boldFont, range: m.range) }),
            (re("(?<![*\\\\])\\*[^*\\n]+\\*(?!\\*)"), { s, m in s.addAttribute(.font, value: italicFont, range: m.range) }),
            (re("\\[[^\\]\\n]+\\]\\([^)\\n]+\\)"), { s, m in s.addAttribute(.foregroundColor, value: accent, range: m.range) }),
            (re("^(\\s*)([-*+]|\\d+\\.) "), { s, m in s.addAttribute(.foregroundColor, value: accent, range: m.range(at: 2)) }),
            (re("[#*>`~_\\[\\]()]"), { s, m in s.addAttribute(.foregroundColor, value: muted.withAlphaComponent(0.6), range: m.range) }),
        ]
    }

    func restyle(_ textView: UITextView) {
        guard textView.markedTextRange == nil else { return } // never during IME composition
        let storage = textView.textStorage
        let full = NSRange(location: 0, length: storage.length)
        let style = NSMutableParagraphStyle()
        style.lineSpacing = 17 * 0.5
        storage.beginEditing()
        storage.setAttributes([.font: body, .foregroundColor: UIColor(Tokens.text), .paragraphStyle: style], range: full)
        for (regex, apply) in rules {
            for m in regex.matches(in: storage.string, range: full) { apply(storage, m) }
        }
        storage.endEditing()
    }

    func textViewDidChange(_ textView: UITextView) {
        restyle(textView)
        onChange?(textView.text)
    }
}

struct NativeMarkdownEditor: UIViewRepresentable {
    @Binding var text: String

    func makeCoordinator() -> MarkdownStyler { MarkdownStyler() }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.backgroundColor = .clear
        view.textContainerInset = UIEdgeInsets(top: 16, left: 16, bottom: 120, right: 16)
        view.delegate = context.coordinator
        view.adjustsFontForContentSizeCategory = true
        view.keyboardDismissMode = .interactive
        view.text = text
        context.coordinator.onChange = { text = $0 }
        context.coordinator.restyle(view)
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {}
}

struct NativeMarkdownEditorScreen: View {
    @State private var text = CorpusCase.load()
        .filter { ["headings", "inline-marks", "link", "blockquote", "lists"].contains($0.id) }
        .map(\.canonical).joined(separator: "\n\n")

    var body: some View {
        VStack(spacing: 0) {
            NativeMarkdownEditor(text: $text)
            Divider()
            Text("\(text.count) characters · stored exactly as typed")
                .font(.caption.monospaced())
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(.bar)
        }
    }
}
