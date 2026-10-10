package com.resonance.design

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The initials keep paper between them and the outline (the web's initialsScale): Latin ones at
 * 35 % of the avatar, two Chinese characters — each a full em wide — small enough to stay inside.
 */
class AvatarInitialsTest {
    @Test fun latinInitialsAndOneCharacterKeepTheUsualSize() {
        assertEquals(0.35f, initialsScale("AL"))
        assertEquals(0.35f, initialsScale("念"))
    }

    @Test fun twoChineseCharactersStayWithinTheAvatar() {
        assertEquals(0.28f, initialsScale("念誠"), 0.001f)
        assertTrue(initialsScale("念誠") * 2 <= 0.56f + 1e-6f)
        assertEquals(0.56f / 1.62f, initialsScale("念A"), 0.001f)
        // A character outside the Basic Multilingual Plane counts once.
        assertEquals(0.35f, initialsScale("𠀋"))
    }
}
