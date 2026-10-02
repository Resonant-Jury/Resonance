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
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
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
import com.resonance.kit.reading.FeedLoader
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * The card box's shelves as read, kept while the tab's root is (always, until sign-out): coming
 * back to a shelf shows it as it was. A change to a card (or the blocks) has every shelf read
 * again, the one in view at once, still showing meanwhile; so does a shelf read long ago. My own
 * shelves (published, private, drafts) are read together, in one request (GET /me/cardbox), so
 * moving between them shows each at once. The published shelf is also kept on the device, so a
 * cold start draws it at once.
 */
class CardBoxModel(private val session: Session) : ViewModel() {
    val shelves = mutableStateMapOf<TabGetCardBox, List<FeedCard>>()
    var failed by mutableStateOf(false)
        private set
    private val readAt = HashMap<TabGetCardBox, Long>()
    /** The read each shelf waits for: one that answers after a newer one began doesn't overwrite it. */
    private val readBy = HashMap<TabGetCardBox, Int>()
    private var reads = 0
    private var seenChanges: Int? = null
    private val uid = session.uid

    init {
        if (uid != null) viewModelScope.launch {
            val kept = session.kept(uid)?.published() ?: return@launch
            if (!shelves.containsKey(TabGetCardBox.published)) shelves[TabGetCardBox.published] = kept
        }
    }

    /**
     * Reads `shelf` unless it was read since the last change (`changes`) and lately; `retry` always
     * does. One of my own shelves brings the others of them that are due too.
     */
    fun refresh(shelf: TabGetCardBox, changes: Int, retry: Boolean = false, now: Long = System.currentTimeMillis()) {
        if (changes != seenChanges) {
            seenChanges = changes
            readAt.clear()
        }
        val current = { s: TabGetCardBox -> readAt[s]?.let { now - it < FeedLoader.STALE_AFTER.inWholeMilliseconds } == true }
        if (!retry && current(shelf)) return
        val asked = shelvesToRead(shelf, current)
        val read = ++reads
        for (s in asked) {
            readAt[s] = now
            readBy[s] = read
        }
        viewModelScope.launch {
            try {
                val answered = session.reading.cardBox(asked)
                failed = false
                for (s in asked) {
                    if (readBy[s] != read) continue
                    val cards = answered[s]
                    if (cards == null) {
                        // Not in the answer: asked for again when next shown.
                        readAt.remove(s)
                        continue
                    }
                    shelves[s] = cards
                    if (s == TabGetCardBox.published && uid != null) session.kept(uid)?.savePublished(cards)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                failed = true
                for (s in asked) if (readBy[s] == read) readAt.remove(s)
            }
        }
    }
}

/**
 * The shelves a read of `shelf` asks for: it, and — one of my own shelves — the others of them not
 * read lately (`current`), which the server reads side by side with it.
 */
internal fun shelvesToRead(shelf: TabGetCardBox, current: (TabGetCardBox) -> Boolean): List<TabGetCardBox> =
    if (shelf !in OwnedShelves) listOf(shelf)
    else listOf(shelf) + ShelfOrder.filter { it in OwnedShelves && it != shelf && !current(it) }

/**
 * My card box (me/page.tsx): who I am, then my cards on six shelves —
 * published, private, drafts, the cards I resonated with, cards linking to
 * mine, bookmarks. The twin of iOS's CardBoxScreen; [CardBoxModel] keeps the shelves.
 */
@Composable
fun CardBoxScreen(session: Session, open: (Route) -> Unit) {
    val profile by session.profile.collectAsStateWithLifecycle()
    val model = viewModel { CardBoxModel(session) }
    var shelf by rememberSaveable { mutableStateOf(TabGetCardBox.published) }
    // The writer, a card's ⋯ or a block changed something: every shelf may have moved, so they are read again.
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    val foregrounded by session.foregrounded.collectAsStateWithLifecycle()
    val shelves = model.shelves
    val failed = model.failed
    val scope = rememberCoroutineScope()
    LaunchedEffect(shelf, changes, foregrounded) { model.refresh(shelf, changes) }

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
            cards == null && failed -> item { OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { model.refresh(shelf, changes, retry = true) }, action = EmptyAction.Outline) }
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
                    Modifier.plainClickable { open(if (resumesDrafts) Route.Write(cardId = card.id) else Route.Card(card.routeKey, card)) },
                )
                // The chip 14 in from the card's corner (the card's box sits 20 in from the screen);
                // the trigger's 44dp hit box reaches 3 past the 38dp chip.
                Box(Modifier.align(Alignment.TopEnd).padding(top = 14.dp - 3.dp, end = 34.dp - 3.dp)) {
                    CardActionsMenu(session, card.id, card.visibility.value, open, seed = hue, hue = hue)
                }
            }
            if (card.anonymous) {
                Box(Modifier.padding(start = 34.dp, end = 34.dp, top = 8.dp, bottom = 4.dp)) {
                    // Under the card, on the page's own paper: cream-dark on cream needs its rim.
                    TagPill(L10n.Me.anonymousBadge, fill = Tokens.CreamDark, size = TagSize.Sm, outlined = true)
                }
            }
        }
    }
}

private val ShelfOrder = listOf(TabGetCardBox.published, TabGetCardBox.`private`, TabGetCardBox.draft, TabGetCardBox.resonated, TabGetCardBox.linked, TabGetCardBox.bookmarks)

/**
 * The shelves as OrganicTabs' scrollable `surface` strip: the chosen one on a
 * hand-drawn wash — a light terracotta fill, R 12, its wobble sized to the
 * tab, seed 23 + the key's length × 7 as on the web. The strip is no frame
 * and the tab is one of its own, so the wash marks it without a pen line.
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
                        onDrawBehind {
                            if (selected) drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.55f))
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
    // The generated client's stand-in for a value it doesn't know (an answer from a newer server); never a shelf here.
    TabGetCardBox.unknownDefaultOpenApi -> ""
}

private fun emptyText(s: TabGetCardBox) = when (s) {
    TabGetCardBox.published -> L10n.Me.emptyPublished
    TabGetCardBox.`private` -> L10n.Me.emptyPrivate
    TabGetCardBox.draft -> L10n.Me.emptyDraft
    TabGetCardBox.resonated -> L10n.Me.emptyResonated
    TabGetCardBox.linked -> L10n.Me.emptyLinked
    TabGetCardBox.bookmarks -> L10n.Me.emptyBookmarks
    TabGetCardBox.unknownDefaultOpenApi -> ""
}
