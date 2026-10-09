package com.resonance.app.ui

import com.resonance.api.models.NotificationSettings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsSectionTest {
    /**
     * The web list is profile, account, privacy, notifications, language, appearance, terms, delete
     * (SettingsClient's SECTIONS); the rule above a row is seeded from its index there (40 + i * 6).
     */
    @Test fun settingsListKeepsTheWebsOrderAndRuleSeeds() {
        assertEquals(
            listOf(
                SettingsSection.Profile, SettingsSection.Account, SettingsSection.Privacy, SettingsSection.Notifications,
                SettingsSection.Language, SettingsSection.Terms, SettingsSection.Delete,
            ),
            SettingsSection.entries,
        )
        assertEquals(listOf(0, 1, 2, 3, 4, 6, 7), SettingsSection.entries.map { it.webIndex })
    }

    /** Turning a push switch on saves it only when its pushes can show; else the permission comes first, or the notice. */
    @Test fun turningASwitchOnAsksForThePermissionFirst() {
        assertEquals(TurnOn.Save, turnOn(canNotify = true, canAskPermission = false))
        // API 33+, not granted: the system's dialog, and the switch saves once it is given.
        assertEquals(TurnOn.Ask, turnOn(canNotify = false, canAskPermission = true))
        // Switched off in the system settings (or below 33, where there is nothing to ask): the switch stays off.
        assertEquals(TurnOn.Refused, turnOn(canNotify = false, canAskPermission = false))
    }

    @Test fun theNoticeShowsWhileNotificationsAreOffAndSomethingWantsThem() {
        val off = NotificationSettings(picks = false, connectionCards = false)
        // Refused just now.
        assertTrue(showsPermissionNotice(off, canNotify = false, refused = true))
        // A switch on whose pushes can't reach this phone.
        assertTrue(showsPermissionNotice(off.copy(connectionCards = true), canNotify = false, refused = false))
        // Nothing asked for, nothing to say.
        assertFalse(showsPermissionNotice(off, canNotify = false, refused = false))
        assertFalse(showsPermissionNotice(null, canNotify = false, refused = false))
        // Notifications on: never.
        assertFalse(showsPermissionNotice(off.copy(picks = true), canNotify = true, refused = true))
    }
}
