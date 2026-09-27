import Testing
@testable import Resonance

@Suite struct AppConfigTests {
    @Test func productionTalksToTheLiveSite() {
        #expect(AppConfig.production.origin.absoluteString == "https://resonance-world.vercel.app")
        #expect(!AppConfig.production.usesEmulator)
    }

    @Test func emulatorUsesTheLocalDevServer() {
        #expect(AppConfig.emulator.origin.absoluteString == "http://127.0.0.1:3100")
        #expect(AppConfig.emulator.usesEmulator)
    }
}
