package com.resonance.app

import org.junit.Assert.assertEquals
import org.junit.Test

/** A profile photo is uploaded as an avatar and saved as the web saves it (design note B7). */
class ProfilePhotoTest {
    @Test fun theProfileWriteIsTheAvatarUrlAlone() {
        // users/{uid} merged with this one field: the rules allow the owner exactly that (a stored file).
        assertEquals(mapOf("avatarUrl" to "https://img.test/avatar/2026-10/a.webp"), ProfilePhoto.fields("https://img.test/avatar/2026-10/a.webp"))
        // What /api/upload reads to fit it to 256.
        assertEquals("avatar", ProfilePhoto.PURPOSE)
    }
}
