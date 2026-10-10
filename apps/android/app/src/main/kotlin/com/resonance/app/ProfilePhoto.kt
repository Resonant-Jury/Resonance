package com.resonance.app

/**
 * How a profile photo is sent and saved (design note B7): uploaded with the form's `purpose` set
 * to [PURPOSE] (the route fits it to 256 WebP), then merged into the owner's `users/{uid}` as the
 * web's `updateProfile({ avatarUrl })` does — that one field, nothing else of the profile touched.
 */
object ProfilePhoto {
    const val PURPOSE = "avatar"

    fun fields(url: String): Map<String, Any> = mapOf("avatarUrl" to url)
}
