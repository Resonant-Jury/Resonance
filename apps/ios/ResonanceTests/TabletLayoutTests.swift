import DesignSystem
import Foundation
import Testing
@testable import Resonance

/// The width classes and the layouts drawn from them (design §8–§12): the shared table every
/// platform answers alike, where a card page's article and rail sit, how the Messages stack draws
/// as two panes, and what Return does in the composer on a hardware keyboard.
@MainActor @Suite struct TabletLayoutTests {
    @Test func theWidthClassesAreTheWebsBreakpoints() {
        #expect(LayoutClass.of(320) == .compact)
        #expect(LayoutClass.of(599) == .compact)
        #expect(LayoutClass.of(600) == .medium)
        #expect(LayoutClass.of(899) == .medium)
        #expect(LayoutClass.of(900) == .expanded)
        #expect(LayoutClass.of(1376) == .expanded)
        #expect(!LayoutClass.writerSplit(1199))
        #expect(LayoutClass.writerSplit(1200))
        // Round 5 B2: the tabs in the header from medium up, with their words on expanded.
        #expect(!LayoutClass.compact.topTabs)
        #expect(LayoutClass.medium.topTabs && LayoutClass.expanded.topTabs)
        #expect(!LayoutClass.medium.tabLabels && LayoutClass.expanded.tabLabels)
    }

    @Test func theHeaderLeavesTheTabsAndThePenTheirRoom() {
        // L = (W − G) / 2 − P − 16: a 600 window, glyphs alone (G 206), keeps 157 for the lockup —
        // not enough for the mark and the wordmark, which leave the mark alone.
        #expect(HeaderChrome.leadingRoom(width: 600, groupWidth: 206) == 157)
        #expect(abs(HeaderChrome.leadingRoom(width: 1032, groupWidth: 420) - (306 - 41.28 - 16)) < 0.01)
        #expect(HeaderChrome.leadingRoom(width: 300, groupWidth: 400) == 0)
        // Words go when the labelled group is wider than W − 2 × (P + 152).
        #expect(abs(HeaderChrome.labelRoom(width: 900) - (900 - 2 * (36 + 152))) < 0.01)
        #expect(abs(HeaderChrome.labelRoom(width: 1376) - (1376 - 2 * (48 + 152))) < 0.01)
        #expect(HeaderChrome.rowHeight == 56 && HeaderChrome.penReserve == 64 && HeaderChrome.titleMin == 72)
    }

    @Test func thePagePadIsFourPercentBetweenTwentyAndFortyEight() {
        #expect(LayoutClass.pad(390) == 20)
        #expect(LayoutClass.pad(800) == 32)
        #expect(LayoutClass.pad(1366) == 48)
    }

    @Test func theFeedIsBandsUntilExpandedThenTwoOrThreeColumns() {
        #expect(LayoutClass.feedColumns(.expanded, contentWidth: 959) == 2)
        #expect(LayoutClass.feedColumns(.expanded, contentWidth: 960) == 3)
        #expect(LayoutClass.feedColumns(.medium, contentWidth: 1000) == 1)
        #expect(LayoutClass.feedColumns(.compact, contentWidth: 1000) == 1)
        // The reference iPad Pro 13": two columns standing, three lying down (no rail beside them now).
        let portrait = LayoutClass.feedContentWidth(window: 1032)
        #expect(abs(portrait - 949.44) < 0.01)
        #expect(LayoutClass.feedColumns(.of(1032), contentWidth: portrait) == 2)
        #expect(LayoutClass.feedColumns(.of(1376), contentWidth: LayoutClass.feedContentWidth(window: 1376)) == 3)
        // Row-major: card i in column i mod n.
        #expect((0..<7).map { LayoutClass.column(of: $0, columns: 3) } == [0, 1, 2, 0, 1, 2, 0])
    }

    @Test func aBubbleNeverGrowsPastFiveTwenty() {
        #expect(abs(LayoutClass.bubbleMax(390) - 257.76) < 0.001)
        #expect(abs(LayoutClass.bubbleMax(750) - 516.96) < 0.001)
        #expect(LayoutClass.bubbleMax(1000) == 520)
    }

    @Test func theWindowSaysWhatThePagesHave() {
        let phone = WindowLayout(width: 402, height: 874)
        #expect(!phone.topTabs && phone.contentWidth == 402)
        let ipad = WindowLayout(width: 1032, height: 1376)
        #expect(ipad.topTabs && ipad.contentWidth == 1032 && !ipad.writerSplit)
        #expect(WindowLayout(width: 1376, height: 1032).writerSplit)
    }

    @Test func aWideCardPageSetsItsArticleBesideTheAuthorsRail() {
        // iPad Pro 13" lying down: the whole 1376, a 1200 container with 48 pads.
        let wide = CardPageLayout.of(width: 1376, window: 1376)
        #expect(wide.rail)
        #expect(wide.article == 760)
        #expect(wide.leading == 154)
        #expect(wide.railX == CGFloat(174 + 720 + 48))
        // Standing (1032): the text narrows to what is left beside the author's rail.
        let standing = CardPageLayout.of(width: 1032, window: 1032)
        #expect(standing.rail)
        #expect(standing.railX + Tokens.cardRailW <= 1032 - LayoutClass.pad(1032) + 0.01)
        #expect(standing.article - 40 + 48 + Tokens.cardRailW <= 1032 - 2 * LayoutClass.pad(1032) + 0.01)
        // Medium and phones: one column of at most 760, centred, no rail.
        let medium = CardPageLayout.of(width: 656, window: 744)
        #expect(!medium.rail && medium.article == 656 && medium.leading == 0)
        let mediumWide = CardPageLayout.of(width: 800, window: 888)
        #expect(mediumWide.article == 760 && mediumWide.leading == 20)
        let phone = CardPageLayout.of(width: 402, window: 402)
        #expect(!phone.rail && phone.article == 402 && phone.leading == 0)
    }

    @Test func twoPanesDrawTheConversationBesideTheListAndPushOnlyWhatIsOverIt() {
        let ben = Route.thread(handle: "ben", uid: "u-ben", note: nil)
        let cyd = Route.thread(handle: "cyd", uid: "u-cyd", note: nil)
        // The conversation at the stack's foot is the detail pane; what is over it is pushed.
        #expect(MessagesPanes.split([]).detail == nil)
        #expect(MessagesPanes.split([ben]).detail == ben)
        #expect(MessagesPanes.split([ben]).pushed.isEmpty)
        #expect(MessagesPanes.split([ben, .author("ben"), .card("a")]).pushed == [.author("ben"), .card("a")])
        // A stack that doesn't begin with a conversation is pushed as it is.
        #expect(MessagesPanes.split([.author("ben")]).detail == nil)
        #expect(MessagesPanes.split([.author("ben")]).pushed == [.author("ben")])
        // One state, two presentations: splitting and merging gives the stack back.
        for path: [Route] in [[], [ben], [ben, .card("a")], [.author("x")]] {
            let (detail, pushed) = MessagesPanes.split(path)
            #expect(MessagesPanes.merge(detail: detail, pushed: pushed) == path)
        }
        // Choosing replaces the detail and what was pushed over it; the same one again changes nothing.
        #expect(MessagesPanes.choose(cyd, in: [ben, .card("a")]) == [cyd])
        #expect(MessagesPanes.choose(ben, in: [ben, .card("a")]) == [ben, .card("a")])
        #expect(MessagesPanes.choose(ben, in: []) == [ben])
        // A note to answer in the same conversation still opens it afresh.
        let answering = Route.thread(handle: "ben", uid: "u-ben", note: .init(cardId: "c", noteId: "n"))
        #expect(MessagesPanes.choose(answering, in: [ben]) == [answering])
    }

    @Test func theChosenRowIsTheDetailPanesConversation() throws {
        let ben = try #require(Person(id: "u-ben", data: ["handle": "ben"]))
        let cyd = try #require(Person(id: "u-cyd", data: ["handle": "cyd"]))
        let byUid = ChosenThread(route: .thread(handle: "Ben", uid: "u-ben", note: nil), choose: { _ in })
        #expect(byUid.isChosen(ben) && !byUid.isChosen(cyd))
        let byHandle = ChosenThread(route: .thread(handle: "BEN", uid: nil, note: nil), choose: { _ in })
        #expect(byHandle.isChosen(ben) && !byHandle.isChosen(cyd))
        #expect(!ChosenThread(route: nil, choose: { _ in }).isChosen(ben))
    }

    @Test func returnSendsUnlessShiftIsHeldOrAnInputMethodIsComposing() {
        #expect(ComposerKeys.sends(shift: false, composing: false))
        #expect(!ComposerKeys.sends(shift: true, composing: false))
        #expect(!ComposerKeys.sends(shift: false, composing: true))
        #expect(!ComposerKeys.sends(shift: true, composing: true))
    }
}
