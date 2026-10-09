import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// The two push switches speak the contract: read with GET, flipped one at a time with PATCH —
/// only the switch flipped is sent, so the other stays as the server has it.
struct NotificationSettingsAPITests {
    func api(_ transport: StubTransport) -> NotificationSettingsAPI {
        NotificationSettingsAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport))
    }

    @Test func readsBothSwitches() async throws {
        let transport = StubTransport(body: #"{"picks":true,"connectionCards":false}"#)
        let settings = try await api(transport).settings()
        #expect(settings.picks && !settings.connectionCards)
        #expect(settings[.picks] && !settings[.connectionCards])
        let request = try #require(transport.requests.first)
        #expect(request.method == .get)
        #expect(request.bare.hasSuffix("/me/notifications"))
    }

    @Test func aFlipSendsThatSwitchAlone() async throws {
        let transport = StubTransport(body: #"{"picks":false,"connectionCards":true}"#)
        let saved = try await api(transport).set(.connectionCards, true)
        #expect(saved.connectionCards && !saved.picks)
        let request = try #require(transport.requests.first)
        #expect(request.method == .patch)
        #expect(request.bare.hasSuffix("/me/notifications"))
        let sent = try #require(transport.sentJSON.first ?? nil)
        #expect(sent.count == 1)
        #expect(sent["connectionCards"] as? Bool == true)

        _ = try await api(transport).set(.picks, false)
        let second = try #require(transport.sentJSON.last ?? nil)
        #expect(second.count == 1)
        #expect(second["picks"] as? Bool == false)
    }

    @Test func aRefusalIsAFailure() async throws {
        let transport = StubTransport(status: .badRequest, body: #"{"error":{"code":"invalid_request","message":"picks: Expected boolean"}}"#)
        await #expect(throws: APIFailure.self) { try await api(transport).set(.picks, true) }
        let unauthorized = StubTransport(status: .unauthorized, body: #"{"error":{"code":"unauthenticated","message":"Sign in first"}}"#)
        await #expect(throws: APIFailure.self) { try await api(unauthorized).settings() }
        let broken = StubTransport(status: .badGateway, body: "<html>")
        broken.contentType = "text/html"
        await #expect(throws: APIFailure.self) { try await api(broken).settings() }
    }
}
