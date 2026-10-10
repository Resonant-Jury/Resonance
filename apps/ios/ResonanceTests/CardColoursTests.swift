import DesignSystem
import Foundation
import Testing

/// No two neighbouring cards share a colour family (round 5 B3): the web's `cardPalettes`
/// (src/lib/design/cardColours.ts) as pinned by native/fixtures/card-colours.json, which the web
/// and Android run too — same list, same colours, on every platform.
@Suite struct CardColoursTests {
    struct Fixture: Decodable {
        struct Case: Decodable {
            let id: String
            let accentHues: [Double?]
            let palettes: [Int]
            let pages: [Int]?
            let columns: Int?
        }
        let hues: [Double]
        let window: Int
        let order: [[Int]]
        let cases: [Case]
    }

    static let fixture: Fixture = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../native/fixtures/card-colours.json").standardized
        return try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }()

    @Test func theTablesAreTheWebs() {
        #expect(CardPalette.hues == Self.fixture.hues)
        #expect(CardPalette.window == Self.fixture.window)
        #expect(CardPalette.order == Self.fixture.order)
    }

    @Test(arguments: CardColoursTests.fixture.cases.map(\.id))
    func everyCaseColoursAsTheWeb(_ id: String) throws {
        let c = try #require(Self.fixture.cases.first { $0.id == id })
        let got = CardPalette.palettes(c.accentHues)
        #expect(got == c.palettes, "case \(id)")
        // No four in a row share a family: one, two and three columns keep neighbours apart.
        for i in got.indices {
            for j in max(0, i - CardPalette.window)..<i { #expect(got[i] != got[j], "case \(id) at \(i)") }
        }
        // Pages loaded one after another: every prefix colours as the whole list (nothing recoloured).
        if let pages = c.pages {
            var end = 0
            for page in pages {
                end += page
                #expect(CardPalette.palettes(Array(c.accentHues.prefix(end))) == Array(c.palettes.prefix(end)), "case \(id) to \(end)")
            }
        }
        // As a row-major grid: no row shares a family, nor a card and the one above it.
        if let n = c.columns {
            for i in got.indices {
                if i % n > 0 { #expect(got[i] != got[i - 1]) }
                if i >= n { #expect(got[i] != got[i - n]) }
            }
        }
    }

    @Test func aCardDrawnByItsFamilyWearsThatFamily() {
        for family in 0..<6 {
            #expect(CardPalette(index: family).hue == CardPalette.hues[family])
        }
        // Without a list, a card keeps its own preference: the cover's nearest family, else its position's.
        #expect(CardPalette(accentHue: 215, position: 3).index == 4)
        #expect(CardPalette(accentHue: nil, position: 7).index == 1)
    }
}
