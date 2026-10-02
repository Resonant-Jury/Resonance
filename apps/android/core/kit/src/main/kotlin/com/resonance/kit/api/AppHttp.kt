package com.resonance.kit.api

import java.util.concurrent.TimeUnit
import okhttp3.Interceptor
import okhttp3.OkHttpClient

/**
 * The app's one OkHttpClient — the API and the pictures share its connections and threads (the
 * twin of iOS's AppHTTP). How long a request may wait is set here instead of OkHttp's ten-second
 * defaults: room for the server's model-backed routes (tags, the insight, publishing's slug)
 * without a stalled connection holding a screen for a minute. Every request says which app and
 * version it comes from.
 */
object AppHttp {
    const val CONNECT_TIMEOUT_SECONDS = 15L
    /** Between two reads of an answer (the illustration's stream sets its own, longer one). */
    const val READ_TIMEOUT_SECONDS = 30L
    const val WRITE_TIMEOUT_SECONDS = 30L

    /** `Resonance/2.0.0 (Android 15; build 4)`. */
    fun userAgent(version: String, build: Long, osVersion: String): String = "Resonance/$version (Android $osVersion; build $build)"

    fun client(userAgent: String): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .addInterceptor(Interceptor { chain -> chain.proceed(chain.request().newBuilder().header("User-Agent", userAgent).build()) })
        .addInterceptor(Interceptor { chain ->
            val request = chain.request()
            val token = AppCheckHeader.token
            // Our API only: the pictures come from another host, which has no business with it.
            if (token == null || !request.url.encodedPath.startsWith("/api/")) chain.proceed(request)
            else chain.proceed(request.newBuilder().header(AppCheckHeader.NAME, token).build())
        })
        .build()
}

/**
 * The app's current Firebase App Check token, as the app last heard it (Play Integrity in release
 * builds; see AppFirebase) — the twin of iOS's AppCheckHeader. The API only watches it for now,
 * refusing nothing without one, so a request never waits for a token: it carries the one at hand.
 */
object AppCheckHeader {
    const val NAME = "X-Firebase-AppCheck"

    @Volatile var token: String? = null
        set(value) {
            field = value?.takeIf { it.isNotEmpty() }
        }
}
