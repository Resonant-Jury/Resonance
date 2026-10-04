package com.resonance.app

import com.resonance.api.models.Me
import org.junit.Assert.assertEquals
import org.junit.Test

/** Where a signed-in account goes once /me has answered: the tabs, or first the pen-name step. */
class SessionEntryTest {
    private fun me(handle: String) = Me(
        id = "u1", handle = handle, initials = "AL", accentColor = "oklch(70% 0.1 40)", bio = null,
        avatarUrl = null, region = "TW", primaryLocale = Me.PrimaryLocale.zhTW, handleChangedAt = null,
    )

    @Test fun aProfileWithAPenNameOpensTheTabs() {
        assertEquals(Session.Entry.App, Session.Entry.of(me("alice")))
        assertEquals(Session.Entry.App, Session.Entry.of(me("小雨")))
    }

    @Test fun aProfileThatNeverGotAPenNameChoosesOneFirst() {
        // Made before onboarding asked for one: reaching anyone takes a pen name, and onboarding names the profile.
        assertEquals(Session.Entry.Onboarding, Session.Entry.of(me("")))
        assertEquals(Session.Entry.Onboarding, Session.Entry.of(me("   ")))
    }
}
