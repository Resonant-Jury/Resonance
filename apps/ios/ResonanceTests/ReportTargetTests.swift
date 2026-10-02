import ResonanceKit
import Testing
@testable import Resonance

/// Every report goes through the server: a card by its own route, a person
/// or a message (or a whole conversation) through POST /api/v1/reports.
@MainActor @Suite struct ReportTargetTests {
    @Test func aPersonOrAMessageIsFiledAsTheContractNamesIt() {
        #expect(SafetyService.Target.user(id: "mallory").reportTarget == .person("mallory"))
        #expect(SafetyService.Target.message(id: "m7", senderId: "mallory", conversationId: "alice_mallory").reportTarget
            == .message("m7", conversationId: "alice_mallory"))
        // The thread's menu reports the conversation itself: its own id as the message's.
        #expect(SafetyService.Target.message(id: "alice_mallory", senderId: "mallory", conversationId: "alice_mallory").reportTarget
            == .conversation("alice_mallory"))
        #expect(SafetyService.Target.card(id: "c1", authorId: nil).reportTarget == nil)
    }
}
