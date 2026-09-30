import DesignSystem
import ResonanceKit
import Testing
@testable import Resonance

@MainActor @Suite struct PolicyPageTests {
    @Test func linksMirrorTheWebsTermsSection() {
        // SettingsClient: privacy, terms, contact → /{locale}/{privacy|terms|support}.
        #expect(PolicyPage.allCases.map { $0.path(.zhTW) } == ["/zh-TW/privacy", "/zh-TW/terms", "/zh-TW/support"])
        #expect(PolicyPage.allCases.map { $0.path(.en) } == ["/en/privacy", "/en/terms", "/en/support"])
    }

    @Test func pagesLiveOnTheConfiguredOrigin() {
        #expect(PolicyPage.privacy.url(origin: AppConfig.production.origin, language: .zhTW).absoluteString
            == "https://resonance-world.vercel.app/zh-TW/privacy")
        #expect(PolicyPage.support.url(origin: AppConfig.emulator.origin, language: .en).absoluteString
            == "http://127.0.0.1:3100/en/support")
    }

    @Test func settingsListKeepsTheWebsOrderAndRuleSeeds() {
        // The web list is profile, account, privacy, language, appearance, terms, delete;
        // the rule above a row is seeded from its index there (40 + i * 6).
        #expect(SettingsSection.allCases == [.profile, .account, .privacy, .language, .terms, .delete])
        #expect(SettingsSection.allCases.map(\.webIndex) == [0, 1, 2, 3, 5, 6])
    }
}

@MainActor @Suite struct OrganicLinkMetricsTests {
    /// The web's inline-block link is 21pt tall for DM Sans 16 and 23.5pt when
    /// the label is Han text (settings → Terms in 繁體中文, measured in Chrome).
    @Test func linkBoxIsTheCSSLineBox() {
        #expect(abs(AppFonts.normalLineBox(.body, size: 16, text: "Privacy") - 20.8) < 0.3)
        #expect(abs(AppFonts.normalLineBox(.body, size: 16, text: "隱私政策") - 23.5) < 0.3)
        #expect(abs(AppFonts.normalLineBox(.body, size: 16, text: "Terms 條款") - 23.5) < 0.3)
    }
}
