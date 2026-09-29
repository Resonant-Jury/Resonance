import FirebaseFirestore
import Foundation

/// The web's first-time hints (lib/hints.ts): a hint shows for its first
/// three displays, then stays quiet. The count lives on the device
/// (`hint:{key}`, as the web's localStorage) and is mirrored to the profile's
/// `hintsSeen` map, so a hint seen on the web counts here too.
struct HintService {
    /// HINT_LIMIT.
    static let limit = 3
    let uid: String

    /// Whether to show the hint this time — asking counts as one display.
    func claim(_ key: String) async -> Bool {
        let defaults = UserDefaults.standard
        let localKey = "hint:\(key)"
        let user = Firestore.firestore().collection("users").document(uid)
        let hintsSeen = (try? await user.getDocument())?.data()?["hintsSeen"] as? [String: Any]
        let count = max(defaults.integer(forKey: localKey), (hintsSeen?[key] as? NSNumber)?.intValue ?? 0)
        guard count < Self.limit else { return false }
        defaults.set(count + 1, forKey: localKey)
        // Best effort, like syncHintCount: the device's count still governs here.
        try? await user.updateData(["hintsSeen.\(key)": count + 1])
        return true
    }
}
