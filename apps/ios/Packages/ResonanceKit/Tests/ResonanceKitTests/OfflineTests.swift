import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import ResonanceAPI
@testable import ResonanceKit

/// Whether a failed request was the phone being offline, as a screen sees the error: wrapped by
/// the generated client — and never a server's answer, whatever it was.
@Suite struct OfflineTests {
    /// A transport that never reaches the server.
    struct Unreachable: ClientTransport {
        let code: URLError.Code
        func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
            throw URLError(code)
        }
    }

    private func feedError(_ transport: some ClientTransport) async -> Error? {
        let client = Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport)
        do {
            _ = try await ReadingAPI(client: client).feed()
            return nil
        } catch {
            return error
        }
    }

    @Test func noNetworkIsOfflineThroughTheGeneratedClient() async throws {
        for code: URLError.Code in [.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed] {
            let error = try #require(await feedError(Unreachable(code: code)))
            #expect(APIFailure.isOffline(error))
        }
        #expect(APIFailure.isOffline(URLError(.notConnectedToInternet)))
    }

    @Test func aServerThatAnsweredOrTimedOutIsNot() async throws {
        let timedOut = try #require(await feedError(Unreachable(code: .timedOut)))
        #expect(!APIFailure.isOffline(timedOut))
        let answered = try #require(await feedError(StubTransport(status: .badGateway, body: "<html>")))
        #expect(!APIFailure.isOffline(answered))
        #expect(!APIFailure.isOffline(APIFailure.unexpected(status: 502)))
        #expect(!APIFailure.isOffline(CancellationError()))
    }
}
