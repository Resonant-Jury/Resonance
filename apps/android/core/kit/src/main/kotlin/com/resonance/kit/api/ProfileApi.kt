package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.CreateProfileRequest
import com.resonance.api.models.Me
import com.resonance.api.models.UpdateProfileRequest
import okhttp3.OkHttpClient

/**
 * Your own profile through the contract: the as-you-type pen-name check,
 * onboarding (a new account's pen name, region and writing language), and
 * edits. The server checks the name is free in the same transaction as the
 * write, so a name taken meanwhile comes back as a `conflict` [ApiFailure].
 */
class ProfileApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, http.newBuilder().addInterceptor(BearerAuthInterceptor(configuration.idToken)).build()),
    )

    /** Whether a pen name is free — your own counts as free (GET /api/v1/handles/{handle}). */
    suspend fun isAvailable(handle: String): Boolean = call { api.getHandleAvailability(handle).available }

    /**
     * Onboarding (POST /api/v1/me): `primaryLocale` is "zh-TW" or "en". Idempotent —
     * an account that already has a profile gets it back unchanged.
     */
    suspend fun create(handle: String, region: String, primaryLocale: String): Me {
        val locale = CreateProfileRequest.PrimaryLocale.entries.firstOrNull { it.value == primaryLocale }
            ?: throw IllegalArgumentException("primaryLocale: $primaryLocale")
        return call { api.createProfile(CreateProfileRequest(handle = handle, region = region, primaryLocale = locale)) }
    }

    /** Changes the fields given; null leaves one as it is, an empty bio clears it (PATCH /api/v1/me). */
    suspend fun update(handle: String? = null, bio: String? = null, region: String? = null): Me =
        call { api.updateProfile(UpdateProfileRequest(handle = handle, bio = bio, region = region)) }
}
