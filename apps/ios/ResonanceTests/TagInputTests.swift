import Foundation
import Testing
@testable import Resonance

/// The tag field's rules (TagField.tsx and its test), without a keyboard: separators, trimming,
/// repeats, and how the field breaks into lines. The twin of Android's TagInputTest and TagFlowTest.
@Suite struct TagInputTests {
    @Test func textWithoutASeparatorIsStillBeingTyped() {
        #expect(TagInput.split("travel").words.isEmpty)
        #expect(TagInput.split("travel").rest == "travel")
        #expect(TagInput.split("").rest == "")
    }

    @Test(arguments: ["travel,", "travel，", "travel、"])
    func aCommaOfEitherWidthOrTheEnumerationCommaEndsATag(_ typed: String) {
        let (words, rest) = TagInput.split(typed)
        #expect(words == ["travel"])
        #expect(rest == "")
    }

    @Test func whatFollowsTheLastSeparatorStaysToBeTypedOn() {
        #expect(TagInput.split("home,fa") == (["home"], "fa"))
        // A space after a separator is not part of the next word.
        #expect(TagInput.split("home,  fa") == (["home"], "fa"))
    }

    @Test func aPastedListSplitsInOneGo() {
        let (words, rest) = TagInput.split("home, travel，family、 ,memory")
        // Untrimmed and blanks included: merge is what cleans them.
        #expect(words == ["home", " travel", "family", " "])
        #expect(rest == "memory")
        #expect(TagInput.merge([], words) == ["home", "travel", "family"])
    }

    @Test func mergeTrimsAndSkipsBlanksAndRepeats() {
        #expect(TagInput.merge(["home"], [" travel ", "", "home", "family", "  ", "travel"]) == ["home", "travel", "family"])
    }

    @Test func mergeKeepsTheOrderTheyWereAdded() {
        #expect(TagInput.merge(["b"], ["a", "c"]) == ["b", "a", "c"])
    }

    @Test func nothingNewLeavesTheListAsItWas() {
        #expect(TagInput.merge(["a", "b"], ["b", " "]) == ["a", "b"])
    }

    // MARK: Lines (300 wide, gap 8, the input row at least 190)

    private func lines(_ pills: CGFloat...) -> [TagInput.Line] {
        TagInput.breakLines(pillWidths: pills, entryMin: 190, maxWidth: 300, gap: 8)
    }

    @Test func noTagsMeansTheInputRowAlone() {
        #expect(lines() == [.init(pills: 0, entry: true)])
    }

    @Test func theInputRowSharesTheLineWhenEnoughOfItIsLeft() {
        // 80 + 8 + 190 = 278 <= 300
        #expect(lines(80) == [.init(pills: 1, entry: true)])
    }

    @Test func theInputRowGoesDownWhenLessThanItsLeastIsLeft() {
        // 100 + 8 + 190 = 298 fits the 300; 120 + 8 + 190 = 318 does not.
        #expect(lines(100) == [.init(pills: 1, entry: true)])
        #expect(lines(120) == [.init(pills: 1, entry: false), .init(pills: 0, entry: true)])
    }

    @Test func pillsWrapAsWordsDo() {
        // 140 + 8 + 140 = 288 fits one line; the third starts the next, and the input row below it.
        #expect(lines(140, 140, 140) == [.init(pills: 2, entry: false), .init(pills: 1, entry: false), .init(pills: 0, entry: true)])
    }

    @Test func theLastLineKeepsItsPillsAndTheInputWhenTheyFit() {
        // Line 1: 140 + 8 + 140; line 2: 60, then the input row (60 + 8 + 190 = 258).
        #expect(lines(140, 140, 60) == [.init(pills: 2, entry: false), .init(pills: 1, entry: true)])
    }

    @Test func aPillWiderThanTheFieldSitsAlone() {
        #expect(lines(400, 50) == [.init(pills: 1, entry: false), .init(pills: 1, entry: true)])
    }

    @Test func everyPillIsOnExactlyOneLineAndTheInputRowEndsTheLast() {
        let result = lines(70, 90, 110, 60, 130, 80, 100)
        #expect(result.map(\.pills).reduce(0, +) == 7)
        #expect(result.filter(\.entry).count == 1)
        #expect(result.last?.entry == true)
    }
}
