import Testing
@testable import ResonanceKit

/// What the foot of a thread offers: the composer, the wait for an answer to one's note, the
/// answer that connects, or nothing to write (the letter states).
@Suite struct ThreadAccessTests {
    @Test func connectedPeopleWriteAsUsualWhateverLetterWaits() {
        #expect(ThreadAccess.of(connected: true, blocked: false, requestFrom: nil, me: "alice") == .open)
        #expect(ThreadAccess.of(connected: true, blocked: false, requestFrom: "alice", me: "alice") == .open)
        #expect(ThreadAccess.of(connected: true, blocked: false, requestFrom: "bob", me: "alice") == .open)
    }

    @Test func aLetterLeftWaitingAppliesAgainOnceTheConnectionEnds() {
        // Connected by a resonance while a letter waits: the letter is ignored.
        #expect(ThreadAccess.of(connected: true, blocked: false, requestFrom: "alice", me: "alice").canWrite)
        // The resonance taken back, the connection gone: the letter's state is back, whoever wrote it.
        #expect(ThreadAccess.of(connected: false, blocked: false, requestFrom: "alice", me: "alice") == .awaitingReply)
        #expect(ThreadAccess.of(connected: false, blocked: false, requestFrom: "bob", me: "alice") == .replyToConnect)
    }

    @Test func untilItIsKnownTheComposerShows() {
        #expect(ThreadAccess.of(connected: nil, blocked: false, requestFrom: nil, me: "alice") == .open)
    }

    @Test func myNoteWaitsForTheirAnswer() {
        let access = ThreadAccess.of(connected: false, blocked: false, requestFrom: "alice", me: "alice")
        #expect(access == .awaitingReply)
        #expect(!access.canWrite)
    }

    @Test func theirNoteIsAnsweredFromTheComposer() {
        let access = ThreadAccess.of(connected: false, blocked: false, requestFrom: "bob", me: "alice")
        #expect(access == .replyToConnect)
        #expect(access.canWrite)
    }

    @Test func withoutALetterOrAcrossABlockThereIsNothingToWrite() {
        #expect(ThreadAccess.of(connected: false, blocked: false, requestFrom: nil, me: "alice") == .notConnected)
        #expect(ThreadAccess.of(connected: false, blocked: true, requestFrom: "bob", me: "alice") == .notConnected)
        #expect(ThreadAccess.of(connected: false, blocked: true, requestFrom: "alice", me: "alice") == .notConnected)
        #expect(ThreadAccess.of(connected: false, blocked: false, requestFrom: "bob", me: nil) == .notConnected)
        #expect(!ThreadAccess.notConnected.canWrite)
    }

    @Test func theLettersWriterIsReadFromTheConversation() {
        #expect(ThreadAccess.requestFrom(["request": ["from": "bob", "cardId": "walk", "count": 1]]) == "bob")
        #expect(ThreadAccess.requestFrom(["request": ["cardId": "walk"]]) == nil)
        #expect(ThreadAccess.requestFrom(["request": ["from": ""]]) == nil)
        #expect(ThreadAccess.requestFrom(["request": "bob"]) == nil)
        #expect(ThreadAccess.requestFrom(["unread": ["alice": 1]]) == nil)
        #expect(ThreadAccess.requestFrom(nil) == nil)
    }
}
