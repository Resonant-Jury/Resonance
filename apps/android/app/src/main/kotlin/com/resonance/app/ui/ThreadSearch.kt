package com.resonance.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.ChatText
import com.resonance.design.OrganicIcon
import com.resonance.design.SketchLoader
import com.resonance.design.WavyDivider
import com.resonance.design.cream
import com.resonance.design.fieldHintStyle
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.highlightWash
import com.resonance.kit.chat.ChatMessage
import com.resonance.kit.chat.SearchHit
import com.resonance.kit.chat.SearchSnippet
import com.resonance.kit.l10n.L10n
import java.time.LocalDate
import java.time.ZoneId
import java.util.Date

/**
 * Search in a conversation, the way LINE does it: what is typed in the bar lists the messages that
 * match, newest first, over the thread; a tap on one leaves the list and takes the thread to that
 * message with the words marked, and the bar then steps from match to match.
 */

/** The bar's search field: the glyph, the field, and (once a result was chosen) where in the matches the thread is. */
@Composable
internal fun RowScope.SearchField(
    query: String,
    onQuery: (String) -> Unit,
    focus: FocusRequester,
    onFocus: () -> Unit,
    onSearch: () -> Unit,
) {
    OrganicIcon(IconName.Search, size = 17.dp, color = Tokens.TextMuted)
    Box(Modifier.weight(1f).height(40.dp).padding(start = 8.dp), contentAlignment = Alignment.CenterStart) {
        if (query.isEmpty()) BasicText(L10n.Messages.searchPlaceholder, maxLines = 1, style = fieldHintStyle(14f, 1.3f))
        BasicTextField(
            query, onQuery,
            singleLine = true,
            textStyle = AppFonts.body(14f, lineHeight = 1.3f),
            cursorBrush = SolidColor(Tokens.Text),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focus)
                .onFocusChanged { if (it.isFocused) onFocus() }
                .semantics { contentDescription = L10n.Messages.menuSearch },
        )
    }
}

/** The bar's step through the matches: "3/12" and two chevrons, the first toward older messages. */
@Composable
internal fun RowScope.SearchSteps(position: Int, count: Int, canGoOlder: Boolean, canGoNewer: Boolean, onOlder: () -> Unit, onNewer: () -> Unit) {
    BasicText(
        L10n.Messages.searchPosition(position.toString(), count),
        maxLines = 1,
        style = AppFonts.body(12f, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(fontFeatureSettings = "tnum"),
    )
    StepButton(180f, L10n.Messages.searchPrevious, canGoOlder, onOlder)
    StepButton(0f, L10n.Messages.searchNext, canGoNewer, onNewer)
}

@Composable
private fun StepButton(rotation: Float, label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(40.dp)
            .clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        OrganicIcon(IconName.ChevronDown, size = 18.dp, color = if (enabled) Tokens.Text else Tokens.TextMuted.copy(alpha = 0.4f), rotation = rotation)
    }
}

/**
 * The list of matches that covers the thread: how many, a loader while older messages are still
 * being read in for the search, then a row for each — who, when, and the words around the match
 * with the match marked — parted by wavy rules.
 */
@Composable
internal fun SearchResults(
    model: ThreadModel,
    query: String,
    top: Dp,
    state: LazyListState,
    onPick: (SearchHit) -> Unit,
    modifier: Modifier = Modifier,
) {
    val hits = model.searchHits
    val byId = remember(model.messages) { model.messages.associateBy { it.id } }
    val blank = query.isBlank()
    Box(modifier.fillMaxSize().cream().pointerInput(Unit) {}) {
        if (blank) {
            BasicText(
                L10n.Messages.searchHint,
                style = AppFonts.body(14f, lineHeight = 1.6f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
                modifier = Modifier.fillMaxWidth().padding(top = top + 48.dp, start = 40.dp, end = 40.dp),
            )
        } else {
            LazyColumn(Modifier.fillMaxSize(), state = state, contentPadding = PaddingValues(top = top + 4.dp, bottom = 24.dp)) {
                item(key = "count") {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        // Hits grow while older messages arrive: the count says what is known so far.
                        if (hits.isNotEmpty() || !model.searchLoading) {
                            BasicText(L10n.Messages.searchCount(hits.size), style = AppFonts.body(12.5f, 600, lineHeight = 1.3f, color = Tokens.TextMuted))
                        }
                        if (model.searchLoading) {
                            SketchLoader(16.dp)
                            BasicText(L10n.Messages.searchSearching, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted))
                        }
                    }
                }
                itemsIndexed(hits, key = { _, h -> h.messageId }) { i, hit ->
                    val message = byId[hit.messageId]
                    if (i > 0) WavyDivider(seed = (131 + (i % 7) * 17).toDouble(), modifier = Modifier.padding(horizontal = 20.dp))
                    if (message != null) ResultRow(message, hit, model.isMine(message), model.other?.handle.orEmpty()) { onPick(hit) }
                }
            }
        }
    }
}

@Composable
private fun ResultRow(message: ChatMessage, hit: SearchHit, mine: Boolean, otherHandle: String, onClick: () -> Unit) {
    val snippet = remember(message.text, hit) { SearchSnippet.of(message.text, hit.ranges) }
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BasicText(
                if (mine) L10n.Messages.you else otherHandle, maxLines = 1,
                style = AppFonts.body(12.5f, 600, lineHeight = 1.3f, color = if (mine) Tokens.Terracotta else Tokens.Text),
                modifier = Modifier.weight(1f, fill = false),
            )
            Box(Modifier.weight(1f))
            BasicText(resultTime(message.sentAt), maxLines = 1, style = AppFonts.body(11f, lineHeight = 1.3f, color = Tokens.TextMuted))
        }
        ChatText(
            snippet.text,
            sizeSp = 14f, lineHeight = 1.5f, maxLines = 2,
            highlights = snippet.ranges, highlightColor = highlightWash(false), highlightWeight = 600,
        )
    }
}

/** When a result was written: the time today, the day this year, the day and year before. */
internal fun resultTime(date: Date): String {
    val zone = ZoneId.systemDefault()
    val day = date.toInstant().atZone(zone).toLocalDate()
    val today = LocalDate.now(zone)
    return when {
        day == today -> timeLabel(date)
        day.year == today.year -> dayLabel(date)
        else -> "${day.year} · ${dayLabel(date)}"
    }
}
