import Foundation
import ResonanceKit
import Testing
@testable import Resonance

@Suite struct AppConfigTests {
    @Test func productionTalksToTheLiveSite() {
        #expect(AppConfig.production.origin.absoluteString == "https://resonance.channel")
        #expect(!AppConfig.production.usesEmulator)
        // The API, shared links and pushed paths all hang off the origin.
        #expect(APIConfiguration(origin: AppConfig.production.origin, idToken: { _ in nil }).apiURL.absoluteString
            == "https://resonance.channel/api/v1")
        #expect(AppConfig.production.origin.appending(path: "card/a-walk").absoluteString == "https://resonance.channel/card/a-walk")
        #expect(URL(string: "/messages/bob?note=n1&card=c1", relativeTo: AppConfig.production.origin)?.absoluteURL.absoluteString
            == "https://resonance.channel/messages/bob?note=n1&card=c1")
    }

    @Test func emulatorUsesTheLocalDevServer() {
        #expect(AppConfig.emulator.origin.absoluteString == "http://127.0.0.1:3100")
        #expect(AppConfig.emulator.usesEmulator)
    }
}
