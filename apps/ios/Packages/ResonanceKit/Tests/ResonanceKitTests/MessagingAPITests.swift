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
        let json = try #require(transport.sentJSON.first ?? nil)
        #expect(json["cardId"] as? String == "walk")
        #expect(json["text"] as? String == "thank you")
        // No id given: the server makes one (an older build's send).
        #expect(json["clientId"] == nil)
    }

    @Test func aNoteGoesUnderTheWritersOwnId() async throws {
        // A resend is answered with the note already left, and says so: unknown fields are tolerated.
        let transport = StubTransport(status: .created, body: #"{"id":"AbCdEfGhIjKlMnOpQrSt","duplicate":true}"#)
        #expect(try await api(transport).sendNote(cardId: "walk", text: "thank you", clientId: "AbCdEfGhIjKlMnOpQrSt") == "AbCdEfGhIjKlMnOpQrSt")
        let json = try #require(transport.sentJSON.first ?? nil)
        #expect(json["clientId"] as? String == "AbCdEfGhIjKlMnOpQrSt")
    }

    @Test func sendsAMessageAndAnswersItsConversationAndId() async throws {
        let transport = StubTransport(status: .created, body: #"{"conversationId":"alice_bob","id":"m1"}"#)
        let sent = try await api(transport).sendMessage(to: "bob", text: "hi", noteRef: .init(cardId: "walk", noteId: "n1"))
        #expect(sent == MessagingAPI.Sent(conversationId: "alice_bob", id: "m1"))
        #expect(transport.requests.first?.path?.hasSuffix("/messages") == true)
        // Nothing to answer and no id of its own: neither field is sent.
        let json = try #require(transport.sentJSON.first ?? nil)
        #expect(json["replyTo"] == nil && json["clientId"] == nil)
        #expect((json["noteRef"] as? [String: String]) == ["cardId": "walk", "noteId": "n1"])
    }

    @Test func aReplyCarriesWhatItAnswersAndTheClientsId() async throws {
        let transport = StubTransport(status: .created, body: #"{"conversationId":"alice_bob","id":"Ab3dEf6hIj9lMn0pQr2t"}"#)
        let sent = try await api(transport).sendMessage(to: "bob", text: "agreed", replyTo: "m0", clientId: "Ab3dEf6hIj9lMn0pQr2t")
        #expect(sent.id == "Ab3dEf6hIj9lMn0pQr2t")
        let json = try #require(transport.sentJSON.first ?? nil)
        #expect(json["to"] as? String == "bob")
        #expect(json["text"] as? String == "agreed")
        #expect(json["replyTo"] as? String == "m0")
        #expect(json["clientId"] as? String == "Ab3dEf6hIj9lMn0pQr2t")
    }

    @Test func notesWaitingForAnAnswerAreAConflict() async throws {
        let transport = StubTransport(status: .conflict, body: #"{"error":{"code":"conflict","message":"Wait for them to reply."}}"#)
        let failure = await #expect(throws: APIFailure.self) { try await api(transport).sendNote(cardId: "walk", text: "a fourth note") }
        #expect(failure?.isConflict == true)
        #expect(failure?.status == 409)
    }

    @Test func aBlockIsAFailureWithItsMessage() async throws {
        let transport = StubTransport(status: .forbidden, body: #"{"error":{"code":"blocked","message":"You cannot message this person."}}"#)
        await #expect(throws: APIFailure(code: "blocked", message: "You cannot message this person.", status: 403)) {
            try await api(transport).sendMessage(to: "bob", text: "hi")
        }
    }
}
