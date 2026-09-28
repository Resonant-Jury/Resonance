package com.resonance.app.ui

import androidx.compose.foundation.clickable
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
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.NotificationsStore
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.OrganicEmptyState
import com.resonance.design.SketchLoader
import com.resonance.design.WavyDivider
import com.resonance.design.WobCircleShape
import com.resonance.design.generated.Tokens
import com.resonance.geometry.WobCircleOptions
import com.resonance.kit.l10n.L10n

/**
 * Notifications, live (web: NotificationBell). Each one says who did what; a
 * note shows its words; tapping opens where it happened and marks it read.
 */
@Composable
fun NotificationsScreen(session: Session, open: (Route) -> Unit) {
    val items by session.notifications.items.collectAsStateWithLifecycle()
    val loaded by session.notifications.loaded.collectAsStateWithLifecycle()
    TabScreen(L10n.App.Nav.notifications) {
        when {
            !loaded -> item { Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) { SketchLoader(48.dp) } }
            items.isEmpty() -> item { OrganicEmptyState(L10n.App.Notifications.empty) }
            else -> itemsIndexed(items, key = { _, it -> it.id }) { i, item ->
                if (i > 0) Box(Modifier.padding(horizontal = 20.dp)) { WavyDivider(seed = 29.0 + i * 7) }
                NotificationRow(item, session, open)
            }
        }
    }
}

@Composable
private fun NotificationRow(item: NotificationsStore.Item, session: Session, open: (Route) -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clickable {
                session.notifications.markRead(item)
                routeFor(item)?.let(open)
            }
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BasicText(
                textFor(item),
                style = AppFonts.body(15f, if (item.isUnread) 600 else 400, lineHeight = 1.5f, color = if (item.isUnread) Tokens.Text else Tokens.TextMuted),
                modifier = Modifier.weight(1f, fill = false),
            )
            if (item.isUnread) Box(
                Modifier.size(7.dp).semantics { contentDescription = "unread" }.drawWithCache {
                    val o = WobCircleShape(17.0, WobCircleOptions(segments = 6, mag = 0.4, cpJitter = 0.3)).createOutline(size, layoutDirection, this)
                    onDrawBehind { drawOutline(o, Tokens.Terracotta) }
                },
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

/** Where a notification leads (the web's hrefs). Conversations arrive in A4; until then the person's page stands in. */
private fun routeFor(item: NotificationsStore.Item): Route? = when (item.type) {
    "translation_done", "card_link" -> item.cardId?.let(Route::Card)
    "invite_accepted", "message", "resonance", "note" -> item.fromHandle?.let(Route::Author)
    else -> null
}
