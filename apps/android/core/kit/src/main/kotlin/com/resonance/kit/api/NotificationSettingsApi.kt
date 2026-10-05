package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.NotificationSettings
import com.resonance.api.models.UpdateNotificationSettingsRequest
import com.resonance.kit.push.NotificationSwitch
import okhttp3.OkHttpClient

/**
 * The pushes a person asked for beyond the ones answering them (GET/PATCH
 * /api/v1/me/notifications): both off until turned on, kept by the server for the account, so
 * every device of it follows the same switches. The twin of iOS's NotificationSettingsAPI; the
 * server's refusals surface as [ApiFailure].
 */
class NotificationSettingsApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    suspend fun get(): NotificationSettings = call { api.getNotificationSettings() }

    /** Flips one switch (the other is sent as null, which leaves it alone); the answer is both, as stored now. */
    suspend fun set(switch: NotificationSwitch, on: Boolean): NotificationSettings = call {
        api.updateNotificationSettings(
            when (switch) {
                NotificationSwitch.Picks -> UpdateNotificationSettingsRequest(picks = on)
                NotificationSwitch.ConnectionCards -> UpdateNotificationSettingsRequest(connectionCards = on)
            },
        )
    }
}
