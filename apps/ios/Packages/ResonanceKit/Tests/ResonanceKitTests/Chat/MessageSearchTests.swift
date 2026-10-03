import Foundation
import Testing
@testable import ResonanceKit

/// Searching the thread: phrases, case, full-width letters, Chinese, where the matches sit, newest
/// first — and what a result shows of a long message (the same cases as Android's
/// MessageSearchTest and SearchSnippetTest).
@Suite struct MessageSearchTests {
    func message(_ id: String, _ text: String, at: Double = 0) -> ChatMessage {
        ChatMessage(id: id, senderId: "alice", text: text, sentAt: Date(timeIntervalSince1970: at))
    }

    func r(_ location: Int, _ length: Int) -> NSRange { NSRange(location: location, length: length) }

    @Test func findsEveryOccurrenceWithItsRangeAsWritten() {
        let hits = MessageSearch.find([message("a", "Coffee or coffee? COFFEE!")], query: "coffee")
        #expect(hits == [SearchHit(messageId: "a", ranges: [r(0, 6), r(10, 6), r(18, 6)])])
    }

    @Test func newestMessageFirst() {
        let messages = [message("old", "hello there", at: 1), message("mid", "no match", at: 2), message("new", "say hello", at: 3)]
        #expect(MessageSearch.find(messages, query: "hello").map(\.messageId) == ["new", "old"])
    }

    @Test func fullWidthAndPlainAsciiMatchEachOther() {
        // A CJK keyboard types full-width letters and digits.
        let full = "ＡＢＣ１２"
        #expect(MessageSearch.find([message("a", "see abc12")], query: full) == [SearchHit(messageId: "a", ranges: [r(4, 5)])])
        #expect(MessageSearch.find([message("a", full + " is here")], query: "abc12") == [SearchHit(messageId: "a", ranges: [r(0, 5)])])
    }

    @Test func anIdeographicSpaceIsASpace() {
        #expect(MessageSearch.find([message("a", "good\u{3000}morning")], query: "good morning") == [SearchHit(messageId: "a", ranges: [r(0, 12)])])
    }

    @Test func findsChineseText() {
        let hits = MessageSearch.find([message("a", "今天的共振很好，共振真的好")], query: "共振")
        #expect(hits == [SearchHit(messageId: "a", ranges: [r(3, 2), r(8, 2)])])
    }

    @Test func rangesCountUtf16UnitsSoTheyLineUpWithTheText() throws {
        // An emoji is two units: the match after it starts at 3, as NSString counts.
        let hit = try #require(MessageSearch.find([message("a", "🙂 hi")], query: "hi").first)
        #expect(hit.ranges == [r(3, 2)])
        #expect((("🙂 hi" as NSString).substring(with: hit.ranges[0])) == "hi")
    }

    @Test func aBlankQueryOrAMessageWithoutTextMatchesNothing() {
        let messages = [message("a", "hello"), message("card", "")]
        #expect(MessageSearch.find(messages, query: "").isEmpty)
        #expect(MessageSearch.find(messages, query: "   ").isEmpty)
        #expect(MessageSearch.find(messages, query: "zzz").isEmpty)
    }

    @Test func matchesDontOverlap() {
        #expect(MessageSearch.find([message("a", "aaaa")], query: "aa") == [SearchHit(messageId: "a", ranges: [r(0, 2), r(2, 2)])])
    }

    @Test func theQueryIsTrimmed() {
        #expect(MessageSearch.find([message("a", "hello world")], query: "  world  ") == [SearchHit(messageId: "a", ranges: [r(6, 5)])])
    }

    @Test func positionsHoldForCharactersWhoseLowerCaseIsLonger() {
        // 'İ' lower-cases to two letters as a whole string; folded one at a time it stays one, so ranges line up.
        #expect(MessageSearch.find([message("a", "\u{130}ab")], query: "ab") == [SearchHit(messageId: "a", ranges: [r(1, 2)])])
        #expect(MessageSearch.find([message("a", "\u{130}ab")], query: "iab") == [SearchHit(messageId: "a", ranges: [r(0, 3)])])
    }

    // MARK: Snippets

    @Test func aShortMessageIsShownWhole() {
        let s = SearchSnippet.of("我同意你說的", ranges: [r(1, 2)])
        #expect(s == SearchSnippet(text: "我同意你說的", ranges: [r(1, 2)]))
    }

    @Test func aLongMessageIsCutAroundTheFirstMatchWithEllipses() throws {
        let text = String(repeating: "a", count: 100) + "needle" + String(repeating: "b", count: 100)
        let s = SearchSnippet.of(text, ranges: [r(100, 6)])
        #expect(s.text.hasPrefix("…") && s.text.hasSuffix("…"))
        let range = try #require(s.ranges.first)
        #expect((s.text as NSString).substring(with: range) == "needle")
        // The match sits near the front of what is shown, not the middle of nowhere.
        #expect(range.location <= SearchSnippet.lead + 2)
        #expect(s.text.utf16.count <= SearchSnippet.maxLength + 2)
    }

    @Test func aMatchNearTheStartKeepsTheStartAndOnlyCutsTheEnd() {
        let s = SearchSnippet.of("needle" + String(repeating: "x", count: 200), ranges: [r(0, 6)])
        #expect(!s.text.hasPrefix("…") && s.text.hasSuffix("…"))
        #expect(s.ranges == [r(0, 6)])
    }

    @Test func laterMatchesInsideTheWindowAreKeptAndOnesOutsideDropped() {
        let text = "xx needle yy needle " + String(repeating: "z", count: 200) + " needle"
        let s = SearchSnippet.of(text, ranges: [r(3, 6), r(13, 6), r(text.utf16.count - 6, 6)])
        #expect(s.ranges.count == 2)
        for range in s.ranges { #expect((s.text as NSString).substring(with: range) == "needle") }
    }

    @Test func newlinesBecomeSpacesSoALineStaysALine() throws {
        let s = SearchSnippet.of("one\ntwo\r\nthree", ranges: [r(4, 3)])
        #expect(s.text == "one two  three")
        #expect((s.text as NSString).substring(with: try #require(s.ranges.first)) == "two")
    }

    @Test func neverSplitsASurrogatePair() throws {
        let text = String(repeating: "😀", count: 80) + "needle" + String(repeating: "😀", count: 80)
        let s = SearchSnippet.of(text, ranges: [r(160, 6)])
        // Every character of what is shown is whole: no lone surrogates at the cuts.
        #expect(!s.text.unicodeScalars.contains("\u{FFFD}"))
        #expect(s.text.utf16.count == Array(s.text.utf16).count)
        #expect((s.text as NSString).substring(with: try #require(s.ranges.first)) == "needle")
    }
}
