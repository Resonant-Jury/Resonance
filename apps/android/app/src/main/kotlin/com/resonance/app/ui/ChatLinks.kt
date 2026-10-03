package com.resonance.app.ui

import android.content.Context
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.resonance.design.OrganicConfirmDialog
import com.resonance.kit.chat.Linkify
import com.resonance.kit.chat.Linkify.LinkAction
import com.resonance.kit.l10n.L10n

/**
 * What a tap on a link in a conversation does — one door for every link a message offers (a link in
 * its text, the preview card under it, the "Open link" of its menu), so none of them can reach
 * the browser by another way. The rules are [Linkify.action]'s: an ordinary http(s) link opens at
 * once; one whose address is not what it looks like (a number instead of a name, a punycode
 * lookalike, a port, userinfo) asks first, showing the host it really leads to
 * ([confirming], drawn by [LinkDialogs]); anything else (another scheme, no real host) opens
 * nothing and says so. Opening is the in-app browser, a Custom Tab ([InAppBrowser]): never a
 * WebView of the app's own, never another app.
 *
 * Remembered by the screen ([rememberLinkOpener]); used on the main thread.
 */
@Stable
class LinkOpener internal constructor(private val context: Context) {
    /** A link waiting for the person's yes: its normalized URL and the ASCII host it leads to. */
    var confirming by mutableStateOf<LinkAction.Confirm?>(null)
        private set

    /** The link [url] was tapped (or chosen from a menu). */
    fun tap(url: String) {
        when (val action = Linkify.action(url)) {
            is LinkAction.Open -> InAppBrowser.open(context, action.url)
            is LinkAction.Confirm -> confirming = action
            LinkAction.Unsupported -> Toast.makeText(context, L10n.Messages.linkUnsupported, Toast.LENGTH_SHORT).show()
        }
    }

    /** The person said yes to the link they were asked about. */
    fun confirm() {
        val link = confirming ?: return
        confirming = null
        InAppBrowser.open(context, link.url)
    }

    /** The person said no. */
    fun dismiss() {
        confirming = null
    }
}

@Composable
fun rememberLinkOpener(): LinkOpener {
    val context = LocalContext.current
    return remember(context) { LinkOpener(context) }
}

/** The question a [LinkOpener] asks before it opens a link that isn't what it looks like. */
@Composable
fun LinkDialogs(opener: LinkOpener) {
    val link = opener.confirming ?: return
    OrganicConfirmDialog(
        title = L10n.Messages.linkConfirmTitle,
        body = L10n.Messages.linkConfirmBody(link.host),
        cancelLabel = L10n.Messages.linkConfirmCancel,
        confirmLabel = L10n.Messages.linkConfirmOpen,
        onCancel = opener::dismiss,
        onConfirm = opener::confirm,
        seed = 83.0,
    )
}
