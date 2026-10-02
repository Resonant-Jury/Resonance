package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The shape of each move: which page goes where, which side it goes to, and that only the page on
 * top ever carries a scrim (so nothing is darkened but the page below it).
 */
class PageTransitionsTest {
    private val width = 1000f
    private val shift = 60f
    private val corner = 70f

    private fun pose(move: PageMove, role: PageRole, f: Float, end: Float = 1f, finger: Float = 1f) =
        pagePose(move, role, f, width, end, finger, shift, corner)

    @Test fun aPageOpensFromTheEndSideAndTheOneBelowDriftsToTheStartSide() {
        assertEquals(1000f, pose(PageMove.Push, PageRole.Entering, 0f).translationX, 0.01f)
        assertEquals(0f, pose(PageMove.Push, PageRole.Entering, 1f).translationX, 0.01f)
        assertEquals(-250f, pose(PageMove.Push, PageRole.Exiting, 1f).translationX, 0.01f)
        // In right-to-left layouts the same, mirrored.
        assertEquals(-1000f, pose(PageMove.Push, PageRole.Entering, 0f, end = -1f).translationX, 0.01f)
        assertEquals(250f, pose(PageMove.Push, PageRole.Exiting, 1f, end = -1f).translationX, 0.01f)
    }

    @Test fun theScrimDarkensTheOneBelowAsAPageOpensAndOnlyThePageOnTopHasOne() {
        assertEquals(0f, pose(PageMove.Push, PageRole.Entering, 0f).scrim, 0.001f)
        assertEquals(0.35f, pose(PageMove.Push, PageRole.Entering, 1f).scrim, 0.001f)
        assertEquals(0f, pose(PageMove.Push, PageRole.Exiting, 0.5f).scrim, 0f)
        // Back: the page leaving is the one on top, over the page that comes back.
        assertEquals(0.35f, pose(PageMove.Pop, PageRole.Exiting, 0f).scrim, 0.001f)
        assertEquals(0f, pose(PageMove.Pop, PageRole.Exiting, 1f).scrim, 0.001f)
        assertEquals(0f, pose(PageMove.Pop, PageRole.Entering, 0.5f).scrim, 0f)
        assertEquals(0f, pose(PageMove.Predictive, PageRole.Entering, 0.5f).scrim, 0f)
    }

    @Test fun backSlidesThePageOutToTheEndSideAndTheOneBelowComesInFromTheStartSide() {
        assertEquals(1000f, pose(PageMove.Pop, PageRole.Exiting, 1f).translationX, 0.01f)
        assertEquals(-250f, pose(PageMove.Pop, PageRole.Entering, 0f).translationX, 0.01f)
        assertEquals(0f, pose(PageMove.Pop, PageRole.Entering, 1f).translationX, 0.01f)
        assertEquals(-1000f, pose(PageMove.Pop, PageRole.Exiting, 1f, end = -1f).translationX, 0.01f)
        assertEquals(250f, pose(PageMove.Pop, PageRole.Entering, 0f, end = -1f).translationX, 0.01f)
    }

    @Test fun aBackSwipeShrinksThePageInItsFirstThirdThenHoldsItUntilLetGo() {
        val start = pose(PageMove.Predictive, PageRole.Exiting, 0f)
        assertEquals(1f, start.scale, 0.001f)
        assertEquals(0f, start.translationX, 0.001f)
        assertEquals(0f, start.corner, 0.001f)
        assertEquals(0.35f, start.scrim, 0.001f)

        val shrunk = pose(PageMove.Predictive, PageRole.Exiting, 1f / 3f)
        assertEquals(0.9f, shrunk.scale, 0.001f)
        assertEquals(shift, shrunk.translationX, 0.001f)
        assertEquals(corner, shrunk.corner, 0.001f)

        // Past that, the scale and the corners stay while the scrim keeps clearing.
        val later = pose(PageMove.Predictive, PageRole.Exiting, 0.5f)
        assertEquals(0.9f, later.scale, 0.001f)
        assertEquals(corner, later.corner, 0.001f)
        assertTrue(later.scrim < shrunk.scrim)
    }

    @Test fun theShrinkFollowsTheFingerFromTheFirstMoment() {
        val early = pose(PageMove.Predictive, PageRole.Exiting, 0.05f)
        assertTrue("shrinks at once, not after a lag: ${early.scale}", early.scale < 0.99f)
        assertTrue(early.scale > 0.9f)
    }

    @Test fun theReleaseTakesThePageOffTheScreenTheWayTheFingerWentAndClearsTheScrim() {
        val left = pose(PageMove.Predictive, PageRole.Exiting, 1f, finger = 1f)
        // Scaled about its centre, its near edge is at this offset plus the margin the scale leaves.
        assertTrue(left.translationX + width * (1f - left.scale) / 2f >= width)
        assertEquals(0f, left.scrim, 0.001f)
        val right = pose(PageMove.Predictive, PageRole.Exiting, 1f, finger = -1f)
        assertEquals(-left.translationX, right.translationX, 0.001f)
        // The swipe goes where the finger goes, whichever way the layout reads.
        assertEquals(left.translationX, pose(PageMove.Predictive, PageRole.Exiting, 1f, end = -1f, finger = 1f).translationX, 0.001f)
    }

    @Test fun theLeavingAcceleratesRatherThanSlowingAtTheEdge() {
        val a = pose(PageMove.Predictive, PageRole.Exiting, 0.6f).translationX
        val b = pose(PageMove.Predictive, PageRole.Exiting, 0.8f).translationX
        val c = pose(PageMove.Predictive, PageRole.Exiting, 1f).translationX
        assertTrue("$a $b $c", c - b > b - a)
    }

    @Test fun switchingTabsFadesOneIntoTheOtherWithoutMovingOrDarkening() {
        val coming = pose(PageMove.Tabs, PageRole.Entering, 0.25f)
        val going = pose(PageMove.Tabs, PageRole.Exiting, 0.25f)
        assertEquals(0.25f, coming.alpha, 0.001f)
        // The old tab stays whole under the new one, so the cream never shows through mid-way.
        assertEquals(1f, going.alpha, 0.001f)
        for (p in listOf(coming, going)) {
            assertEquals(0f, p.translationX, 0f)
            assertEquals(1f, p.scale, 0f)
            assertEquals(0f, p.scrim, 0f)
        }
    }

    @Test fun aPageAtRestIsUntouched() {
        for (move in PageMove.entries) assertEquals(PagePose(), pose(move, PageRole.Resting, 0.5f))
    }
}
