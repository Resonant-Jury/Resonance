package com.resonance.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CardPalette
import com.resonance.design.StoryCard
import com.resonance.design.TagPill
import com.resonance.design.TagSize
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OklchColor
import com.resonance.design.OrganicEmptyState
import com.resonance.design.ButtonVariant
import com.resonance.design.EmptyAction
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicListEmpty
import com.resonance.design.Skeleton
import com.resonance.design.plainClickable
import com.resonance.design.storyCardSkeletons
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
    // The writer or a card's ⋯ changed something: every shelf may have moved, so they are read again.
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    val shelves = remember(changes) { mutableStateMapOf<TabGetCardBox, List<FeedCard>>() }
    var failed by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun load(s: TabGetCardBox, force: Boolean = false) {
        if (!force && shelves.containsKey(s)) return
        runCatching { session.reading.cardBox(s) }
            .onSuccess { shelves[s] = it; failed = false }
            .onFailure { failed = true }
    }
    LaunchedEffect(shelf, changes) { load(shelf) }

    TabScreen(L10n.App.Nav.me) {
        item {
            when (val p = profile) {
                is Session.Profile.Loaded -> Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Box(Modifier.clickable(onClickLabel = L10n.Me.viewPublicProfile) { open(Route.Author(p.me.handle)) }) {
                        HandDrawnAvatar(p.me.initials, p.me.avatarUrl, OklchColor.parse(p.me.accentColor) ?: Tokens.TerracottaLight, 72.dp, seedFromString(p.me.id).toDouble())
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        BasicText(p.me.handle, style = AppFonts.heading(24f))
                        BasicText(p.me.bio ?: L10n.Me.bioEmpty, style = AppFonts.body(14f, color = Tokens.TextMuted))
                    }
                    // /me on phones: the identity row ends on a compact chip holding the pen, the app's settings glyph.
                    OrganicButton(L10n.Me.editProfile, variant = ButtonVariant.Ghost, icon = IconName.Pen, iconOnly = true) { open(Route.Settings) }
                }
                Session.Profile.Missing -> OrganicEmptyState(L10n.Auth.stepHandle)
                Session.Profile.Failed -> OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { scope.launch { session.loadMe() } }, action = EmptyAction.Outline)
                // Still loading: the identity row's shape in shimmering blocks.
                else -> Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Skeleton(height = 72.dp, circle = true)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Skeleton(Modifier.width(140.dp), height = 24.dp)
                        Skeleton(Modifier.fillMaxWidth(0.7f), height = 14.dp)
                    }
                }
            }
        }
        item { ShelfTabs(shelf, openMap = { open(Route.ThoughtMap) }) { shelf = it } }
        val cards = shelves[shelf]
        when {
            cards == null && failed -> item { OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { scope.launch { load(shelf, force = true) } }, action = EmptyAction.Outline) }
            cards == null -> storyCardSkeletons(6)
            // ProfileTabs' empty shelf: one muted line, centred; the empty published shelf
            // also points at the first story (ux §4).
            cards.isEmpty() -> item {
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 40.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    BasicText(emptyText(shelf), style = AppFonts.body(16f, lineHeight = 1.6f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
                    if (shelf == TabGetCardBox.published) OrganicButton(L10n.Me.emptyPublishedCta) { open(Route.Write()) }
                }
            }
            // The linked shelf lists the pared-back cards, as the web's MiniCardGrid does.
            shelf == TabGetCardBox.linked -> miniCards(cards, open, keyPrefix = "linked:")
            shelf in OwnedShelves -> managedCards(session, cards, open, resumesDrafts = shelf == TabGetCardBox.draft)
            else -> storyCards(cards, open)
        }
    }
}

/** The shelves of my own cards (OWNED_TABS): each card gets its ⋯. */
private val OwnedShelves = setOf(TabGetCardBox.published, TabGetCardBox.`private`, TabGetCardBox.draft)

/**
 * My own cards (ProfileTabs' managed shelves): each with the owner's ⋯ over
 * its top-right corner, and the anonymous badge under an anonymous one (my
 * own byline shows on it here — the badge marks it instead). A draft has no
 * page yet, so tapping it resumes writing.
 */
private fun LazyListScope.managedCards(session: Session, cards: List<FeedCard>, open: (Route) -> Unit, resumesDrafts: Boolean) {
    itemsIndexed(cards, key = { _, c -> c.id }) { i, card ->
        val hue = CardPalette(card.accentHue, i).hue
        Column(Modifier.fillMaxWidth()) {
            Box {
                StoryCard(
                    card.story(), i, i == cards.lastIndex,
                    Modifier.plainClickable { open(if (resumesDrafts) Route.Write(cardId = card.id) else Route.Card(card.routeKey)) },
                )
                // The chip 14 in from the card's corner (the card's box sits 20 in from the screen);
                // the trigger's 44dp hit box reaches 3 past the 38dp chip.
                Box(Modifier.align(Alignment.TopEnd).padding(top = 14.dp - 3.dp, end = 34.dp - 3.dp)) {
                    CardActionsMenu(session, card.id, card.visibility.value, card.routeKey, open, seed = hue, hue = hue)
                }
            }
            if (card.anonymous) {
                Box(Modifier.padding(start = 34.dp, end = 34.dp, top = 8.dp, bottom = 4.dp)) {
                    TagPill(L10n.Me.anonymousBadge, fill = Tokens.CreamDark, size = TagSize.Sm)
                }
            }
        }
    }
}

private val ShelfOrder = listOf(TabGetCardBox.published, TabGetCardBox.`private`, TabGetCardBox.draft, TabGetCardBox.resonated, TabGetCardBox.linked, TabGetCardBox.bookmarks)

/**
 * The shelves as OrganicTabs' scrollable `surface` strip: the chosen one on a
 * hand-drawn surface — terracotta pen around a light wash, R 12, its wobble
 * sized to the tab, seed 23 + the key's length × 7 as on the web.
 */
@Composable
private fun ShelfTabs(selection: TabGetCardBox, openMap: () -> Unit, onSelect: (TabGetCardBox) -> Unit) {
    val haptic = LocalHapticFeedback.current
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 7.dp).padding(top = 20.dp, bottom = 28.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ShelfOrder.forEach { s ->
            val selected = s == selection
            BasicText(
                shelfTitle(s),
                style = AppFonts.body(14f, if (selected) 600 else 500, lineHeight = 1.3f, color = if (selected) Tokens.Terracotta else Tokens.TextMuted),
                modifier = Modifier
                    .drawWithCache {
                        val o = WobRectShape(12.0, 23.0 + s.value.length * 7).createOutline(size, layoutDirection, this)
                        val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                        onDrawBehind {
                            if (selected) {
                                drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.45f))
                                drawOutline(o, Tokens.Terracotta, style = pen)
                            }
                        }
                    }
                    .semantics { this.selected = selected }
                    .plainClickable(role = Role.Tab) {
                        haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                        onSelect(s)
                    }
                    .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 14.dp),
            )
        }
        // The thought map is the strip's last tab; it opens its own screen (OrganicTabs' thoughtMapHref).
        BasicText(
            L10n.Me.Tabs.thoughtMap,
            style = AppFonts.body(14f, 500, lineHeight = 1.3f, color = Tokens.TextMuted),
            modifier = Modifier
                .plainClickable(role = Role.Button, onClick = openMap)
                .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 14.dp),
        )
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
