package com.resonance.app.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.browser.customtabs.CustomTabsService
import androidx.compose.ui.graphics.toArgb
import com.resonance.design.generated.Tokens

/**
 * Opens a web page inside the app (a Custom Tab, the twin of iOS's
 * SFSafariViewController), so the reader never leaves for the browser app —
 * the store rules want the privacy policy reachable in the app itself.
 *
 * The tab is always given a browser to run in: without one, Android resolves
 * a link to our own site through the App Links filter and hands it straight
 * back to the app, and the page never opens.
 */
object InAppBrowser {
    /** Only http(s) pages open. Without a Custom Tabs browser it falls back to a browser's plain VIEW. */
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
        customTabsBrowser(context)?.let { browser ->
            tab.intent.setPackage(browser)
            try {
                return tab.launchUrl(context, uri)
            } catch (_: ActivityNotFoundException) {
                // Uninstalled since we looked: try a plain browser below.
            }
        }
        val view = Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        plainBrowser(context)?.let { view.setPackage(it) }
        runCatching { context.startActivity(view) }
    }

    /** The default browser when it hosts Custom Tabs, else the first one that does — never this app. */
    private fun customTabsBrowser(context: Context): String? {
        val own = context.packageName
        val hosts = context.packageManager
            .queryIntentServices(Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION), 0)
            .map { it.serviceInfo.packageName }
            .filter { it != own }
            .distinct()
        return CustomTabsClient.getPackageName(context, hosts)?.takeIf { it != own }
    }

    /** A browser for a plain VIEW (the default one if there is one) — never this app. */
    private fun plainBrowser(context: Context): String? {
        val own = context.packageName
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com/")).addCategory(Intent.CATEGORY_BROWSABLE)
        val pm = context.packageManager
        val default = pm.resolveActivity(probe, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
        val all = pm.queryIntentActivities(probe, 0).map { it.activityInfo.packageName }.filter { it != own }
        // With no default set, resolveActivity names the system's chooser, which isn't among the browsers.
        return default?.takeIf { it in all } ?: all.firstOrNull()
    }
}
