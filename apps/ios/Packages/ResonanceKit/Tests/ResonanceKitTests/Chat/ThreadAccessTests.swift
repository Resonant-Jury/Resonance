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

    @Test func anAnsweredLetterKeepsTheComposerUntilTheConnectionIsAskedAgain() {
        // Bob's letter waits; Alice answers it from the composer. The server connects the two and clears
        // the letter in one write, and the conversation says so before anything says they are connected.
        let before = ThreadAccess.of(connected: false, blocked: false, requestFrom: "bob", me: "alice")
        #expect(before == .replyToConnect)
        let after = ThreadAccess.afterLetter(connected: false, blocked: false, was: "bob", now: nil)
        #expect(after.reask)
        #expect(after.connected == nil)
        // Not "not connected" (which takes the composer away, and the keyboard with it): the composer stays.
        let access = ThreadAccess.of(connected: after.connected, blocked: false, requestFrom: nil, me: "alice")
        #expect(access != .notConnected)
        #expect(access.canWrite)
        // Bob's side of it: his letter answered, his composer comes while the connection is asked for.
        let writer = ThreadAccess.afterLetter(connected: false, blocked: false, was: "bob", now: nil)
        #expect(ThreadAccess.of(connected: writer.connected, blocked: false, requestFrom: nil, me: "bob") == .open)
    }

    @Test func otherLetterChangesLeaveWhatIsKnownAsItIs() {
        // Across a block nothing was answered: still nothing to write, asked again all the same.
        let blocked = ThreadAccess.afterLetter(connected: false, blocked: true, was: "bob", now: nil)
        #expect(blocked.connected == false && blocked.reask)
        // A letter arriving, or one waiting while they are connected (or not known yet): nothing to ask.
        #expect(ThreadAccess.afterLetter(connected: false, blocked: false, was: nil, now: "bob") == (false, false))
        #expect(ThreadAccess.afterLetter(connected: true, blocked: false, was: "bob", now: nil) == (true, false))
        #expect(ThreadAccess.afterLetter(connected: nil, blocked: false, was: "bob", now: nil) == (nil, false))
        #expect(ThreadAccess.afterLetter(connected: false, blocked: false, was: nil, now: nil) == (false, false))
    }

    @Test func theLiveConnectionsSpeakOverAKeptProfile() {
        // Connected a moment ago (an answered letter, a resonance): the live list knows before a kept profile does.
        #expect(ThreadAccess.connected(live: ["bob"], other: "bob", profile: false, blocked: false) == true)
        // A take-back: gone from the list, whatever the profile said.
        #expect(ThreadAccess.connected(live: [], other: "bob", profile: true, blocked: false) == false)
        // The list not read yet, or whom it is with not known: the profile's word.
        #expect(ThreadAccess.connected(live: nil, other: "bob", profile: true, blocked: false) == true)
        #expect(ThreadAccess.connected(live: ["bob"], other: nil, profile: nil, blocked: false) == nil)
        // Across a block, never.
        #expect(ThreadAccess.connected(live: ["bob"], other: "bob", profile: true, blocked: true) == false)
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
