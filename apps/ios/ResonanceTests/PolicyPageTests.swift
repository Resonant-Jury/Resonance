import DesignSystem
import UIKit
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
            == "https://resonance.channel/zh-TW/privacy")
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

@MainActor @Suite struct LinkWaveTests {
    private func layout(_ text: String, width: CGFloat) -> (NSLayoutManager, NSTextContainer, NSTextStorage) {
        let storage = NSTextStorage(string: text, attributes: [.font: UIFont.systemFont(ofSize: 17)])
        let lm = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        lm.addTextContainer(container)
        storage.addLayoutManager(lm)
        lm.ensureLayout(for: container)
        return (lm, container, storage)
    }

    @Test func aLinkOnOneLineGetsOneStroke() {
        let (lm, c, storage) = layout("see here now", width: 300)
        let f = LinkWaves.fragments(of: NSRange(location: 4, length: 4), layoutManager: lm, container: c)
        withExtendedLifetime(storage) {}
        #expect(f.count == 1)
        #expect(f[0].maxX > f[0].minX)
    }

    @Test func aWrappedLinkGetsAStrokeUnderEachLineAndNoneBeyondTheText() {
        let text = "a link that wraps across several lines of a narrow column"
        let (lm, c, storage) = layout(text, width: 90)
        let f = LinkWaves.fragments(of: NSRange(location: 2, length: text.count - 2), layoutManager: lm, container: c)
        withExtendedLifetime(storage) {}
        #expect(f.count >= 3)
        #expect(f.map(\.baseline) == f.map(\.baseline).sorted())
        #expect(Set(f.map(\.baseline)).count == f.count)
        #expect(f.allSatisfy { $0.minX >= 0 && $0.maxX <= 90.5 })
    }

    @Test func linksAreFoundByTheirAttribute() {
        let s = NSMutableAttributedString(string: "one two three")
        s.addAttribute(.link, value: URL(string: "https://example.com")!, range: NSRange(location: 4, length: 3))
        let found = LinkWaves.links(in: s)
        #expect(found.count == 1)
        #expect(found[0].range == NSRange(location: 4, length: 3))
    }
}
