import FirebaseFirestore
import Foundation

/// Snapshot listeners that one failure doesn't end for good. Firestore rides
/// out a dropped connection by itself; an error it does report ends that
/// listener. The failed one is remembered (`failed`, for the screen's retry
/// state) and attached again when the app comes back to the foreground or the
/// screen asks (`resume()`) — no tight retry loop of our own.
@MainActor
final class LiveListeners {
    /// How each listener is attached; it hands back how to detach it.
    private var attachers: [String: () -> () -> Void] = [:]
    private var detachers: [String: () -> Void] = [:]
    /// Listeners that reported an error and wait for `resume()`.
    private(set) var failed: Set<String> = []

    /// Attaches `name` now (replacing one of that name).
    func add(_ name: String, attach: @escaping () -> () -> Void) {
        detachers.removeValue(forKey: name)?()
        attachers[name] = attach
        failed.remove(name)
        detachers[name] = attach()
    }

    /// `name` reported an error: it is over until `resume()`.
    func fail(_ name: String) {
        guard attachers[name] != nil else { return }
        detachers.removeValue(forKey: name)?()
        failed.insert(name)
    }

    /// Attaches again every listener that failed; returns whether there was one.
    @discardableResult
    func resume() -> Bool {
        let again = failed
        failed = []
        for name in again {
            guard let attach = attachers[name] else { continue }
            detachers[name] = attach()
        }
        return !again.isEmpty
    }

    func removeAll() {
        detachers.values.forEach { $0() }
        detachers = [:]
        attachers = [:]
        failed = []
    }
}

/// What a Firestore error says about the thing asked for.
nonisolated enum FirestoreFailure {
    /// Refused or not there: the thing is gone (or never was) for this reader.
    /// Anything else — offline, a timeout, the backend busy — is passing, and
    /// worth asking again later.
    static func isGone(_ error: Error) -> Bool {
        let e = error as NSError
        return e.domain == FirestoreErrorDomain
            && [FirestoreErrorCode.permissionDenied.rawValue, FirestoreErrorCode.notFound.rawValue].contains(e.code)
    }
}
