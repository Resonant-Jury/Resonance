import QuartzCore
import SwiftUI

/// Frame pacing during a benchmark run. A frame is a *hitch* when it arrives
/// later than 1.5 × the display's frame budget; "hitch time ratio" (ms of
/// lateness per second) is Apple's own smoothness metric (≤ 5 ms/s = good,
/// ≥ 10 ms/s = users notice).
@MainActor
final class FrameMonitor: NSObject, ObservableObject {
    struct Result: Codable {
        var label: String
        var seconds: Double
        var frames: Int
        var budgetMs: Double
        var avgMs: Double
        var p95Ms: Double
        var p99Ms: Double
        var hitches: Int
        var hitchRatioMsPerS: Double
    }

    @Published private(set) var running = false
    @Published private(set) var last: Result?

    private var link: CADisplayLink?
    private var lastTimestamp: CFTimeInterval = 0
    private var intervals: [Double] = []
    private var budgets: [Double] = []
    private var started: CFTimeInterval = 0
    private var onFrame: ((Double) -> Void)?
    private var label = ""

    /// Run for `seconds`, calling `onFrame(dt)` every frame (drives auto-scroll).
    func start(label: String, seconds: Double, onFrame: @escaping (Double) -> Void, done: @escaping (Result) -> Void) {
        self.label = label
        self.onFrame = onFrame
        intervals = []
        budgets = []
        lastTimestamp = 0
        started = CACurrentMediaTime()
        running = true
        let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        self.link = link
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(seconds))
            let result = self.stop()
            done(result)
        }
    }

    @objc private func tick(_ link: CADisplayLink) {
        if lastTimestamp > 0 {
            intervals.append((link.timestamp - lastTimestamp) * 1000)
            budgets.append((link.targetTimestamp - link.timestamp) * 1000)
            onFrame?(link.timestamp - lastTimestamp)
        }
        lastTimestamp = link.timestamp
    }

    private func stop() -> Result {
        link?.invalidate()
        link = nil
        running = false
        let seconds = CACurrentMediaTime() - started
        let budget = budgets.isEmpty ? 16.67 : budgets.sorted()[budgets.count / 2]
        let sorted = intervals.sorted()
        let pct = { (p: Double) in sorted.isEmpty ? 0 : sorted[min(sorted.count - 1, Int(Double(sorted.count) * p))] }
        var hitches = 0
        var late = 0.0
        for dt in intervals where dt > budget * 1.5 {
            hitches += 1
            late += dt - budget
        }
        let result = Result(
            label: label,
            seconds: seconds,
            frames: intervals.count,
            budgetMs: budget,
            avgMs: intervals.isEmpty ? 0 : intervals.reduce(0, +) / Double(intervals.count),
            p95Ms: pct(0.95),
            p99Ms: pct(0.99),
            hitches: hitches,
            hitchRatioMsPerS: late / max(seconds, 0.001)
        )
        last = result
        return result
    }
}
