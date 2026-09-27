import Observation

/// Opens the writing screen from anywhere (the pen in the tab bar, "write a
/// card" prompts on the feed and profile).
@Observable
final class WriteLauncher {
    var isPresented = false
    func open() { isPresented = true }
}
