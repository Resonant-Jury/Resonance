package com.resonance.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OklchColor
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIconButton
import com.resonance.design.SketchLoader
import com.resonance.design.WobRectShape
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.seedFromString
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.launch

/**
 * My card box (me/page.tsx): who I am, then my cards on six shelves —
 * published, private, drafts, the cards I resonated with, cards linking to
 * mine, bookmarks. The twin of iOS's CardBoxScreen.
 */
@Composable
fun CardBoxScreen(session: Session, open: (Route) -> Unit) {
    val profile by session.profile.collectAsStateWithLifecycle()
    var shelf by rememberSaveable { mutableStateOf(TabGetCardBox.published) }
    val shelves = remember { mutableStateMapOf<TabGetCardBox, List<FeedCard>>() }
    var failed by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun load(s: TabGetCardBox, force: Boolean = false) {
        if (!force && shelves.containsKey(s)) return
        runCatching { session.reading.cardBox(s) }
            .onSuccess { shelves[s] = it; failed = false }
            .onFailure { failed = true }
    }
    LaunchedEffect(shelf) { load(shelf) }

    TabScreen(L10n.App.Nav.me, trailing = {
        OrganicIconButton(IconName.Sliders, L10n.Settings.title) { open(Route.Settings) }
    }) {
        item {
            when (val p = profile) {
                is Session.Profile.Loaded -> Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Box(Modifier.clickable(onClickLabel = L10n.Me.viewPublicProfile) { open(Route.Author(p.me.handle)) }) {
                        HandDrawnAvatar(p.me.initials, p.me.avatarUrl, OklchColor.parse(p.me.accentColor) ?: Tokens.TerracottaLight, 72.dp, seedFromString(p.me.id).toDouble())
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        BasicText(p.me.handle, style = AppFonts.heading(24f))
                        BasicText(p.me.bio ?: L10n.Me.bioEmpty, style = AppFonts.body(14f, color = Tokens.TextMuted))
                    }
                }
                Session.Profile.Missing -> OrganicEmptyState(L10n.Auth.stepHandle)
                Session.Profile.Failed -> OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry) { scope.launch { session.loadMe() } }
                else -> {}
            }
        }
        item { ShelfTabs(shelf) { shelf = it } }
        val cards = shelves[shelf]
        when {
            cards == null && failed -> item { OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry) { scope.launch { load(shelf, force = true) } } }
            cards == null -> item { Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { SketchLoader(44.dp) } }
            cards.isEmpty() -> item {
                if (shelf == TabGetCardBox.published) OrganicEmptyState(L10n.Me.emptyPublished) else OrganicEmptyState(emptyText(shelf))
            }
            else -> storyCards(cards, open)
        }
    }
}

private val ShelfOrder = listOf(TabGetCardBox.published, TabGetCardBox.`private`, TabGetCardBox.draft, TabGetCardBox.resonated, TabGetCardBox.linked, TabGetCardBox.bookmarks)

/** The shelves as a row of words; the chosen one sits on a wobbly wash (the web's active tab). */
@Composable
private fun ShelfTabs(selection: TabGetCardBox, onSelect: (TabGetCardBox) -> Unit) {
    val haptic = LocalHapticFeedback.current
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        ShelfOrder.forEachIndexed { i, s ->
            val selected = s == selection
            BasicText(
                shelfTitle(s),
                style = AppFonts.body(14f, if (selected) 600 else 400, color = if (selected) Tokens.Terracotta else Tokens.TextMuted),
                modifier = Modifier
                    .drawWithCache {
                        val o = WobRectShape(14.0, i * 17.0 + 3, mag = 1.2).createOutline(size, layoutDirection, this)
                        onDrawBehind { if (selected) drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.45f)) }
                    }
                    .semantics { this.selected = selected }
                    .clickable(role = Role.Tab) {
                        haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                        onSelect(s)
                    }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
    }
}

private fun shelfTitle(s: TabGetCardBox) = when (s) {
    TabGetCardBox.published -> L10n.Me.Tabs.published
    TabGetCardBox.`private` -> L10n.Me.Tabs.private
    TabGetCardBox.draft -> L10n.Me.Tabs.draft
    TabGetCardBox.resonated -> L10n.Me.Tabs.resonated
    TabGetCardBox.linked -> L10n.Me.Tabs.linked
    TabGetCardBox.bookmarks -> L10n.Me.Tabs.bookmarks
}

private fun emptyText(s: TabGetCardBox) = when (s) {
    TabGetCardBox.published -> L10n.Me.emptyPublished
    TabGetCardBox.`private` -> L10n.Me.emptyPrivate
    TabGetCardBox.draft -> L10n.Me.emptyDraft
    TabGetCardBox.resonated -> L10n.Me.emptyResonated
    TabGetCardBox.linked -> L10n.Me.emptyLinked
    TabGetCardBox.bookmarks -> L10n.Me.emptyBookmarks
}

@Composable
fun PlaceholderScreen(title: String, message: String) {
    TabScreen(title) { item { OrganicEmptyState(message) } }
}
