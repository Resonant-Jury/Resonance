package com.resonance.app.ui

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.ConversationsStore
import com.resonance.app.Person
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CountBadge
import com.resonance.design.CssText
import com.resonance.design.EmptyAction
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OklchColor
import com.resonance.design.OrganicEmptyState
import com.resonance.design.WobRectShape
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.seedFromString
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Date

/**
 * Messages (MessagesPage.tsx, phone): your conversations, newest first, then
 * the people you're connected with but haven't talked to yet. Live: the rows
 * and the tab's badge follow Firestore as messages arrive. The twin of iOS's
 * ConversationsScreen.
 */
@Composable
fun ConversationsScreen(session: Session, open: (Route) -> Unit) {
    val state by session.conversations.state.collectAsStateWithLifecycle()
    TabScreen(L10n.App.Nav.messages, headerSpacing = 8.dp) {
        if (state.loaded && state.conversations.isEmpty() && state.starters.isEmpty()) {
            item {
                CssText(
                    L10n.Messages.empty, AppFonts.Family.Body, 14f, lineHeight = 1.7f, color = Tokens.TextMuted,
                    modifier = Modifier.padding(start = 16.dp, end = 18.dp, top = 10.dp),
                )
            }
        } else if (!state.loaded && state.failed) {
            // Nothing read, and a listener failed: a retry rather than an empty page.
            item { OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { session.conversations.resume() }, action = EmptyAction.Outline) }
        }
        items(state.conversations, key = { "c:${it.id}" }) { convo ->
            ConversationRow(convo.other, preview(convo), convo.sentAt?.let(::rowTime), convo.unread, open)
        }
        if (state.starters.isNotEmpty()) {
            item {
                BasicText(
                    L10n.Messages.startSection.uppercase(),
                    style = AppFonts.body(11f, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.08.em),
                    // The page's 14 plus the list pane's own 2 / 4.
                    modifier = Modifier.padding(start = 16.dp, end = 18.dp).padding(top = 16.dp, bottom = 4.dp).padding(horizontal = 14.dp),
                )
            }
            items(state.starters, key = { "s:${it.id}" }) { person ->
                ConversationRow(person, L10n.Messages.noMessagesYet, null, 0, open)
            }
        }
    }
}

private fun preview(convo: ConversationsStore.Conversation): String {
    val text = convo.lastText ?: return L10n.Messages.noMessagesYet
    return (if (convo.lastFromMe) L10n.Messages.youPrefix else "") + text
}

/** Today: the time, two-digit hour as the web's Intl (下午03:04); earlier: the date (9/29). */
internal fun rowTime(date: Date, today: LocalDate = LocalDate.now()): String {
    val zoned = date.toInstant().atZone(ZoneId.systemDefault())
    val locale = Strings.language.locale
    val pattern = if (zoned.toLocalDate() == today) {
        if (Strings.language == Strings.Language.ZhTW) "ahh:mm" else "hh:mm a"
    } else {
        "M/d"
    }
    return zoned.format(DateTimeFormatter.ofPattern(pattern, locale))
}

/**
 * One row: the avatar, the pen name over the last line, the time and the
 * unread badge on the right; a faint hand-drawn wash while pressed (RowWash:
 * R h·0.28, three turns across).
 */
@Composable
private fun ConversationRow(person: Person, preview: String, time: String?, unread: Int, open: (Route) -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val seed = seedFromString(person.id).toDouble()
    Row(
        Modifier
            // The page's 14 plus the list pane's own 2 / 4.
            .padding(start = 16.dp, end = 18.dp)
            .fillMaxWidth()
            .drawWithCache {
                val h = (size.height / density).toDouble()
                val outline = WobRectShape(
                    h * 0.28, seed, mag = 2.4,
                    options = WobRectOptions(curve = 1.3, cornerJitter = 2.4, cornerOffset = h * 0.05, segmentsH = SegValue.Count(3.0), segmentsV = SegValue.Count(1.0)),
                ).createOutline(size, layoutDirection, this)
                onDrawBehind { if (pressed) drawOutline(outline, Color.Black.copy(alpha = 0.045f)) }
            }
            .clickable(source, indication = null, role = Role.Button) { open(Route.Thread(person.handle, uid = person.id)) }
            .padding(vertical = 12.dp, horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        HandDrawnAvatar(
            person.initials, person.avatarUrl, person.accentColor?.let(OklchColor::parse) ?: Tokens.TerracottaLight,
            size = 40.dp, seed = seedOr(person.avatarSeed, 5.0),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(person.handle, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(14f, 600, lineHeight = 1.3f))
            BasicText(preview, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted))
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(5.dp)) {
            if (time != null) BasicText(time, maxLines = 1, style = AppFonts.body(11f, lineHeight = 1.3f, color = Tokens.TextMuted))
            if (unread > 0) CountBadge(unread)
        }
    }
}
