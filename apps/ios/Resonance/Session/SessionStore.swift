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

    let config: AppConfig
    let api: Client
    @ObservationIgnored private var listener: AuthStateDidChangeListenerHandle?
    @ObservationIgnored private let apple = AppleSignIn()

    init(config: AppConfig) {
        self.config = config
        api = ResonanceClient.make(APIConfiguration(origin: config.origin, idToken: { try await Self.idToken() }))
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            MainActor.assumeIsolated { self?.apply(user?.uid) }
        }
    }

    /// The current user's ID token; the SDK refreshes it when it is about to expire.
    nonisolated static func idToken() async throws -> String? {
        guard let user = Auth.auth().currentUser else { return nil }
        return try await user.getIDToken()
    }

    private func apply(_ newUID: String?) {
        guard newUID != uid || phase == .restoring else { return }
        let wasRestoring = phase == .restoring
        uid = newUID
        me = nil
        profile = .unknown
        phase = newUID == nil ? .signedOut : .signedIn
        if newUID != nil { Task { await loadMe() } }
        #if DEBUG
        if wasRestoring, newUID == nil { autoSignInForTesting() }
        #endif
    }

    #if DEBUG
    /// Emulator builds launched with `-email … -password …` sign that seeded
    /// account in on start, so screens can be checked without typing.
    private func autoSignInForTesting() {
        let defaults = UserDefaults.standard
        guard config.usesEmulator, let email = defaults.string(forKey: "email"),
              let password = defaults.string(forKey: "password") else { return }
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
