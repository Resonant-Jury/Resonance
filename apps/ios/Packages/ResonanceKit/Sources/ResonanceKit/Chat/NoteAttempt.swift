import Foundation

/// The client id a note is sent under (the twin of Android's `NoteAttempt` and the web composer's
/// `attempt`). Pressing Send makes one; every send of the same words to the same card after that
/// one failed — the writer pressing Send again, or the token middleware sending the same request
/// again with a fresh token — goes under the same id, so the server finds a note whose answer was
/// lost instead of leaving it twice (and ringing its author twice, and spending a second of the
/// letter's notes). Other words, or another card, are another note with an id of their own; once a
/// note is left, the next one starts afresh.
///
/// One per composer; the words are compared trimmed, as they are sent.
@MainActor
public final class NoteAttempt {
    private struct Attempt {
        let cardId: String
        let text: String
        let clientId: String
    }

    private var current: Attempt?

    public init() {}

    /// The id to send `text` to `cardId` under: the unfinished attempt's own when these are its words, else a new one.
    public func clientId(cardId: String, text: String) -> String {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let current, current.cardId == cardId, current.text == words { return current.clientId }
        let id = Outbox.newClientId()
        current = Attempt(cardId: cardId, text: words, clientId: id)
        return id
    }

    /// The note sent under `clientId` was left: the next words, even the same ones, are a new note.
    public func sent(_ clientId: String) {
        if current?.clientId == clientId { current = nil }
    }

    /// Sends `text` to `cardId` through `deliver` under the attempt's id. The attempt ends only when
    /// `deliver` returns; a failure (or a cancellation, which may have reached the server too) keeps
    /// it for the retry.
    public func send<T>(cardId: String, text: String, _ deliver: (_ clientId: String) async throws -> T) async throws -> T {
        let id = clientId(cardId: cardId, text: text)
        let answer = try await deliver(id)
        sent(id)
        return answer
    }
}
