import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// Notes and messages go through the contract; the server's refusals surface as APIFailure.
struct MessagingAPITests {
    func api(_ transport: StubTransport) -> MessagingAPI {
        MessagingAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport))
    }

    @Test func sendsANoteToTheCard() async throws {
        let transport = StubTransport(status: .created, body: #"{"id":"n1"}"#)
        #expect(try await api(transport).sendNote(cardId: "walk", text: "thank you") == "n1")
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path?.hasSuffix("/notes") == true)
    }

    @Test func sendsAMessageAndAnswersItsConversation() async throws {
        let transport = StubTransport(status: .created, body: #"{"conversationId":"alice_bob","id":"m1"}"#)
        let id = try await api(transport).sendMessage(to: "bob", text: "hi", noteRef: .init(cardId: "walk", noteId: "n1"))
        #expect(id == "alice_bob")
        #expect(transport.requests.first?.path?.hasSuffix("/messages") == true)
    }

    @Test func notesWaitingForAnAnswerAreAConflict() async throws {
        let transport = StubTransport(status: .conflict, body: #"{"error":{"code":"conflict","message":"Wait for them to reply."}}"#)
        let failure = await #expect(throws: APIFailure.self) { try await api(transport).sendNote(cardId: "walk", text: "a fourth note") }
        #expect(failure?.isConflict == true)
        #expect(failure?.status == 409)
    }

    @Test func aBlockIsAFailureWithItsMessage() async throws {
        let transport = StubTransport(status: .forbidden, body: #"{"error":{"code":"blocked","message":"You cannot message this person."}}"#)
        await #expect(throws: APIFailure.self) { try await api(transport).sendMessage(to: "bob", text: "hi") }
    }
}
