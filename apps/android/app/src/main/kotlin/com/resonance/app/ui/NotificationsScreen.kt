package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.NotificationsStore
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.EmptyAction
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicListEmpty
import com.resonance.design.plainClickable
import com.resonance.design.SketchLoader
import com.resonance.design.WavyDivider
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n

/**
 * Notifications, live (web: NotificationBell). Each one says who did what; a
 * note shows its words; tapping opens where it happened and marks it read.
 */
@Composable
fun NotificationsScreen(session: Session, open: (Route) -> Unit) {
    val items by session.notifications.items.collectAsStateWithLifecycle()
    val loaded by session.notifications.loaded.collectAsStateWithLifecycle()
    val failed by session.notifications.failed.collectAsStateWithLifecycle()
    TabScreen(L10n.App.Nav.notifications) {
        when {
            // Nothing read, and the listener failed: a retry, not a loader forever.
            !loaded && failed -> item {
                OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { session.notifications.resume() }, action = EmptyAction.Outline)
            }
            !loaded -> item { Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) { SketchLoader(48.dp) } }
            items.isEmpty() -> item { OrganicListEmpty(L10n.App.Notifications.empty, modifier = Modifier.padding(horizontal = 20.dp)) }
            else -> itemsIndexed(items, key = { _, it -> it.id }) { i, item ->
                Column(Modifier.padding(horizontal = 20.dp)) {
                    if (i > 0) WavyDivider(seed = 29.0 + i * 7)
                    NotificationRow(item, session, open)
                }
            }
        }
    }
}

/**
 * One row as the bell's list draws it: 14px, the text color while unread and
 * muted once read (never bolder), a 6px terracotta dot 8 after the words.
 */
@Composable
private fun NotificationRow(item: NotificationsStore.Item, session: Session, open: (Route) -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .plainClickable {
                session.notifications.markRead(item)
                routeFor(item)?.let(open)
            }
            .padding(horizontal = 2.dp, vertical = 13.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BasicText(
                textFor(item),
                style = AppFonts.body(14f, lineHeight = 1.5f, color = if (item.isUnread) Tokens.Text else Tokens.TextMuted),
                modifier = Modifier.weight(1f, fill = false),
            )
            if (item.isUnread) Box(
                Modifier.size(6.dp).semantics { contentDescription = "unread" }.drawBehind { drawCircle(Tokens.Terracotta) },
            )
        }
        if (item.type == "note" && !item.preview.isNullOrEmpty()) {
            BasicText("「${item.preview}」", style = AppFonts.body(13f, color = Tokens.TextMuted))
        }
    }
}

private fun textFor(item: NotificationsStore.Item): String {
    val handle = item.fromHandle ?: ""
    return when (item.type) {
        "invite" -> L10n.App.Notifications.invite(handle)
        "invite_accepted" -> L10n.App.Notifications.inviteAccepted(handle)
        "message" -> L10n.App.Notifications.message(handle)
        "resonance_summary" -> L10n.App.Notifications.resonanceSummary(item.count ?: 0)
        "translation_done" -> L10n.App.Notifications.translationDone
        "resonance" -> L10n.App.Notifications.resonance(handle)
        "note" -> L10n.App.Notifications.note(handle)
        "card_link" -> L10n.App.Notifications.cardLink(handle)
        else -> item.type
    }
}

/**
 * Where a notification leads (the web's hrefs, NotificationBell): these open the
 * conversation with that person (by who they are, so a pen name changed since
 * still finds them); a note arrives quoted, ready to answer.
 */
private fun routeFor(item: NotificationsStore.Item): Route? = when (item.type) {
    "translation_done", "card_link" -> item.cardId?.let { Route.Card(it) }
    "note" -> item.fromHandle?.let { handle -> Route.Thread(handle, item.cardId?.takeIf { item.noteId != null }, item.noteId?.takeIf { item.cardId != null }, item.fromUserId) }
    "invite_accepted", "message", "resonance" -> item.fromHandle?.let { Route.Thread(it, uid = item.fromUserId) }
    else -> null
}
