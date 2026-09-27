import Foundation
import Testing
@testable import ResonanceKit

/// The app reads the web's catalogs (src/messages) directly; these tests load
/// the real files, so a catalog change that breaks the app's formatting fails here.
@Suite struct StringsTests {
    static let messages = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().appendingPathComponent("../../../../../../src/messages").standardized

    func strings(_ language: Strings.Language) -> Strings {
        let s = Strings(language: language)
        s.load(directory: Self.messages)
        return s
    }

    @Test func readsBothCatalogs() {
        #expect(strings(.zhTW).string("app.nav.home") == "共振 Feed")
        #expect(strings(.en).string("app.nav.home") != "app.nav.home")
    }

    @Test func fillsNamedArguments() {
        let s = strings(.zhTW)
        #expect(s.format("app.notifications.note", ["handle": "bob"]) == "bob 寄來一張小紙條")
    }

    @Test func picksPluralBranches() {
        let en = strings(.en)
        #expect(en.format("profile.cardCount", ["count": 0]) == "No public cards")
        #expect(en.format("profile.cardCount", ["count": 1]) == "1 public card")
        #expect(en.format("profile.cardCount", ["count": 12]) == "12 public cards")
        let zh = strings(.zhTW)
        #expect(zh.format("messages.searchCount", ["count": 0]) == "沒有符合的訊息")
        #expect(zh.format("messages.searchCount", ["count": 3]) == "3 則符合")
    }

    @Test func fallsBackToEnglishThenTheKey() {
        let s = strings(.zhTW)
        #expect(s.string("no.such.key") == "no.such.key")
    }

    @Test func mapsSystemLanguages() {
        #expect(Strings.Language.preferred(["zh-Hant-TW"]) == .zhTW)
        #expect(Strings.Language.preferred(["zh-Hans-CN"]) == .zhTW)
        #expect(Strings.Language.preferred(["ja-JP", "en-US"]) == .en)
        #expect(Strings.Language.preferred(["fr-FR"]) == .en)
    }

    @Test func everyCatalogEntryFormatsWithoutLeftoverBraces() {
        for language in Strings.Language.allCases {
            let s = strings(language)
            let url = Self.messages.appendingPathComponent("\(language.rawValue).json")
            let tree = try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
            for (key, pattern) in Strings.flatten(tree) {
                // Supply every argument the pattern names, as a number.
                var args: [String: any Sendable] = [:]
                for m in pattern.matches(of: /\{\s*([A-Za-z_]\w*)/) { args[String(m.1)] = 2 }
                let out = s.format(key, args)
                #expect(!out.contains("{") && !out.contains("}"), "\(language) \(key): \(out)")
            }
        }
    }
}
