import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// The push registration speaks the contract: the install id in the path, 204 back.
struct PushAPITests {
    func api(_ transport: StubTransport) -> PushAPI {
        PushAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport))
    }

    @Test func registersThisInstall() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).register(installationId: "3F2A-install", token: "fcm-token", language: .zhTW, appVersion: "2.0.0")
        let request = try #require(transport.requests.first)
        #expect(request.method == .put)
        #expect(request.path?.hasSuffix("/me/devices/3F2A-install") == true)
    }

    @Test func unregistersOnSignOut() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).unregister(installationId: "3F2A-install")
        #expect(transport.requests.first?.method == .delete)
    }

    @Test func aRefusalIsAFailure() async throws {
        let transport = StubTransport(status: .badRequest, body: #"{"error":{"code":"invalid_request","message":"Not a valid installation id."}}"#)
        await #expect(throws: APIFailure.self) { try await api(transport).unregister(installationId: "x") }
    }
}

/// A launch doesn't send the same push registration again: only a change (who,
/// the token, the language, the version, the install) or a day gone by sends
/// it — and nothing kept (signed out, a first run) always does.
struct PushRegistrationTests {
    let sent = PushRegistration(installationId: "install-1", uid: "alice", token: "fcm-token", language: "zh-TW", version: "2.0.0")
    let at = Date(timeIntervalSince1970: 1_000_000_000)
    var kept: String { sent.encode(sentAt: at) }

    @Test func theSameRegistrationIsntSentAgainTheSameDay() {
        #expect(PushRegistration.isFresh(kept, sent, now: at.addingTimeInterval(60)))
        #expect(PushRegistration.isFresh(kept, sent, now: at.addingTimeInterval(PushRegistration.ttl - 1)))
    }

    @Test func aDayLaterItIsSentAgain() {
        #expect(!PushRegistration.isFresh(kept, sent, now: at.addingTimeInterval(PushRegistration.ttl)))
        // A clock set back counts as stale too.
        #expect(!PushRegistration.isFresh(kept, sent, now: at.addingTimeInterval(-1)))
    }

    @Test func anyChangeSendsItAgain() {
        let now = at.addingTimeInterval(60)
        let changed = [
            PushRegistration(installationId: "install-2", uid: "alice", token: "fcm-token", language: "zh-TW", version: "2.0.0"),
            PushRegistration(installationId: "install-1", uid: "bob", token: "fcm-token", language: "zh-TW", version: "2.0.0"),
            PushRegistration(installationId: "install-1", uid: "alice", token: "fcm-token-2", language: "zh-TW", version: "2.0.0"),
            PushRegistration(installationId: "install-1", uid: "alice", token: "fcm-token", language: "en", version: "2.0.0"),
            PushRegistration(installationId: "install-1", uid: "alice", token: "fcm-token", language: "zh-TW", version: "2.0.1"),
        ]
        for registration in changed { #expect(!PushRegistration.isFresh(kept, registration, now: now)) }
    }

    @Test func nothingKeptAlwaysSends() {
        #expect(!PushRegistration.isFresh(nil, sent, now: at))
        #expect(!PushRegistration.isFresh("", sent, now: at))
        #expect(!PushRegistration.isFresh("garbage", sent, now: at))
    }
}
