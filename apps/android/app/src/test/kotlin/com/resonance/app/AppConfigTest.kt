package com.resonance.app

import com.resonance.kit.PolicyPage
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.l10n.Strings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Release builds talk to the site on its own domain; the API, the policy pages and shared links all hang off it. */
class AppConfigTest {
    @Test fun productionTalksToTheLiveSite() {
        val config = AppConfig(usesEmulator = false)
        assertEquals("https://resonance.channel", config.origin)
        assertFalse(config.usesEmulator)
        assertEquals("https://resonance.channel/api/v1", ApiConfiguration(config.origin) { null }.apiUrl)
        assertEquals("https://resonance.channel/en/privacy", PolicyPage.Privacy.url(config.origin, Strings.Language.En))
    }

    @Test fun emulatorUsesTheLocalDevServer() {
        val config = AppConfig(usesEmulator = true)
        assertEquals("http://10.0.2.2:3100", config.origin)
        assertTrue(config.usesEmulator)
        assertEquals("http://10.0.2.2:3101", AppConfig(usesEmulator = true, emulatorApiPort = 3101).origin)
    }
}
