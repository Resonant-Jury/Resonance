package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class SettingsSectionTest {
    /**
     * The web list is profile, account, privacy, language, appearance, terms, delete
     * (SettingsClient's SECTIONS); the rule above a row is seeded from its index there (40 + i * 6).
     */
    @Test fun settingsListKeepsTheWebsOrderAndRuleSeeds() {
        assertEquals(
            listOf(SettingsSection.Profile, SettingsSection.Account, SettingsSection.Privacy, SettingsSection.Language, SettingsSection.Terms, SettingsSection.Delete),
            SettingsSection.entries,
        )
        assertEquals(listOf(0, 1, 2, 3, 5, 6), SettingsSection.entries.map { it.webIndex })
    }
}
