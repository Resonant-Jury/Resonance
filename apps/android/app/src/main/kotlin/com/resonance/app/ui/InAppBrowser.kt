package com.resonance.app.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.ui.graphics.toArgb
import com.resonance.design.generated.Tokens

/**
 * Opens a web page inside the app (a Custom Tab, the twin of iOS's
 * SFSafariViewController), so the reader never leaves for the browser app —
 * the store rules want the privacy policy reachable in the app itself.
 */
object InAppBrowser {
    /** Only http(s) pages open. Without a Custom Tabs browser it falls back to a plain VIEW intent. */
    fun open(context: Context, url: String) {
        val uri = Uri.parse(url)
        if (uri.scheme?.lowercase() !in setOf("http", "https")) return
        val tab = CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(
                CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(Tokens.Cream.toArgb())
                    .setNavigationBarColor(Tokens.Cream.toArgb())
                    .build(),
            )
            .setShowTitle(true)
            .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
            .build()
        try {
            tab.launchUrl(context, uri)
        } catch (_: ActivityNotFoundException) {
            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }
    }
}
