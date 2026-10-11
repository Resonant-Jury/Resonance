import AuthenticationServices
import CryptoKit
import UIKit

/// Sign in with Apple, as an async call. Firebase needs the raw nonce and
/// Apple the SHA-256 of it, which binds the returned token to this request.
final class AppleSignIn: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<ASAuthorizationAppleIDCredential, Error>?

    /// Apple's sheet for the device's Apple ID. `scopes` are what a first authorization shares.
    func request(nonce: String?, scopes: [ASAuthorization.Scope] = [.fullName, .email]) async throws -> ASAuthorizationAppleIDCredential {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = scopes
        if let nonce {
            request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
        }
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    /// Apple's sheet once more, for a fresh authorization code to revoke the app's
    /// token with (``AppleTokenRevocation``); it asks nothing to be shared. `user` is
    /// the device's Apple ID — the `uid` Firebase keeps for an account's apple.com
    /// provider, when it is that account's.
    func authorize() async throws -> (user: String, code: String?) {
        let credential = try await request(nonce: nil, scopes: [])
        return (credential.user, credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) })
    }

    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in charset.randomElement(using: &generator)! })
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
            continuation?.resume(returning: credential)
        } else {
            continuation?.resume(throwing: SignInError.missingToken)
        }
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
}

/// An account that signs in with Apple has the app's Apple token revoked as it
/// schedules its deletion (App Store 5.1.1(v)), which takes Resonance off the
/// person's Apple ID; signing back in with Apple within the grace period still
/// works (Apple asks for consent again) and still cancels the deletion. Apple's
/// sheet asks once more for a fresh authorization code, which Firebase revokes
/// with Apple. It runs before the deletion is asked for, which revokes the
/// session the revocation is made with. The web does the same
/// (src/lib/auth/firebase/appleToken.ts); Android has no Sign in with Apple.
struct AppleTokenRevocation {
    /// The account's Apple ID (its apple.com provider's `uid`); nil when it doesn't sign in with Apple.
    let appleUser: String?
    /// Apple's sheet: the device's Apple ID and a fresh authorization code (``AppleSignIn/authorize()``).
    let authorize: () async throws -> (user: String, code: String?)
    /// Firebase revokes the token the code stands for.
    let revoke: (String) async throws -> Void

    /// Closing Apple's sheet throws `CancellationError`: nothing is to be scheduled.
    /// Any other failure is let go — the deletion is what the person asked for,
    /// and Apple's side must never stand in its way.
    func run() async throws {
        guard let appleUser else { return }
        let authorized: (user: String, code: String?)
        do {
            authorized = try await authorize()
        } catch where SignInError.isCancellation(error) {
            throw CancellationError()
        } catch {
            Self.note("Apple's sheet failed: \(error)")
            return
        }
        // The device's Apple ID isn't the account's (it signed in here another way):
        // its code would revoke the token of whoever that Apple ID signs in as.
        guard authorized.user == appleUser, let code = authorized.code else {
            Self.note(authorized.user == appleUser ? "Apple gave no authorization code" : "Not the account's Apple ID")
            return
        }
        do {
            try await revoke(code)
        } catch {
            Self.note("Revoking the Apple token failed: \(error)")
        }
    }

    private static func note(_ message: String) {
        #if DEBUG
        print("Apple token: \(message)")
        #endif
    }
}
