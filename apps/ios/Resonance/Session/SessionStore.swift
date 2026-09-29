import FirebaseAuth
import GoogleSignIn
import Observation
import ResonanceAPI
import ResonanceKit
import UIKit

/// Who is signed in, and their profile as the API sees it.
///
/// Firebase Auth owns the sign-in state (it persists across launches and
/// refreshes the ID token); every API call asks it for a fresh token.
@Observable
final class SessionStore {
    enum Phase: Equatable { case restoring, signedOut, signedIn }
    enum ProfileState: Equatable { case unknown, loading, loaded, missing, failed(String) }

    private(set) var phase: Phase = .restoring
    private(set) var uid: String?
    private(set) var me: Components.Schemas.Me?
    private(set) var profile: ProfileState = .unknown
    private(set) var isSigningIn = false
    var signInError: String?

    /// When a scheduled account deletion will run (the undo banner shows until then).
    private(set) var deletionDate: Date?
    /// Set when the app signed the person out because they scheduled deletion.
    private(set) var signedOutForDeletion = false
    /// Bumped when the interface language changes, so the whole UI re-renders.
    private(set) var languageEpoch = 0

    let config: AppConfig
    let api: Client
    let account: AccountAPI
    let writing: WritingAPI
    let notifications = NotificationsStore()
    let conversations = ConversationsStore()
    @ObservationIgnored private var listener: AuthStateDidChangeListenerHandle?
    @ObservationIgnored private let apple = AppleSignIn()

    init(config: AppConfig) {
        self.config = config
        let configuration = APIConfiguration(origin: config.origin, idToken: { force in try await Self.idToken(forceRefresh: force) })
        api = ResonanceClient.make(configuration)
        account = AccountAPI(configuration)
        writing = WritingAPI(client: api, configuration: configuration)
        if let saved = UserDefaults.standard.string(forKey: Self.languageKey), let language = Strings.Language(rawValue: saved) {
            Strings.shared.language = language
        }
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            MainActor.assumeIsolated { self?.apply(user?.uid) }
        }
    }

    var reading: ReadingAPI { ReadingAPI(client: api) }
    var safety: SafetyService? { uid.map(SafetyService.init(uid:)) }
    var bookmarks: BookmarkService? { uid.map(BookmarkService.init(uid:)) }
    var drafts: DraftService? { uid.map(DraftService.init(uid:)) }
    var hints: HintService? { uid.map(HintService.init(uid:)) }
    var messaging: MessagingAPI { MessagingAPI(client: api) }
    /// What the account signed in with (settings → account shows them read-only).
    var email: String? { Auth.auth().currentUser?.email }
    var phoneNumber: String? { Auth.auth().currentUser?.phoneNumber }

    // MARK: - Language

    static let languageKey = "appLanguage"

    func setLanguage(_ language: Strings.Language) {
        Strings.shared.language = language
        UserDefaults.standard.set(language.rawValue, forKey: Self.languageKey)
        languageEpoch += 1
    }

    // MARK: - Account deletion

    func refreshDeletion() async {
        deletionDate = try? await account.deletion()
    }

    /// Schedules deletion; the server revokes every session, so sign out here too.
    func scheduleDeletion() async throws {
        try await account.scheduleDeletion()
        signedOutForDeletion = true
        signOut()
    }

    func cancelDeletion() async throws {
        try await account.cancelDeletion()
        deletionDate = nil
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
        uid = newUID
        me = nil
        profile = .unknown
        phase = newUID == nil ? .signedOut : .signedIn
        deletionDate = nil
        if let newUID {
            signedOutForDeletion = false
            notifications.start(uid: newUID)
            conversations.start(uid: newUID)
            Task {
                await loadMe()
                await refreshDeletion()
            }
        } else {
            notifications.stop()
            conversations.stop()
        }
        #if DEBUG
        if wasRestoring { autoSignInForTesting() }
        #endif
    }

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

    func loadMe() async {
        profile = .loading
        do {
            switch try await api.getMe() {
            case let .ok(response):
                me = try response.body.json
                profile = .loaded
            case .notFound:
                profile = .missing
            case let .unauthorized(response):
                profile = .failed(APIFailure(try response.body.json, status: 401).message)
            case let .undocumented(status, _):
                profile = .failed(APIFailure.unexpected(status: status).message)
            }
        } catch {
            profile = .failed(error.localizedDescription)
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
        try? Auth.auth().signOut()
        GIDSignIn.sharedInstance.signOut()
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
