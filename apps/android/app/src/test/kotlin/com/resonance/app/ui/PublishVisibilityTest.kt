package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * An anonymous card is public or only its author's — never for connections only, which would say
 * whose it is — so turning a card kept for connections anonymous in the publish panel makes it
 * public; under a name, every audience stands.
 */
class PublishVisibilityTest {
    @Test fun anAnonymousCardIsPublicOrOnlyYours() {
        assertEquals("public", anonymousVisibility("connections", anonymous = true))
        assertEquals("private", anonymousVisibility("private", anonymous = true))
        assertEquals("public", anonymousVisibility("public", anonymous = true))
    }

    @Test fun underYourNameEveryAudienceStands() {
        assertEquals("connections", anonymousVisibility("connections", anonymous = false))
        assertEquals("private", anonymousVisibility("private", anonymous = false))
    }
}
