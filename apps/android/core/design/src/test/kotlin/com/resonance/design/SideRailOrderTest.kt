package com.resonance.design

import com.resonance.design.generated.IconName
import org.junit.Assert.assertEquals
import org.junit.Test

/** The side rail (design note §9, as iOS): the pen at the top, then the tabs in the bar's order. */
class SideRailOrderTest {
    @Test fun thePenComesFirstThenTheTabsInTheirBarOrderEachKeepingItsPlaceInTheBar() {
        // The bar's order (Navigation's tabItems): the pen in the middle.
        val bar = listOf(
            OrganicTabItem("feed", "Feed", IconName.Sparkle),
            OrganicTabItem("messages", "Messages", IconName.Chat),
            OrganicTabItem("write", "Write", IconName.Pen, isAction = true),
            OrganicTabItem("notifications", "Notifications", IconName.Bell),
            OrganicTabItem("cards", "Card box", IconName.Cards),
        )
        val rail = railOrder(bar)
        assertEquals(listOf("write", "feed", "messages", "notifications", "cards"), rail.map { it.value.id })
        // Each tab's wash keeps the bar's seed.
        assertEquals(listOf(2, 0, 1, 3, 4), rail.map { it.index })
    }
}
