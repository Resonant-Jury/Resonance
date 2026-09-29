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
