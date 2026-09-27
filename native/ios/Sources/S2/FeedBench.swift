import ResonanceGeometry
import SwiftUI

/// S2 — does a feed of organic cards scroll smoothly?
///
/// 60 StoryCards, auto-scrolled at a constant 1,400 pt/s (a brisk fling)
/// while FrameMonitor records pacing. Variants isolate the costs the report
/// flagged: grain (none / pre-rendered tile / per-pixel shader) and organic
/// image clipping. Launch with `-bench all` to run every variant unattended;
/// results are printed and written to Documents/s2-results.json.
struct FeedBench: View {
    @State private var grain: GrainMode = .tile
    @State private var clip = true
    @StateObject private var monitor = FrameMonitor()
    @State private var position = ScrollPosition(edge: .top)
    @State private var offset: CGFloat = 0
    @State private var results: [FrameMonitor.Result] = []
    var autorun: Bool = false

    private let speed: CGFloat = 1400

    var body: some View {
        VStack(spacing: 0) {
            controls
            ScrollView {
                LazyVStack(spacing: 22) {
                    ForEach(SampleStory.all) { story in
                        StoryCardView(story: story, grain: grain, clipImage: clip)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 24)
            }
            .scrollPosition($position)
            .background(Tokens.cream)
        }
        .task {
            guard autorun else { return }
            try? await Task.sleep(for: .seconds(2)) // let fonts & first layout settle
            // Warm-up pass (not recorded): the first scroll through lays out every
            // card for the first time and loads fonts/tiles — a cold-start cost
            // that would otherwise land on whichever variant runs first.
            await run(grain: .tile, clip: true, record: false)
            for _ in 0..<2 {
                for (mode, c) in [(GrainMode.none, true), (.tile, true), (.shader, true), (.tile, false)] {
                    await run(grain: mode, clip: c)
                }
            }
            write(results)
            renderCost()
        }
    }

    /// Relative cost of each variant, independent of the display's frame cap:
    /// rasterize all 60 cards offscreen at 3× and time it (median of 3 runs).
    @MainActor
    private func renderCost() {
        for (mode, c) in [(GrainMode.none, true), (.tile, true), (.shader, true), (.tile, false)] {
            var times: [Double] = []
            for _ in 0..<3 {
                let start = CFAbsoluteTimeGetCurrent()
                for story in SampleStory.all {
                    let r = ImageRenderer(content: StoryCardView(story: story, grain: mode, clipImage: c).frame(width: 366))
                    r.scale = 3
                    _ = r.cgImage
                }
                times.append((CFAbsoluteTimeGetCurrent() - start) * 1000)
            }
            let median = times.sorted()[1]
            print(String(format: "S2RENDER grain=%@ clip=%@ 60cards=%.0fms perCard=%.2fms", mode.rawValue, c ? "true" : "false", median, median / 60))
        }
        print("S2RENDERDONE")
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Picker("Grain", selection: $grain) {
                    ForEach(GrainMode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                Toggle("clip", isOn: $clip).fixedSize()
            }
            HStack {
                Button(monitor.running ? "Running…" : "Run 8s") {
                    Task { await run(grain: grain, clip: clip) }
                }
                .disabled(monitor.running)
                Spacer()
                if let r = monitor.last {
                    Text(String(format: "%@  avg %.1fms  p95 %.1f  hitch %.1f ms/s", r.label, r.avgMs, r.p95Ms, r.hitchRatioMsPerS))
                        .font(.caption.monospacedDigit())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.bar)
    }

    @MainActor
    private func run(grain: GrainMode, clip: Bool, record: Bool = true) async {
        self.grain = grain
        self.clip = clip
        offset = 0
        position.scrollTo(y: 0)
        try? await Task.sleep(for: .seconds(1))
        let label = "grain=\(grain.rawValue) clip=\(clip)"
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            monitor.start(label: label, seconds: 8, onFrame: { dt in
                offset += speed * dt
                position.scrollTo(y: offset)
            }, done: { result in
                if record {
                    results.append(result)
                    print("S2RESULT " + String(data: try! JSONEncoder().encode(result), encoding: .utf8)!)
                }
                done.resume()
            })
        }
    }

    private func write(_ results: [FrameMonitor.Result]) {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("s2-results.json")
        if let data = try? JSONEncoder().encode(results) { try? data.write(to: url) }
        print("S2DONE \(url.path)")
    }
}
