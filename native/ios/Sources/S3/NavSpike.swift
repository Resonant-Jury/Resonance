import ResonanceGeometry
import SwiftUI
import UIKit

/// S3 — can the brand's organic chrome replace the system bars without
/// losing platform behavior?
///
/// Two modes over the same screens:
///  • System: TabView + NavigationStack + toolbar (iOS 26+: Liquid Glass).
///  • Organic: the SAME NavigationStack (so push/pop, transitions and the
///    swipe-back gesture stay the system's), with the system bars hidden and
///    hand-drawn header / back button / tab bar drawn by us.
struct NavSpike: View {
    enum Mode: String, CaseIterable, Identifiable {
        case system, organic
        var id: String { rawValue }
    }

    @State var mode: Mode

    var body: some View {
        Group {
            switch mode {
            case .system: SystemChrome(mode: $mode)
            case .organic: OrganicChrome(mode: $mode)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

enum SpikeTab: String, CaseIterable, Identifiable {
    case home = "共振", me = "我的", messages = "訊息"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .home: "water.waves"
        case .me: "person"
        case .messages: "bubble.left"
        }
    }
}

// MARK: - System chrome

private struct SystemChrome: View {
    @Binding var mode: NavSpike.Mode
    @State private var tab: SpikeTab = .home

    var body: some View {
        TabView(selection: $tab) {
            ForEach(SpikeTab.allCases) { t in
                Tab(t.rawValue, systemImage: t.icon, value: t) {
                    NavigationStack {
                        TabRoot(tab: t, mode: $mode, organic: false)
                            .navigationTitle(t.rawValue)
                            .navigationBarTitleDisplayMode(.large)
                            .toolbar {
                                ToolbarItemGroup(placement: .topBarTrailing) {
                                    Button { } label: { Image(systemName: "square.and.pencil") }
                                    Button { } label: { Image(systemName: "bell") }
                                }
                            }
                            .navigationDestination(for: SampleStory.self) { story in
                                StoryDetail(story: story, organic: false)
                                    .navigationTitle(story.title)
                                    .navigationBarTitleDisplayMode(.inline)
                                    .toolbar {
                                        ToolbarItemGroup(placement: .topBarTrailing) {
                                            ShareLink(item: "https://resonance-world.vercel.app/card/\(story.id)")
                                            Menu {
                                                Button("檢舉這張卡片", systemImage: "flag") { }
                                                Button("封鎖", systemImage: "nosign", role: .destructive) { }
                                            } label: { Image(systemName: "ellipsis") }
                                        }
                                    }
                            }
                    }
                }
            }
        }
        .modifier(MinimizeTabBarOnScroll())
    }
}

/// iOS 26's Liquid Glass tab bar can shrink while scrolling; older systems ignore it.
private struct MinimizeTabBarOnScroll: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            content
        }
    }
}

// MARK: - Organic chrome

private struct OrganicChrome: View {
    @Binding var mode: NavSpike.Mode
    @State private var tab: SpikeTab = .home
    @State private var paths: [SpikeTab: NavigationPath] = [:]
    @State private var scrollToTop = 0

    var body: some View {
        ZStack(alignment: .bottom) {
            // One stack per tab, kept alive so switching tabs preserves history.
            ForEach(SpikeTab.allCases) { t in
                NavigationStack(path: binding(for: t)) {
                    TabRoot(tab: t, mode: $mode, organic: true, scrollToTop: scrollToTop)
                        .toolbar(.hidden, for: .navigationBar)
                        .navigationDestination(for: SampleStory.self) { story in
                            StoryDetail(story: story, organic: true)
                                .toolbar(.hidden, for: .navigationBar)
                        }
                }
                .opacity(t == tab ? 1 : 0)
                .allowsHitTesting(t == tab)
            }
            // The organic tab bar hides on pushed screens, like the system one.
            if (paths[tab]?.isEmpty ?? true) {
                OrganicTabBar(selection: tab) { picked in
                    if picked == tab {
                        // Re-tapping the current tab pops to root, then scrolls to top.
                        if !(paths[tab]?.isEmpty ?? true) { paths[tab] = NavigationPath() } else { scrollToTop += 1 }
                    }
                    tab = picked
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: paths[tab]?.isEmpty ?? true)
        .background(Tokens.cream)
    }

    private func binding(for t: SpikeTab) -> Binding<NavigationPath> {
        Binding(get: { paths[t] ?? NavigationPath() }, set: { paths[t] = $0 })
    }
}

/// Floating hand-drawn tab bar: organic pill, ink outline, grain, selected
/// item on a wobbly wash. Behaviors re-implemented: selection haptics,
/// VoiceOver tab traits, and Large Content Viewer on long press.
private struct OrganicTabBar: View {
    let selection: SpikeTab
    let onSelect: (SpikeTab) -> Void

    var body: some View {
        HStack(spacing: 4) {
            ForEach(SpikeTab.allCases) { t in
                let selected = t == selection
                Button { onSelect(t) } label: {
                    VStack(spacing: 2) {
                        Image(systemName: t.icon).font(.system(size: 18, weight: selected ? .semibold : .regular))
                        Text(t.rawValue).font(AppFonts.body(11, weight: selected ? .semibold : .regular))
                    }
                    .foregroundStyle(selected ? Tokens.terracotta : Tokens.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background {
                        if selected {
                            // The web's active nav wash (AppMobileNavModal): terracotta-light
                            // at 45%, a gentle wobble, inset so it never meets the outline.
                            WobRectShape(radius: 16, seed: Double(t.rawValue.unicodeScalars.first!.value % 97), mag: 1.3)
                                .fill(Tokens.terracottaLight.opacity(0.45))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
                .accessibilityShowsLargeContentViewer {
                    Label(t.rawValue, systemImage: t.icon)
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 7)
        .organicSurface(fill: Tokens.cardBg, stroke: Tokens.modalBorder, radius: 26, seed: 131, grain: .tile, grainOpacity: 0.25)
        .padding(.horizontal, 20)
        .padding(.bottom, 6)
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// Root-screen header: large Playfair title with the wavy pen line under it —
/// the web's AppHeader wave, moved from the bar into the content.
private struct OrganicLargeHeader: View {
    let title: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(AppFonts.heading(32))
                    .foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                OrganicIconButton(symbol: "square.and.pencil", label: "寫一張卡片") { }
                OrganicIconButton(symbol: "bell", label: "通知") { }
            }
            WavyDivider(color: Tokens.textMuted.opacity(0.5), seed: 7, amp: 1.6)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }
}

/// Pushed-screen bar: hand-drawn back button (left), centered title, actions (right).
private struct OrganicInlineBar: View {
    let title: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Text(title).font(AppFonts.body(16, weight: .semibold)).lineLimit(1)
                    .foregroundStyle(Tokens.text)
                    .padding(.horizontal, 90)
                    .accessibilityAddTraits(.isHeader)
                HStack {
                    OrganicIconButton(symbol: "chevron.left", label: "返回") { dismiss() }
                    Spacer()
                    OrganicIconButton(symbol: "square.and.arrow.up", label: "分享") { }
                    OrganicIconButton(symbol: "ellipsis", label: "更多") { }
                }
            }
            WavyDivider(color: Tokens.textMuted.opacity(0.4), seed: 11)
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .background(Tokens.cream.opacity(0.94))
    }
}

struct OrganicIconButton: View {
    let symbol: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Tokens.text)
                .frame(width: 40, height: 40)
                .background {
                    WobCircleShape(seed: Double(symbol.count * 13), options: WobCircleOptions(segments: 7, mag: 1.2, cpJitter: 0.5))
                        .stroke(Tokens.ghostStroke.opacity(0.8), lineWidth: Tokens.inkLight)
                        .padding(3)
                }
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Screens

private struct TabRoot: View {
    let tab: SpikeTab
    @Binding var mode: NavSpike.Mode
    let organic: Bool
    var scrollToTop: Int = 0

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if organic {
                        OrganicLargeHeader(title: tab.rawValue).id("top")
                    }
                    Picker("Chrome", selection: $mode) {
                        ForEach(NavSpike.Mode.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 20)
                    ForEach(SampleStory.all.prefix(8)) { story in
                        NavigationLink(value: story) {
                            StoryCardView(story: story, grain: .tile)
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 18)
                    }
                }
                .padding(.bottom, 100)
            }
            .onChange(of: scrollToTop) { withAnimation { proxy.scrollTo("top", anchor: .top) } }
        }
        .background(Tokens.cream)
    }
}

struct StoryDetail: View {
    let story: SampleStory
    let organic: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(story.title).font(AppFonts.heading(28)).foregroundStyle(Tokens.text)
                ForEach(0..<6) { _ in
                    CSSText(text: story.excerpt + " " + story.excerpt, font: AppFonts.uiFont(.body, size: 16), lineHeight: 1.75)
                }
            }
            .padding(20)
        }
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            if organic { OrganicInlineBar(title: story.title) }
        }
    }
}

// MARK: - Swipe-back with hidden system bars

/// Hiding the navigation bar silently disables UIKit's edge swipe-back.
/// Re-enable it (and iOS 26's full-width content swipe) whenever there is
/// something to pop — this is the one piece of UIKit the organic chrome needs.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
        if #available(iOS 26.0, *) {
            interactiveContentPopGestureRecognizer?.delegate = self
        }
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}
