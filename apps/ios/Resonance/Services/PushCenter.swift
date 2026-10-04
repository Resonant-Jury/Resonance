import FirebaseMessaging
import Foundation
import Observation
import ResonanceKit
import UIKit
import UserNotifications

/// Push notifications: permission, this install's FCM token, and the pushes
/// the person taps. The server writes every push from a bell row (the same
/// copy, in the app's language) with `data.route`, a site path the app opens.
///
/// Chat messages are pushed one by one (`type: "message"`), grouped by the
/// system under their conversation (`threadId`, its pair id). The conversation
/// on screen (`viewingConversation`) gets no banner while the app is open, and
/// opening it takes its pushes out of Notification Center: its messages are
/// being read.
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
        /// A chat message's push: it was sent to one account.
        var chat: ChatPush?
        let at = Date()

        /// Whether `uid`, signed in now, may follow it. A message sent to another account (a sign-out
        /// whose unregister never reached the server leaves the install registered to it for a while)
        /// still shows with the app closed (see `signedIn`), but a tap on it opens nothing here. A
        /// bell's push names no recipient and opens as it always has.
        func isFor(_ uid: String?) -> Bool {
            chat?.isFor(uid) ?? true
        }
    }

    var opened: Opened?
    private(set) var token: String?
    /// The account signed in (the session sets it): a chat push for anyone else stays quiet while
    /// the app is open. With the app closed the system shows it (the server's push for iOS carries
    /// its words, and the app has no notification extension to take them back); a tap on it opens
    /// nothing (`Opened.isFor`).
    @ObservationIgnored var signedIn: String?
    /// The conversation (its pair id) whose thread is on screen right now, with the app in the
    /// foreground: set while the thread is visible and cleared when it isn't, so a message that
    /// arrives behind another page or with the app in the background still rings.
    @ObservationIgnored private(set) var viewingConversation: String?
    /// The thread that said so: only it can say it stopped (two threads of one conversation can
    /// change places — a push tapped while it is open opens another).
    @ObservationIgnored private var viewer: ObjectIdentifier?
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

    func open(route: String, notificationId: String?, fromUserId: String? = nil, chat: ChatPush? = nil) {
        opened = Opened(route: route, notificationId: notificationId, fromUserId: fromUserId, chat: chat)
    }

    // MARK: Chat

    /// `viewer`, a thread of `pairId`, is on screen. Opening the conversation clears its pushes:
    /// the messages in them are being read.
    func viewing(_ pairId: String, by viewer: ObjectIdentifier) {
        let opened = viewingConversation != pairId || self.viewer != viewer
        viewingConversation = pairId
        self.viewer = viewer
        if opened { Self.removeDelivered(conversation: pairId) }
    }

    /// `viewer` stopped being on screen — unless another thread has taken its place already, even
    /// one of the same conversation.
    func stoppedViewing(by viewer: ObjectIdentifier) {
        guard self.viewer == viewer else { return }
        viewingConversation = nil
        self.viewer = nil
    }

    /// How a push that arrives while the app is open shows: a chat message of the conversation on
    /// screen (it is in the thread already), or one sent to another account, not at all; anything
    /// else as a banner, as it would with the app closed (the bell's row arrives at the same moment anyway).
    func presentation(for info: [AnyHashable: Any]) -> UNNotificationPresentationOptions {
        guard let chat = ChatPush(userInfo: info) else { return [.banner, .list, .sound] }
        return chat.showsWhileOpen(viewing: viewingConversation, signedIn: signedIn) ? [.banner, .list, .sound] : []
    }

    /// Takes a conversation's pushes out of Notification Center (grouped under its pair id; an
    /// older server's push names it in its data instead).
    nonisolated static func removeDelivered(conversation pairId: String) {
        UNUserNotificationCenter.current().getDeliveredNotifications { delivered in
            let ids = delivered.filter { isOf(conversation: pairId, $0.request.content) }.map(\.request.identifier)
            if !ids.isEmpty { UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids) }
        }
    }

    /// Whether a delivered push belongs to the conversation `pairId`.
    nonisolated static func isOf(conversation pairId: String, _ content: UNNotificationContent) -> Bool {
        content.threadIdentifier == pairId || ChatPush(userInfo: content.userInfo)?.conversationId == pairId
    }

    /// A tapped push's data (FCM's `data`, at the top of the payload). An empty id names nothing (a
    /// message's push has no bell row; an older server sent "").
    func open(userInfo info: [AnyHashable: Any]) {
        let value = { (key: String) in (info[key] as? String).flatMap { $0.isEmpty ? nil : $0 } }
        open(route: info["route"] as? String ?? "", notificationId: value("notificationId"), fromUserId: value("fromUserId"),
             chat: ChatPush(userInfo: info))
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

    /// In the foreground a push still shows (`PushCenter.presentation`), except a message of the conversation on screen.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        PushCenter.shared.presentation(for: notification.request.content.userInfo)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        PushCenter.shared.open(userInfo: response.notification.request.content.userInfo)
    }
}
