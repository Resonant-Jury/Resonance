import Testing
@testable import Resonance

/// An anonymous card is public or its author's alone: never for connections, who would learn who
/// wrote it (the publish panel, and what publishing or saving sends).
@Suite struct AnonymousVisibilityTests {
    @Test func aConnectionsCardMadeAnonymousGoesPublic() {
        #expect(WriteModel.visibility("connections", anonymous: true) == "public")
    }

    @Test func publicAndPrivateStayAsChosen() {
        #expect(WriteModel.visibility("public", anonymous: true) == "public")
        #expect(WriteModel.visibility("private", anonymous: true) == "private")
    }

    @Test func aNamedCardKeepsAnyAudience() {
        for visibility in ["public", "connections", "private"] {
            #expect(WriteModel.visibility(visibility, anonymous: false) == visibility)
        }
    }
}
