import DesignSystem
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// A note that didn't go is said in the app's own words, never the server's (which are English),
/// as the web's composer says it; one the server refused isn't sent again on the same words.
@MainActor @Suite struct NoteFailureTests {
    @Test func aBlockIsTheSendErrorInTheReadersLanguageNeverTheServersWords() {
        let blocked = NoteFailure(APIFailure(code: "blocked", message: "You cannot send a note to this person.", status: 403))
        #expect(blocked.message == L10n.Messages.sendError)
        #expect(blocked.message != "You cannot send a note to this person.")
        #expect(blocked.refused)
        let noPenName = NoteFailure(APIFailure(code: "forbidden", message: "Choose a pen name first.", status: 403))
        #expect(noPenName.message == L10n.Messages.sendError)
    }

    @Test func threeNotesWaitingSayToWaitForTheReply() {
        let full = NoteFailure(APIFailure(code: "conflict", message: "Wait for their reply.", status: 409))
        #expect(full.message == L10n.Card.Note.waitForReply)
        #expect(full.refused)
    }

    @Test func aCardGoneSaysItCantBeFoundNotToTryAgain() {
        // Deleted (its notes with it) or hidden from the writer since: no retry reaches it.
        let gone = NoteFailure(APIFailure(code: "not_found", message: "No such card.", status: 404))
        #expect(gone.message == L10n.Card.NotFound.title)
        #expect(gone.message != L10n.Messages.sendError)
        #expect(gone.refused)
    }

    @Test func troubleOnTheWayIsARetryNotARefusal() {
        #expect(NoteFailure(APIFailure.unexpected(status: 502)) == NoteFailure(URLError(.notConnectedToInternet)))
        #expect(!NoteFailure(APIFailure.unexpected(status: 502)).refused)
        #expect(!NoteFailure(URLError(.timedOut)).refused)
        #expect(NoteFailure(URLError(.timedOut)).message == L10n.Messages.sendError)
    }

    @Test func aVerbWithoutAGlyphKeepsItsSizeWhileItWorks() {
        func size(_ button: OrganicButton) -> CGSize {
            UIHostingController(rootView: button.fixedSize()).sizeThatFits(in: CGSize(width: 400, height: 400))
        }
        let idle = size(OrganicButton(L10n.Card.Note.send, variant: .solid, size: .sm) {})
        let working = size(OrganicButton(L10n.Card.Note.send, variant: .solid, size: .sm) {}.working(true))
        #expect(idle.width > 20)
        #expect(abs(working.width - idle.width) < 0.5)
        #expect(abs(working.height - idle.height) < 0.5)
    }
}
