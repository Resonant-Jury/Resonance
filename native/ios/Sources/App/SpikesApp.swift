import SwiftUI

/// iOS spike app for the native-feasibility experiments (S1–S6).
/// Launch arguments jump straight to one experiment, e.g.
///   xcrun simctl launch booted com.resonance.spikes -spike feed -bench all
@main
struct SpikesApp: App {
    init() {
        AppFonts.register()
    }

    var body: some Scene {
        WindowGroup {
            SpikeHome(initial: LaunchArgs.value("-spike"))
                .tint(Tokens.terracotta)
        }
    }
}

enum LaunchArgs {
    static func value(_ flag: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
        return args[i + 1]
    }
    static var autorun: Bool { value("-bench") == "all" || value("-run") != nil }
}

struct SpikeHome: View {
    let initial: String?

    var body: some View {
        switch initial {
        case "curves": NavigationStack { CurveLab() }
        case "feed": FeedBench(autorun: LaunchArgs.autorun)
        case "grain": GrainParity(autorun: LaunchArgs.autorun)
        case "nav-system": NavSpike(mode: .system)
        case "nav-organic": NavSpike(mode: .organic)
        case "type": NavigationStack { TypeLab(autorun: LaunchArgs.autorun) }
        case "editor": EditorSpikeHome(initial: LaunchArgs.value("-editor"))
        case "api": NavigationStack { ApiSpike(autorun: LaunchArgs.autorun) }
        default: menu
        }
    }

    private var menu: some View {
        NavigationStack {
            List {
                Section("Experiments") {
                    NavigationLink("S1 · Curve Lab (web vs Swift paths)") { CurveLab() }
                    NavigationLink("S2 · Feed scroll benchmark") { FeedBench() }
                    NavigationLink("S2 · GPU grain parity") { GrainParity() }
                    NavigationLink("S3 · Navigation — system chrome") { NavSpike(mode: .system) }
                    NavigationLink("S3 · Navigation — organic chrome") { NavSpike(mode: .organic) }
                    NavigationLink("S4 · Editor") { EditorSpikeHome(initial: nil) }
                    NavigationLink("S5 · Typography") { TypeLab() }
                    NavigationLink("S6 · Backend contract") { ApiSpike() }
                }
                Section("Atoms") {
                    AtomsGallery()
                }
            }
            .navigationTitle("共振 Spikes")
        }
    }
}

/// Quick visual check of the organic atoms.
private struct AtomsGallery: View {
    @State private var on = true
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                OrganicButton(title: "開始書寫") { }
                OrganicButton(title: "取消", variant: .ghost) { }
            }
            HStack(spacing: 16) {
                OrganicToggle(isOn: $on, label: "同時封鎖")
                SketchLoader(size: 44)
                TagPill(text: "日常")
                HandDrawnAvatar(initials: "AL", size: 36)
            }
        }
        .padding(.vertical, 8)
    }
}
