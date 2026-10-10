package com.resonance.app.ui

import androidx.compose.ui.unit.dp
import com.resonance.design.LayoutClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Round 5 part E on Android: the reading progress's motion, a tablet's spacing, where a conversation opens, the workspace's divider. */
class RoundFiveETest {
    // E1

    @Test fun theReadingProgressFollowsTheScrollAndEasesOnlyAJumpOnItsOwn() {
        // A drag or a fling (the finger still down included): every frame put straight on the bar.
        assertFalse(easesProgress(0.3f, scrolling = true, interrupted = false, reduced = false))
        assertFalse(easesProgress(0.004f, scrolling = true, interrupted = false, reduced = false))
        // A still page whose story changed height: the one jump eases there.
        assertTrue(easesProgress(0.3f, scrolling = false, interrupted = false, reduced = false))
        // …but a change that lands while that ease still runs snaps (restarting it every frame never moved it).
        assertFalse(easesProgress(0.3f, scrolling = false, interrupted = true, reduced = false))
        // A nudge too small to ease, and anything with the system's animations off, is put there at once.
        assertFalse(easesProgress(PROGRESS_JUMP / 2, scrolling = false, interrupted = false, reduced = false))
        assertFalse(easesProgress(0.3f, scrolling = false, interrupted = false, reduced = true))
    }

    // E2

    @Test fun aTabletsTitledTabsStart32UnderThePenLineButMessagesKeepsItsPanes() {
        val penLine = 1.4f + 1.8f
        assertEquals(16f, titledBarGap(LayoutClass.Compact, tabletAir = true).value, 0.001f)
        // My Card Box on a phone: 8 more.
        assertEquals(24f, titledBarGap(LayoutClass.Compact, tabletAir = true, phoneExtra = 8.dp).value, 0.001f)
        for (cls in listOf(LayoutClass.Medium, LayoutClass.Expanded)) {
            assertEquals(32f - penLine, titledBarGap(cls, tabletAir = true).value, 0.001f)
            // The phone's extra is the phone's alone.
            assertEquals(32f - penLine, titledBarGap(cls, tabletAir = true, phoneExtra = 8.dp).value, 0.001f)
            assertEquals(16f, titledBarGap(cls, tabletAir = false).value, 0.001f)
        }
    }

    @Test fun aCardPagesListHeadingsHaveTheSameRoomOnATablet() {
        assertEquals(SectionAir(32, 40), cardSectionAir(LayoutClass.Compact, phoneBelow = 40))
        assertEquals(SectionAir(32, 56), cardSectionAir(LayoutClass.Compact, phoneBelow = 56))
        assertEquals(SectionAir(0, 24), cardSectionAir(LayoutClass.Compact, phoneTop = 0, phoneBelow = 24))
        for (cls in listOf(LayoutClass.Medium, LayoutClass.Expanded)) {
            assertEquals(SectionAir(64, 56), cardSectionAir(cls, phoneBelow = 40))
            assertEquals(SectionAir(64, 56), cardSectionAir(cls, phoneBelow = 56))
            assertEquals(SectionAir(64, 56), cardSectionAir(cls, phoneTop = 0, phoneBelow = 24))
        }
    }

    @Test fun aPhonesCardBoxHasMoreAirAroundItsShelves() {
        assertEquals(CardBoxAir(8.dp, 28.dp, 36.dp), CardBoxAir.of(LayoutClass.Compact))
        assertEquals(CardBoxAir(0.dp, 20.dp, 28.dp), CardBoxAir.of(LayoutClass.Medium))
        assertEquals(CardBoxAir(0.dp, 20.dp, 28.dp), CardBoxAir.of(LayoutClass.Expanded))
    }

    // E3

    @Test fun onATabletAConversationOpenedOutsideMessagesGoesToMessages() {
        val thread = Route.Thread("bob", uid = "u-bob")
        for (cls in listOf(LayoutClass.Medium, LayoutClass.Expanded)) {
            for (tab in listOf(Tab.Feed, Tab.Notifications, Tab.CardBox)) assertTrue(opensInMessages(thread, tab, cls))
            // Already on Messages: on its own stack (a profile pushed there, its message action).
            assertFalse(opensInMessages(thread, Tab.Messages, cls))
            // Anything else stays where it was opened.
            assertFalse(opensInMessages(Route.Card("a-walk"), Tab.Notifications, cls))
            assertFalse(opensInMessages(Route.Author("bob"), Tab.Feed, cls))
        }
        // A phone pushes it where it was opened.
        for (tab in Tab.entries) assertFalse(opensInMessages(thread, tab, LayoutClass.Compact))
    }

    @Test fun theChosenConversationsRowIsFoundAmongTheConversationsOrThePeopleToStartWith() {
        val conversations = listOf("ana", "bob")
        val starters = listOf("cyd", "dan")
        assertEquals(1, rowIndex(conversations, starters) { it == "bob" })
        // After the conversations and the starters' label.
        assertEquals(4, rowIndex(conversations, starters) { it == "dan" })
        assertNull(rowIndex(conversations, starters) { it == "eve" })
    }

    // E5

    @Test fun theDividerResizesTheEditorBetween32And50PercentAndHidesItFromUnder18() {
        val w = 1000f
        // Toward the map grows it, never past half; toward the trailing edge the pane follows the finger.
        assertEquals(0.5f, PaneDrag.follow(0.4f, -300f, w), 0.0001f)
        assertEquals(0.36f, PaneDrag.follow(0.4f, 40f, w), 0.0001f)
        assertEquals(0.1f, PaneDrag.follow(0.4f, 300f, w), 0.0001f)
        assertEquals(0f, PaneDrag.follow(0.4f, 900f, w), 0.0001f)
        // The hide zone.
        assertTrue(PaneDrag.inHideZone(0.179f))
        assertFalse(PaneDrag.inHideZone(0.18f))
        // Let go: hidden under 18 %, sprung back to 32 % between, left where it is from 32 %.
        assertEquals(PaneDrag.Release.Hide, PaneDrag.release(0.1f))
        assertEquals(0f, PaneDrag.settle(0.1f))
        assertEquals(PaneDrag.Release.SpringBack, PaneDrag.release(0.18f))
        assertEquals(PaneDrag.Release.SpringBack, PaneDrag.release(0.319f))
        assertEquals(0.32f, PaneDrag.settle(0.25f))
        assertEquals(PaneDrag.Release.Stay, PaneDrag.release(0.32f))
        assertEquals(0.41f, PaneDrag.settle(0.41f))
        // Docked: drawn far enough toward the map, it shows again.
        assertTrue(PaneDrag.reveals(20f, 16f))
        assertFalse(PaneDrag.reveals(10f, 16f))
    }

    @Test fun theWorkspacesPaneKeepsWhatItShowsAndWhereItWasLeft() {
        val state = PaneState(PaneCard(ROUTE_SLOT, null, null, "words", fromMap = false), open = true, frac = 0.4f)
        val saved = with(PaneState.Saver) { androidx.compose.runtime.saveable.SaverScope { true }.save(state) }!!
        val back = PaneState.Saver.restore(saved)!!
        assertEquals(state.card, back.card)
        assertTrue(back.open)
        assertEquals(0.4f, back.frac)
        assertEquals(0.4f, back.drawn)
        // Nothing to show: never open.
        assertFalse(PaneState(null, open = true, frac = 0.5f).open)
        assertEquals(0f, PaneState(null, open = true, frac = 0.5f).drawn)
    }
}
