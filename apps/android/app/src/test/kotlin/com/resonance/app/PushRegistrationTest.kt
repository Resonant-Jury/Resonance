package com.resonance.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A cold start doesn't send the same push registration again: only a change (who, the token, the
 * language, the version, the install) or a day gone by sends it — and nothing kept (signed out,
 * a first run) always does.
 */
class PushRegistrationTest {
    private val sent = PushRegistration("install-1", "alice", "fcm-token", "zh-TW", "2.0.0")
    private val at = 1_000_000_000_000L
    private val kept = sent.encode(at)

    @Test fun theSameRegistrationIsntSentAgainTheSameDay() {
        assertTrue(PushRegistration.isFresh(kept, sent, at + 60_000))
        assertTrue(PushRegistration.isFresh(kept, sent, at + PushRegistration.TTL_MS - 1))
    }

    @Test fun aDayLaterItIsSentAgain() {
        assertFalse(PushRegistration.isFresh(kept, sent, at + PushRegistration.TTL_MS))
        // A clock set back counts as stale too.
        assertFalse(PushRegistration.isFresh(kept, sent, at - 1))
    }

    @Test fun anyChangeSendsItAgain() {
        val now = at + 60_000
        listOf(
            sent.copy(installationId = "install-2"),
            sent.copy(uid = "bob"),
            sent.copy(token = "fcm-token-2"),
            sent.copy(language = "en"),
            sent.copy(version = "2.0.1"),
        ).forEach { changed -> assertFalse(changed.toString(), PushRegistration.isFresh(kept, changed, now)) }
    }

    @Test fun nothingKeptAlwaysSends() {
        assertFalse(PushRegistration.isFresh(null, sent, at))
        assertFalse(PushRegistration.isFresh("", sent, at))
        assertFalse(PushRegistration.isFresh("garbage", sent, at))
    }
}
