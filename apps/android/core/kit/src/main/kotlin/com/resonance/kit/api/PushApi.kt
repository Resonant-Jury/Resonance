package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.RegisterDeviceRequest
import com.resonance.kit.l10n.Strings
import okhttp3.OkHttpClient

/**
 * This install's push registration (PUT/DELETE /api/v1/me/devices/{id}): its
 * FCM token, the app's language, which the server writes pushes in, and the
 * device's time zone (an IANA name, so an evening push can one day come at the
 * person's own evening; a name the server doesn't know is kept as none). The
 * install id is the app's own, so signing in as someone else on the same
 * phone moves the device to them. The twin of iOS's PushAPI; the server's
 * refusals surface as [ApiFailure].
 */
class PushApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    /**
     * [capabilities] say what this build does with a push beyond showing it — `chat-push`: it draws a
     * conversation's messages itself, so the server sends those as data, not as a notification.
     * [timeZone] is the device's zone id (`Asia/Taipei`); the contract takes at most 64 characters,
     * so a longer one (none is) goes as none rather than having the registration refused.
     */
    suspend fun register(
        installationId: String,
        token: String,
        language: Strings.Language,
        appVersion: String?,
        capabilities: List<String>? = null,
        timeZone: String? = null,
    ) = call {
        api.registerDevice(
            installationId,
            RegisterDeviceRequest(
                token = token, platform = RegisterDeviceRequest.Platform.android, locale = language.tag, appVersion = appVersion,
                capabilities = capabilities, timeZone = timeZone?.takeIf { it.isNotEmpty() && it.length <= TIME_ZONE_MAX },
            ),
        )
    }

    suspend fun unregister(installationId: String) = call { api.unregisterDevice(installationId) }

    companion object {
        /** RegisterDeviceRequest.timeZone's limit in the contract. */
        const val TIME_ZONE_MAX = 64
    }
}
