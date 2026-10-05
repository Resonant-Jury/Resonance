import Observation
import ResonanceKit

/// Settings → 通知 (the web's NotificationsSection and useNotificationSettings): the two pushes
/// beyond the ones answering you, each its own switch, both off until turned on. The server keeps
/// the choice (`GET/PATCH /api/v1/me/notifications`); whether this phone may show them is the
/// system's to say. So turning one on asks the system first — its question when it was never
/// asked; when the answer was no, the switch stays off and the section says where to turn
/// notifications back on. A flip shows at once and is undone, with a line saying so, when it
/// doesn't save.
@Observable
final class NotificationSettingsModel {
    typealias Switch = NotificationSettingsAPI.Switch
    typealias Settings = NotificationSettingsAPI.Settings

    /// The switches as the server has them, or as just flipped; nil until they have been read.
    private(set) var settings: Settings?
    /// Reading them failed, and nothing is shown yet.
    private(set) var loadFailed = false
    /// The last flip didn't save, and was undone.
    private(set) var saveFailed = false
    /// A flip on its way (the system's question, then the server): the switches wait for it.
    private(set) var pending: Switch?
    /// What the system said last.
    private(set) var permission: PushCenter.Permission?
    /// The person turned a switch on while the system wouldn't show notifications.
    private var refused = false

    private let fetch: @Sendable () async throws -> Settings
    private let save: @Sendable (Switch, Bool) async throws -> Settings
    private let systemPermission: () async -> PushCenter.Permission
    private let ask: () async -> Bool
    private let register: () async -> Void

    /// `permission` reads the system's setting, `ask` puts its question (only ever when never
    /// asked) and says whether notifications may show now, and `register` registers this install
    /// once they may.
    init(fetch: @escaping @Sendable () async throws -> Settings,
         save: @escaping @Sendable (Switch, Bool) async throws -> Settings,
         permission: @escaping () async -> PushCenter.Permission,
         ask: @escaping () async -> Bool,
         register: @escaping () async -> Void = {}) {
        self.fetch = fetch
        self.save = save
        systemPermission = permission
        self.ask = ask
        self.register = register
    }

    convenience init(api: NotificationSettingsAPI, push: PushCenter) {
        self.init(fetch: { try await api.settings() }, save: { try await api.set($0, $1) },
                  permission: { await push.permission() }, ask: { await push.askIfUndetermined() },
                  register: { await push.registerIfAllowed() })
    }

    /// The notice that the system keeps this app's notifications off, with the way to Settings:
    /// shown once a switch is on (nothing it asks for can arrive) or was just turned on in vain.
    var permissionDenied: Bool {
        permission == .denied && (refused || settings.map { $0.picks || $0.connectionCards } == true)
    }

    /// Whether a switch can be flipped now: read, and no other flip on its way.
    var canFlip: Bool { settings != nil && pending == nil }

    func isOn(_ name: Switch) -> Bool { settings?[name] ?? false }

    func load() async {
        do {
            settings = try await fetch()
            loadFailed = false
        } catch {
            // A failure behind switches already shown leaves them as they are.
            if settings == nil { loadFailed = true }
        }
        await checkPermission()
    }

    /// Reads the system's setting again (on opening, and back from Settings). Turned on there, the
    /// notice goes and this install registers for the pushes it was missing.
    func checkPermission() async {
        let before = permission
        let now = await systemPermission()
        permission = now
        if now != .denied { refused = false }
        if now == .allowed, before != nil, before != .allowed { await register() }
    }

    /// Turns `name` on or off. On asks the system first and stays off without its yes; then the
    /// switch shows its new place at once and goes back, with `saveFailed`, if the server refuses.
    func set(_ name: Switch, _ on: Bool) async {
        guard canFlip, isOn(name) != on else { return }
        pending = name
        defer { pending = nil }
        saveFailed = false
        if on {
            let allowed = await ask()
            permission = await systemPermission()
            guard allowed else {
                refused = true
                return
            }
            refused = false
        }
        settings?[name] = on
        do {
            settings = try await save(name, on)
        } catch {
            settings?[name] = !on
            saveFailed = true
        }
    }
}
