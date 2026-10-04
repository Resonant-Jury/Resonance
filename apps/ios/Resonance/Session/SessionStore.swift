import FirebaseAuth
import GoogleSignIn
import Observation
import ResonanceAPI
import ResonanceKit
import UIKit
import UserNotifications

/// Who is signed in, and their profile as the API sees it.
///
/// Firebase Auth owns the sign-in state (it persists across launches and
/// refreshes the ID token); every API call asks it for a fresh token.
@Observable
final class SessionStore {
    enum Phase: Equatable { case restoring, signedOut, signedIn }
    enum ProfileState: Equatable { case unknown, loading, loaded, missing, failed(String) }

    /// Where a signed-in person lands: the tabs, or onboarding (the pen-name
    /// step) when the API says the account has no profile yet — or one that
    /// never got a pen name.
    enum Landing: Equatable {
        /// The loader, until the first answer about a new sign-in's profile —
        /// so a new account never glimpses the tabs before onboarding.
        case pending
        case onboarding
        case tabs

        /// What an answer about the profile does to it. Only the API's own
        /// "no profile yet" (404 not_found), or a profile without a pen name,
        /// opens onboarding; a failed request (offline, a server error) can
        /// only let a waiting person into the tabs, never send anyone to onboarding.
        func after(_ answer: ProfileAnswer) -> Landing {
            switch answer {
            case .found: .tabs
            case .missing, .unnamed: .onboarding
            case .failed: self == .pending ? .tabs : self
            }
        }
    }

    /// `unnamed`: a profile that never got a pen name (older accounts can have
    /// one). It can reach no one — notes, messages and resonances take a pen
    /// name — so it goes through onboarding, where choosing one names it
    /// (POST /api/v1/me), as the web's AppShell does.
    enum ProfileAnswer {
        case found, unnamed, missing, failed

        static func of(_ me: Components.Schemas.Me) -> ProfileAnswer {
            me.handle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .unnamed : .found
        }
    }

    private(set) var phase: Phase = .restoring
    private(set) var uid: String?
    private(set) var me: Components.Schemas.Me?
    private(set) var profile: ProfileState = .unknown
    private(set) var landing: Landing = .pending
    private(set) var isSigningIn = false
    var signInError: String?

    /// When a scheduled account deletion will run (the undo banner shows until
    /// then): it comes with the account (`Me.deletion`), the kept one on a cold start.
    var deletionDate: Date? { me?.deletion?.value1.purgeAfter }
    /// Cancels of a scheduled deletion here, so a /me answer asked for before one
    /// (still on its way when the person tapped undo) can't bring the banner back.
    @ObservationIgnored private var deletionCancels = DeletionCancels()
    /// Set when the app signed the person out because they scheduled deletion.
    private(set) var signedOutForDeletion = false
    /// Bumped when the interface language changes, so the whole UI re-renders.
    private(set) var languageEpoch = 0
    /// Bumped when the app comes back to the foreground with what it shows
    /// grown old (`ForegroundRefresh`): the screens drawing kept answers ask
    /// the server again, keeping theirs on screen meanwhile.
    private(set) var awayRefreshes = 0
    @ObservationIgnored private var foreground = ForegroundRefresh(last: .now)
    /// The block list kept from the last run, until the live one arrives.
    private var keptBlocked: Set<String> = []

    let config: AppConfig
    /// The API's HTTP cache, the signed-in account's only (its own URLCache).
    let httpCache = APIHTTPCache.standard()
    /// The answers a cold start draws before the network has said anything.
    let kept = APICache.standard()
    let api: Client
    let account: AccountAPI
    let writing: WritingAPI
    let notifications = NotificationsStore()
    let conversations = ConversationsStore()
    /// Cards seen in lists, drawn while a card's page loads (this account's only).
    let cardPreviews = CardPreviewCache()
    /// The messages this account sent that are still on their way, one queue per conversation
    /// (they outlive the thread that sent them; emptied when the account changes).
    let outboxes: ChatOutboxes
    /// The account's thought map, kept between visits so opening it again within a
    /// while shows it at once without reading a hundred cards (ThoughtMapStore.open).
    private(set) var thoughtMap: ThoughtMapStore
    let push = PushCenter.shared
    @ObservationIgnored private var listener: AuthStateDidChangeListenerHandle?
    @ObservationIgnored private let apple = AppleSignIn()

    init(config: AppConfig) {
        self.config = config
        let configuration = APIConfiguration(origin: config.origin, idToken: { force in try await Self.idToken(forceRefresh: force) })
        let client = ResonanceClient.make(configuration, cache: httpCache)
        api = client
        outboxes = ChatOutboxes(messaging: { MessagingAPI(client: client) }, sent: { PushCenter.shared.reachedOut() })
        account = AccountAPI(configuration)
        writing = WritingAPI(client: api, configuration: configuration)
        thoughtMap = ThoughtMapStore(api: ReadingAPI(client: api))
        if let saved = UserDefaults.standard.string(forKey: Self.languageKey), let language = Strings.Language(rawValue: saved) {
            Strings.shared.language = language
        }
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            MainActor.assumeIsolated { self?.apply(user?.uid) }
        }
        push.onToken = { [weak self] _ in Task { await self?.registerPush() } }
        // Someone blocked or unblocked (here or on another device): what a list showed may no longer be theirs to see.
        conversations.onBlocksChange = { [weak self] in
            self?.cardPreviews.clear()
            self?.noteOwnWrite()
        }
        conversations.onBlocks = { [weak self] ids in
            guard let self, let uid else { return }
            kept.save(ids.sorted(), as: .blocked, uid: uid)
        }
    }

    var reading: ReadingAPI { ReadingAPI(client: api) }
    var profiles: ProfileAPI { ProfileAPI(client: api) }
    var safety: SafetyService? {
        let freshness = httpCache.freshness
        return uid.map { SafetyService(uid: $0, api: SafetyAPI(client: api), onWrite: freshness.invalidate) }
    }
    var bookmarks: BookmarkService? {
        let freshness = httpCache.freshness
        return uid.map { BookmarkService(uid: $0, onWrite: freshness.invalidate) }
    }
    var drafts: DraftService? { uid.map(DraftService.init(uid:)) }
    var hints: HintService? { uid.map(HintService.init(uid:)) }
    var messaging: MessagingAPI { MessagingAPI(client: api) }
    var pushAPI: PushAPI { PushAPI(client: api) }
    /// The people this account has blocked: the live list, or until it has
    /// arrived the one kept from the last run — what kept answers are
    /// filtered with before they're drawn.
    var blockedIds: Set<String> { conversations.blockedIds ?? keptBlocked }

    /// The viewer wrote something the API doesn't see (a draft, a bookmark, a
    /// block — straight to Firestore): the next GET of every URL asks the
    /// server again instead of trusting the HTTP cache. Writes through the API
    /// do this themselves (`FreshnessMiddleware`).
    func noteOwnWrite() {
        httpCache.freshness.invalidate()
    }

    // MARK: - Coming back

    /// The app is in the foreground again: when what the screens show was
    /// last asked for long enough ago, they ask again (`awayRefreshes`),
    /// the profile with them. Returns whether they do.
    @discardableResult
    func cameBack(now: Date = .now) -> Bool {
        guard phase == .signedIn, foreground.isStale(at: now) else { return false }
        foreground = ForegroundRefresh(last: now)
        awayRefreshes += 1
        Task { await loadMe() }
        return true
    }

    /// What the account signed in with (settings → account shows them read-only).
    var email: String? { Auth.auth().currentUser?.email }
    var phoneNumber: String? { Auth.auth().currentUser?.phoneNumber }

    // MARK: - Language

    static let languageKey = "appLanguage"

    func setLanguage(_ language: Strings.Language) {
        Strings.shared.language = language
        UserDefaults.standard.set(language.rawValue, forKey: Self.languageKey)
        languageEpoch += 1
        // Pushes are written in the app's language.
        Task { await registerPush() }
    }

    // MARK: - Push

    /// The push registration on its way, if any.
    @ObservationIgnored private var pushSending: PushRegistration?

    /// This install gets the signed-in person's pushes (again whenever the token, the language or
    /// the app's version changes — and once a day; not on every launch, see PushRegistration).
    func registerPush() async {
        guard phase == .signedIn, let uid, let token = push.token else { return }
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        let wanted = PushRegistration(installationId: PushCenter.installationId, uid: uid, token: token,
                                      language: Strings.shared.language.rawValue, version: version)
        // Sent already today, as it is now: not again on every launch (nor twice at once —
        // a new token and a sign-in arrive together).
        guard !PushRegistration.isFresh(PushCenter.lastRegistration, wanted, now: .now), pushSending != wanted else { return }
        pushSending = wanted
        defer { pushSending = nil }
        do {
            try await pushAPI.register(installationId: wanted.installationId, token: token,
                                       language: Strings.shared.language, appVersion: version)
            if self.uid == uid { PushCenter.lastRegistration = wanted.encode(sentAt: .now) }
        } catch {
            #if DEBUG
            print("Push registration failed: \(error)")
            #endif
        }
    }

    // MARK: - Account deletion

    /// Schedules deletion; the server revokes every session, so sign out here
    /// too — and nothing of the account stays on the phone meanwhile. This
    /// install stops getting its pushes first, while the token is still good
    /// (after the revocation the server would refuse the request); should the
    /// scheduling fail, it registers again.
    func scheduleDeletion() async throws {
        PushCenter.lastRegistration = nil
        try? await pushAPI.unregister(installationId: PushCenter.installationId)
        do {
            try await account.scheduleDeletion()
        } catch {
            await registerPush()
            throw error
        }
        kept.removeAll()
        httpCache.use(account: nil)
        signedOutForDeletion = true
        signOut()
    }

    /// Cancels the scheduled deletion: the banner goes, from the kept account too.
    func cancelDeletion() async throws {
        try await account.cancelDeletion()
        deletionCancels.cancelled()
        // Not through the v1 client: its next GET /me asks the server, not the HTTP cache.
        noteOwnWrite()
        guard let uid, var current = me else { return }
        current.deletion = nil
        me = current
        kept.save(current, as: .me, uid: uid)
    }

    /// The current user's ID token; the SDK renews it before it expires.
    /// A forced refresh that fails for good (the account was deleted or its
    /// sessions revoked) signs the person out instead of leaving them stuck.
    nonisolated static func idToken(forceRefresh: Bool = false) async throws -> String? {
        guard let user = Auth.auth().currentUser else { return nil }
        do {
            return try await user.getIDTokenResult(forcingRefresh: forceRefresh).token
        } catch let error as NSError where forceRefresh && error.domain == AuthErrorDomain
            && [AuthErrorCode.userNotFound.rawValue, AuthErrorCode.userTokenExpired.rawValue,
                AuthErrorCode.invalidUserToken.rawValue, AuthErrorCode.userDisabled.rawValue].contains(error.code) {
            await MainActor.run { try? Auth.auth().signOut() }
            return nil
        }
    }

    private func apply(_ newUID: String?) {
        guard newUID != uid || phase == .restoring else { return }
        let wasRestoring = phase == .restoring
        let previous = uid
        uid = newUID
        // Only this account's answers are kept from now on: the last one's
        // (signed out, or switched from) go, HTTP cache and all.
        httpCache.use(account: newUID)
        kept.retainOnly(newUID)
        keptBlocked = newUID.flatMap { kept.value(.blocked, uid: $0) }.map(Set.init) ?? []
        foreground = ForegroundRefresh(last: .now)
        // Drawn until the API answers (the card box's header on a cold start).
        me = newUID.flatMap { kept.value(.me, uid: $0) }
        cardPreviews.clear()
        // Messages still on their way were the last account's.
        outboxes.clear()
        push.signedIn = newUID
        // The thought map belongs to the account too (kept between visits while it is signed in).
        thoughtMap = ThoughtMapStore(api: reading)
        profile = .unknown
        phase = newUID == nil ? .signedOut : .signedIn
        // An account this install has seen with a profile opens straight onto the tabs.
        land(newUID != nil && UserDefaults.standard.string(forKey: Self.profiledKey) == newUID ? .tabs : .pending)
        // The last account's listeners stop before anything of it is cleared off the device.
        notifications.stop()
        conversations.stop()
        // Signed out (deletion signs out too), or switched: what Firestore and the system kept of
        // the last account goes — the next one's listeners start once that is done.
        if previous != nil { PushCenter.lastRegistration = nil }
        let forgetting = previous.map { previous in Task { await Self.forget(previous) } }
        if let newUID {
            signedOutForDeletion = false
            Task { [weak self] in
                await forgetting?.value
                guard let self, self.uid == newUID else { return }
                notifications.start(uid: newUID)
                conversations.start(uid: newUID)
            }
            Task { await loadMe() }
            Task { await registerPush() }
        }
        #if DEBUG
        if wasRestoring { autoSignInForTesting() }
        #endif
    }

    /// What the device still holds of an account that signed out (or was
    /// switched from), beyond the API caches and the push registration's
    /// memo `apply` empties: Firestore's local cache (its messages,
    /// notifications and drafts), the pushes still in Notification Center and
    /// the badge, a backup the account exported, and the mark that it has a
    /// profile.
    nonisolated static func forget(_ uid: String) async {
        await FirebaseBootstrap.clearLocalData()
        let center = UNUserNotificationCenter.current()
        center.removeAllDeliveredNotifications()
        try? await center.setBadgeCount(0)
        let tmp = FileManager.default.temporaryDirectory
        for name in (try? FileManager.default.contentsOfDirectory(atPath: tmp.path)) ?? [] where name.hasPrefix(exportPrefix) {
            try? FileManager.default.removeItem(at: tmp.appending(path: name))
        }
        if UserDefaults.standard.string(forKey: profiledKey) == uid {
            UserDefaults.standard.removeObject(forKey: profiledKey)
        }
    }

    /// The name an exported backup starts with (settings → account).
    nonisolated static let exportPrefix = "resonance-backup-"

    #if DEBUG
    /// Emulator builds launched with `-email … -password …` sign that seeded
    /// account in on start (switching from whoever was restored), so screens
    /// can be checked without typing.
    private func autoSignInForTesting() {
        let defaults = UserDefaults.standard
        guard config.usesEmulator, let email = defaults.string(forKey: "email"),
              let password = defaults.string(forKey: "password"),
              Auth.auth().currentUser?.email?.lowercased() != email.lowercased() else { return }
        Task { await signIn(email: email, password: password) }
    }
    #endif

    /// Where a signed-in person lands. Reaching the tabs is when the app
    /// registers for pushes, if they are allowed already; asking waits for the
    /// first note, message or card published (`PushCenter.reachedOut`).
    private func land(_ next: Landing) {
        let arrived = next == .tabs && landing != .tabs
        landing = next
        if arrived, phase == .signedIn { Task { await push.registerIfAllowed() } }
    }

    /// The last account this install saw with a profile and its pen name (see `landing`).
    nonisolated static let profiledKey = "profiledAccount"

    /// Asks for the account's profile. A failure keeps whatever was known
    /// (the card box offers a retry); only the API's "no profile yet" sends
    /// the person to onboarding (`Landing.after`).
    func loadMe() async {
        guard let asked = uid else { return }
        let cancels = deletionCancels.count
        profile = .loading
        do {
            let found = try await profiles.me()
            // Signed out, or someone else signed in, while this was on its way.
            guard uid == asked else { return }
            if let found {
                adopt(deletionCancels.answer(found, asked: cancels))
            } else {
                me = nil
                kept.remove(.me, uid: asked)
                profile = .missing
                land(landing.after(.missing))
                if UserDefaults.standard.string(forKey: Self.profiledKey) == asked {
                    UserDefaults.standard.removeObject(forKey: Self.profiledKey)
                }
            }
        } catch {
            guard uid == asked else { return }
            profile = .failed((error as? APIFailure)?.message ?? error.localizedDescription)
            land(landing.after(.failed))
        }
    }

    /// A profile the API just returned (loaded, created in onboarding, saved
    /// in settings) becomes the session's, and the tabs open — or, while it
    /// has no pen name, onboarding, to choose one.
    func adopt(_ found: Components.Schemas.Me) {
        guard let uid, found.id == uid else { return }
        me = found
        kept.save(found, as: .me, uid: uid)
        profile = .loaded
        let answer = ProfileAnswer.of(found)
        land(landing.after(answer))
        // Only a named profile opens straight onto the tabs next time; one without waits for its answer.
        if answer == .found {
            UserDefaults.standard.set(uid, forKey: Self.profiledKey)
        } else if UserDefaults.standard.string(forKey: Self.profiledKey) == uid {
            UserDefaults.standard.removeObject(forKey: Self.profiledKey)
        }
    }

    // MARK: - Signing in

    func signInWithApple() async {
        await signIn {
            let nonce = AppleSignIn.randomNonce()
            let credential = try await self.apple.request(nonce: nonce)
            guard let token = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) }) else {
                throw SignInError.missingToken
            }
            let firebase = OAuthProvider.appleCredential(withIDToken: token, rawNonce: nonce, fullName: credential.fullName)
            _ = try await Auth.auth().signIn(with: firebase)
        }
    }

    func signInWithGoogle() async {
        await signIn {
            guard let presenter = UIApplication.shared.topViewController else { throw SignInError.noWindow }
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else { throw SignInError.missingToken }
            let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: result.user.accessToken.tokenString)
            _ = try await Auth.auth().signIn(with: credential)
        }
    }

    /// Email and password — only offered in emulator builds, for the seeded
    /// test accounts (the site itself signs in with Google or Apple).
    func signIn(email: String, password: String) async {
        await signIn { _ = try await Auth.auth().signIn(withEmail: email, password: password) }
    }

    func signOut() {
        let finish = {
            try? Auth.auth().signOut()
            GIDSignIn.sharedInstance.signOut()
        }
        guard Auth.auth().currentUser != nil else { return finish() }
        // This install stops getting the account's pushes: ask with the ID token
        // it still has (usually cached), then sign out without waiting for the answer.
        // By installation id, always — whether or not this launch has its push token
        // yet, the server may hold one from an earlier launch.
        let origin = config.origin
        Task {
            let token = try? await Self.idToken()
            finish()
            guard let token else { return }
            let api = PushAPI(client: ResonanceClient.make(APIConfiguration(origin: origin, idToken: { _ in token })))
            try? await api.unregister(installationId: PushCenter.installationId)
        }
    }

    private func signIn(_ work: @escaping () async throws -> Void) async {
        isSigningIn = true
        signInError = nil
        defer { isSigningIn = false }
        do {
            try await work()
        } catch where SignInError.isCancellation(error) {
            // The person closed the sheet; nothing to report.
        } catch {
            #if DEBUG
            print("Sign-in failed: \(error)")
            #endif
            signInError = L10n.Auth.signInError
        }
    }
}

/// A scheduled deletion cancelled here stays cancelled: an answer about the
/// account asked for before the cancel still names it, and is taken without it.
struct DeletionCancels {
    private(set) var count = 0

    mutating func cancelled() { count += 1 }

    /// `me` as the session takes it, from a request sent when `count` was `asked`.
    func answer(_ me: Components.Schemas.Me, asked: Int) -> Components.Schemas.Me {
        guard asked != count, me.deletion != nil else { return me }
        var me = me
        me.deletion = nil
        return me
    }
}

/// When the screens last asked the server for what they show. Coming back
/// to the foreground after `staleAfter`, or on a new UTC day (today's picks
/// change with it), they ask again.
struct ForegroundRefresh: Equatable {
    static let staleAfter: TimeInterval = 15 * 60

    let last: Date

    func isStale(at now: Date) -> Bool {
        now.timeIntervalSince(last) > Self.staleAfter || APICache.utcDay(now) != APICache.utcDay(last)
    }
}

enum SignInError: Error {
    case missingToken, noWindow

    static func isCancellation(_ error: Error) -> Bool {
        let e = error as NSError
        return (e.domain == "com.apple.AuthenticationServices.AuthorizationError" && e.code == 1001)
            || (e.domain == kGIDSignInErrorDomain && e.code == GIDSignInError.canceled.rawValue)
    }
}

extension UIApplication {
    /// The view controller to present system sign-in sheets from.
    var topViewController: UIViewController? {
        let window = connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
