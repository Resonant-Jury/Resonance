import FirebaseMessaging
import Foundation
import Observation
import ResonanceKit
import UIKit
import UserNotifications

/// Push notifications: permission, this install's FCM token, and the pushes
/// the person taps. The server writes every push from a bell row (the same
/// copy, in the app's language) with `data.route`, a site path the app opens.
@Observable
final class PushCenter {
    static let shared = PushCenter()

    /// A tapped push waiting for the tab view to open it.
    struct Opened: Equatable {
        /// A site path (`/messages/{handle}?note=…&card=…`, `/card/{id}`), or empty: show the notifications.
        let route: String
        let notificationId: String?
        /// The sender's uid, on a push that opens their conversation (note, message, resonance, accepted invite).
        var fromUserId: String?
        let at = Date()
    }

    var opened: Opened?
    private(set) var token: String?
    /// Called with each new FCM token (the session registers it under whoever is signed in).
    @ObservationIgnored var onToken: ((String) -> Void)?

    /// This install's own id — the key the server keeps its token under. It
    /// belongs to this phone: a backup restored onto another one carries the
    /// app's settings along, so the phone it was made on is kept beside it
    /// (identifierForVendor), and on a different phone the install gets an id
    /// of its own instead of claiming the first phone's device record.
    static var installationId: String {
        let defaults = UserDefaults.standard
        let key = "pushInstallationId", deviceKey = "pushInstallationDevice"
        let device = UIDevice.current.identifierForVendor?.uuidString
        if let id = defaults.string(forKey: key) {
            // Unknown for now (before the first unlock): keep what there is.
            guard let device else { return id }
            switch defaults.string(forKey: deviceKey) {
            case device: return id
            case nil:
                // Made by a build before this check: it was made here.
                defaults.set(device, forKey: deviceKey)
                return id
            default:
                break
            }
        }
        let id = UUID().uuidString
        defaults.set(id, forKey: key)
        defaults.set(device, forKey: deviceKey)
        defaults.removeObject(forKey: registrationKey)
        return id
    }

    /// The registration this install last sent (see PushRegistration); nil once signed out.
    static var lastRegistration: String? {
        get { UserDefaults.standard.string(forKey: registrationKey) }
        set { UserDefaults.standard.set(newValue, forKey: registrationKey) }
    }

    private static let registrationKey = "pushRegistration"

    /// Signed in: with notifications already allowed, registers with APNs (each
    /// launch; FCM hands back its token through `tokenChanged`). It doesn't ask —
    /// that waits for `reachedOut()`.
    func registerIfAllowed() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// The person just reached someone — a note, a message, a card published:
    /// the moment a reply, a resonance or a note back is worth hearing about,
    /// so the moment to ask (once; the system remembers the answer) — not on
    /// first opening the app, before there is anything to be notified about.
    func reachedOut() {
        Task {
            let center = UNUserNotificationCenter.current()
            guard await center.notificationSettings().authorizationStatus == .notDetermined else { return }
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            guard granted else { return }
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func tokenChanged(_ token: String?) {
        guard let token, token != self.token else { return }
        self.token = token
        onToken?(token)
    }

    func open(route: String, notificationId: String?, fromUserId: String? = nil) {
        opened = Opened(route: route, notificationId: notificationId, fromUserId: fromUserId)
    }

    /// A tapped push's data (FCM's `data`, at the top of the payload).
    func open(userInfo info: [AnyHashable: Any]) {
        let sender = (info["fromUserId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        open(route: info["route"] as? String ?? "", notificationId: info["notificationId"] as? String, fromUserId: sender)
    }
}

/// UIKit's side of push: APNs → FCM, and the system's notification callbacks.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // The emulator build's Firebase project is a stand-in with no FCM behind it.
        if !AppConfig.current.usesEmulator { Messaging.messaging().delegate = self }
        #if DEBUG
        // `-pushToken <any>` registers a stand-in token, so the registration can be checked against the emulators.
        if let fake = UserDefaults.standard.string(forKey: "pushToken") { PushCenter.shared.tokenChanged(fake) }
        #endif
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        PushCenter.shared.tokenChanged(fcmToken)
    }

    /// In the foreground a push still shows: the bell's row arrives at the same moment anyway.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        PushCenter.shared.open(userInfo: response.notification.request.content.userInfo)
    }
}
