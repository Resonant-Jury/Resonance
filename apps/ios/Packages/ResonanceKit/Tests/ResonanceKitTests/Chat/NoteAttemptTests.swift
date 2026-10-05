import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// A note is sent under one client id from the first press of Send until it is left: a retry of
/// the same words (by hand, or the request sent again for a fresh token) reuses it, so the server
/// can tell a note whose answer was lost from a second one; other words, another card, or the next
/// note after one was left get ids of their own. (Android's NoteAttemptTest, the web composer's.)
@MainActor @Suite struct NoteAttemptTests {
    private static let contract = try! Regex("^[A-Za-z0-9_-]{16,64}$")

    private func api(_ transport: some ClientTransport, token: @escaping @Sendable (Bool) async throws -> String? = { _ in "token" }) -> MessagingAPI {
        MessagingAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport,
                                    middlewares: [BearerAuthMiddleware(idToken: token)]))
    }

    @Test func aRetryOfTheSameWordsGoesUnderTheSameIdUntilTheNoteIsLeft() async throws {
        let attempt = NoteAttempt()
        let transport = StubTransport(status: .internalServerError, body: #"{"error":{"code":"internal","message":"Something went wrong."}}"#)
        let messaging = api(transport)
        func send(_ text: String) async throws -> String {
            try await attempt.send(cardId: "walk", text: text) { id in
                try await messaging.sendNote(cardId: "walk", text: text.trimmingCharacters(in: .whitespacesAndNewlines), clientId: id)
            }
        }
        func sentClientId(_ at: Int) throws -> String { try #require(transport.sentJSON[at]?["clientId"] as? String) }

        // The server's trouble: the note may or may not have been left.
        await #expect(throws: APIFailure.self) { try await send("Your story stayed with me.") }
        let first = try sentClientId(0)
        #expect(first.wholeMatch(of: Self.contract) != nil)

        // Sent again by hand — with a stray space the field kept, still the same words.
        transport.status = .created
        transport.body = #"{"id":"\#(first)","duplicate":true}"#
        #expect(try await send("Your story stayed with me. ") == first)
        #expect(try sentClientId(1) == first)

        // Left: the same words sent once more are a second note, by the writer's own choice.
        transport.body = #"{"id":"n2"}"#
        _ = try await send("Your story stayed with me.")
        let second = try sentClientId(2)
        #expect(second != first)
        #expect(second.wholeMatch(of: Self.contract) != nil)
    }

    @Test func otherWordsOrAnotherCardAreAnotherNote() {
        let attempt = NoteAttempt()
        let first = attempt.clientId(cardId: "walk", text: "thank you")
        #expect(attempt.clientId(cardId: "walk", text: "  thank you\n") == first)
        let edited = attempt.clientId(cardId: "walk", text: "thank you so much")
        #expect(edited != first)
        // Going back to the first words after editing is not a retry of the first send any more.
        #expect(attempt.clientId(cardId: "walk", text: "thank you") != edited)
        let elsewhere = attempt.clientId(cardId: "sea", text: "thank you")
        #expect(attempt.clientId(cardId: "sea", text: "thank you") == elsewhere)
        #expect(attempt.clientId(cardId: "walk", text: "thank you") != elsewhere)
    }

    @Test func aFailureThatNeverReachedTheServerKeepsTheIdToo() async throws {
        let attempt = NoteAttempt()
        var ids: [String] = []
        await #expect(throws: URLError.self) {
            try await attempt.send(cardId: "walk", text: "hi") { id in
                ids.append(id)
                throw URLError(.notConnectedToInternet)
            }
        }
        // A refusal (three notes waiting for an answer) keeps it as well: nothing was left under it.
        await #expect(throws: APIFailure.self) {
            try await attempt.send(cardId: "walk", text: "hi") { id in
                ids.append(id)
                throw APIFailure(code: "conflict", message: "Wait for them to reply.", status: 409)
            }
        }
        try await attempt.send(cardId: "walk", text: "hi") { ids.append($0) }
        #expect(Set(ids).count == 1)
        try await attempt.send(cardId: "walk", text: "hi") { ids.append($0) }
        #expect(Set(ids).count == 2)
    }

    @Test func aCancelledSendKeepsTheIdForTheRetry() async throws {
        let attempt = NoteAttempt()
        var ids: [String] = []
        await #expect(throws: CancellationError.self) {
            try await attempt.send(cardId: "walk", text: "hi") { id in
                ids.append(id)
                throw CancellationError()
            }
        }
        try await attempt.send(cardId: "walk", text: "hi") { ids.append($0) }
        #expect(ids.count == 2 && Set(ids).count == 1)
    }

    @Test func aRequestSentAgainForAFreshTokenCarriesTheSameId() async throws {
        let attempt = NoteAttempt()
        // The token was refused (revoked): the middleware refreshes it and sends the same request again.
        let transport = Answers([(.unauthorized, #"{"error":{"code":"unauthenticated","message":"Sign in."}}"#), (.created, #"{"id":"n1"}"#)])
        let messaging = api(transport) { refresh in refresh ? "fresh" : "token" }
        _ = try await attempt.send(cardId: "walk", text: "hi") { id in try await messaging.sendNote(cardId: "walk", text: "hi", clientId: id) }
        let sent = transport.sent
        #expect(sent.map(\.authorization) == ["Bearer token", "Bearer fresh"])
        let ids = sent.map { $0.json?["clientId"] as? String }
        #expect(ids[0] != nil && ids[0] == ids[1])
        #expect(sent[0].json?["text"] as? String == "hi" && sent[1].json?["text"] as? String == "hi")
    }
}

/// Answers each request with the next canned status and body, and records what was sent.
private final class Answers: ClientTransport, @unchecked Sendable {
    struct Sent {
        let authorization: String?
        let json: [String: Any]?
    }

    private let lock = NSLock()
    private var answers: [(HTTPResponse.Status, String)]
    private var _sent: [Sent] = []
    var sent: [Sent] { lock.withLock { _sent } }

    init(_ answers: [(HTTPResponse.Status, String)]) {
        self.answers = answers
    }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        var json: [String: Any]?
        if let body { json = try JSONSerialization.jsonObject(with: try await Data(collecting: body, upTo: 1 << 20)) as? [String: Any] }
        let (status, text) = lock.withLock {
            _sent.append(Sent(authorization: request.headerFields[.authorization], json: json))
            return answers.removeFirst()
        }
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, HTTPBody(text))
    }
}
