import Foundation
import ResonanceAPI

/// Notes and messages — the writes that reach another person, so they go
/// through the server (POST /api/v1/notes, /api/v1/messages), which re-checks
/// connections and blocks and rings the right bell. Reading conversations is
/// the participants' own data and stays a live Firestore listener.
public struct MessagingAPI: Sendable {
    let client: Client

    public init(client: Client) {
        self.client = client
    }

    /// A note to a card's author (the server finds the author); returns its id.
    public func sendNote(cardId: String, text: String) async throws -> String {
        switch try await client.sendNote(body: .json(.init(cardId: cardId, text: text))) {
        case let .created(r): return try r.body.json.id
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// The note a message answers.
    public struct NoteRef: Sendable, Equatable, Hashable {
        public let cardId: String
        public let noteId: String
        public init(cardId: String, noteId: String) {
            self.cardId = cardId
            self.noteId = noteId
        }
    }

    /// A message to someone you're connected with; returns the conversation's id.
    @discardableResult
    public func sendMessage(to userId: String, text: String, cardRef: String? = nil, noteRef: NoteRef? = nil) async throws -> String {
        let body = Components.Schemas.SendMessageRequest(
            to: userId, text: text, cardRef: cardRef,
            noteRef: noteRef.map { .init(value1: .init(cardId: $0.cardId, noteId: $0.noteId)) })
        switch try await client.sendMessage(body: .json(body)) {
        case let .created(r): return try r.body.json.conversationId
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}
