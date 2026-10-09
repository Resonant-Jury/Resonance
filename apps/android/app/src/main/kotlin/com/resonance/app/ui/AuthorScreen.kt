package com.resonance.app.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.ui.unit.em
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.resonance.design.generated.IconName
import com.resonance.design.OrganicIcon
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.resonance.api.models.FeedCard
import com.resonance.api.models.Profile
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicInlineBar
import com.resonance.design.SquareFlag
import com.resonance.design.inlineBarTop
import com.resonance.design.ButtonVariant
import com.resonance.design.EmptyAction
import com.resonance.design.OrganicButton
import com.resonance.design.Skeleton
import com.resonance.design.storyCardSkeletons
import com.resonance.geometry.seedFromString
import com.resonance.design.cream
import com.resonance.design.generated.Tokens
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.NextPage
import com.resonance.kit.api.next
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.reading.FeedLoader
import com.resonance.kit.reading.profilePage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * A person's page state, kept while the page is on its stack: back from one of their cards finds
 * it as it was (the pages of cards read so far included) — read again after a change to a card
 * or the blocks, or when it was read long ago.
 */
class AuthorModel(private val session: Session, private val handle: String) : ViewModel() {
    var phase by mutableStateOf("loading")
        private set
    var profile by mutableStateOf<Profile?>(null)
        private set
    var cards by mutableStateOf<List<FeedCard>>(emptyList())
        private set
    var linked by mutableStateOf<List<FeedCard>>(emptyList())
        private set
    /** Where their cards' next page starts (null: no more, or being read). */
    private var next: NextPage? = null
    private var readFor: Int? = null
    private var readAt = 0L
    private var reading: Job? = null

    /** Reads the page unless it was read since the last change (`changes`) and lately; `force` always does (a retry). */
    fun refresh(changes: Int, force: Boolean = false, now: Long = System.currentTimeMillis()) {
        val current = changes == readFor && now - readAt < FeedLoader.STALE_AFTER.inWholeMilliseconds
        if (current && !force && phase != "failed") return
        readFor = changes
        readAt = now
        reading?.cancel()
        reading = viewModelScope.launch { load() }
    }

    private suspend fun load() {
        if (profile == null) phase = "loading"
        try {
            // The profile, their cards and the cards linking to theirs, asked for together.
            val page = session.reading.profilePage(handle)
            profile = page.profile
            cards = page.cards.cards
            next = page.cards.next
            linked = page.links
            phase = "loaded"
        } catch (e: CancellationException) {
            throw e
        } catch (e: ApiFailure) {
            phase = if (e.isNotFound) "notFound" else "failed"
        } catch (e: Exception) {
            phase = "failed"
        }
    }

    /** The next page of their cards, once the list reaches its end. */
    fun loadMore() {
        val after = next ?: return
        next = null
        viewModelScope.launch {
            runCatching { session.reading.profileCards(handle, after = after) }.onSuccess { cards = cards + it.cards; next = it.next }
        }
    }
}

/** A person's page (u/[handle]/page.tsx). */
@Composable
fun AuthorScreen(session: Session, handle: String, open: (Route) -> Unit, back: () -> Unit) {
    val model = viewModel { AuthorModel(session, handle) }
    val phase = model.phase
    val profile = model.profile
    val cards = model.cards
    val linked = model.linked
    // A block or unblock changes the blocks, which re-reads the page (once) with every card screen.
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    val foregrounded by session.foregrounded.collectAsStateWithLifecycle()
    LaunchedEffect(changes, foregrounded) { model.refresh(changes) }
    val reload: () -> Unit = { model.refresh(changes) }
    val retry: () -> Unit = { model.refresh(changes, force = true) }

    val list = rememberLazyListState()
    // The bar lies over the page, so what scrolls shows right up to its pen line.
    val top = inlineBarTop()
    Box(Modifier.fillMaxSize().cream()) {
    Column(Modifier.fillMaxSize()) {
        when (phase) {
            // The web's profile skeleton: the masthead's blocks, then four loading cards.
            "loading" -> LazyColumn(Modifier.fillMaxSize(), userScrollEnabled = false, contentPadding = PaddingValues(top = top)) {
                item { ProfileHeroSkeleton() }
                storyCardSkeletons(4)
            }
            "notFound" -> Box(Modifier.padding(top = top)) {
                OrganicEmptyState(title = L10n.Profile.notFound, actionTitle = L10n.Profile.backHome, onAction = back, action = EmptyAction.Link, verticalPadding = 40.dp)
            }
            "failed" -> Box(Modifier.padding(top = top)) {
                OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, retry, action = EmptyAction.Outline)
            }
            else -> profile?.let { p ->
                val a = p.author
                LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(top = top, bottom = 48.dp)) {
                    item {
                        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            HandDrawnAvatar(a.initials, a.avatarUrl, a.accent(), 96.dp, a.avatarSeedValue())
                            BasicText(a.handle, style = AppFonts.heading(32f, lineHeight = 1.2f))
                            BasicText(p.bio ?: L10n.Profile.bioEmpty, style = AppFonts.body(15f, lineHeight = 1.6f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
                            // page.module.css .meta: centred, 6 × 14 apart, 13 muted; the count leads with the cards glyph.
                            val meta = AppFonts.body(13f, color = Tokens.TextMuted)
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterHorizontally),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                                itemVerticalAlignment = Alignment.CenterVertically,
                            ) {
                                // page.module.css .metaItem: the SquareFlag, 5 before the name.
                                a.region?.let {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                        SquareFlag(it, 16.dp)
                                        BasicText(regionLabel(it), style = meta)
                                    }
                                }
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                    OrganicIcon(IconName.Cards, size = 14.dp, color = Tokens.TextMuted)
                                    BasicText(L10n.Profile.cardCount(count = p.cardCount), style = meta)
                                }
                                BasicText(L10n.Profile.joined(date = joinedMonth(p.joinedAt)), style = meta)
                                if (!p.isSelf && p.isConnected) {
                                    OrganicIcon(IconName.UserCheck, Modifier.semantics { contentDescription = L10n.Profile.connected }, size = 20.dp, color = Tokens.Terracotta)
                                }
                            }
                            // Connected: a way into the conversation (the web's small ghost button with the chat glyph).
                            if (!p.isBlocked && !p.isSelf && p.isConnected) {
                                OrganicButton(L10n.Messages.messageLink, Modifier.padding(top = 4.dp), variant = ButtonVariant.Tonal, icon = IconName.Chat, small = true) {
                                    open(Route.Thread(a.handle, uid = a.id))
                                }
                            }
                        }
                    }
                    if (p.isBlocked) {
                        item { BlockedNotice(session, a.id, a.handle, reload) }
                    } else if (cards.isNotEmpty() || p.isSelf) {
                        item { SectionHeading(L10n.Profile.publishedHeading) }
                        if (cards.isEmpty()) {
                            // The owner's empty page teaches rather than apologizes.
                            item {
                                Column(
                                    Modifier.fillMaxWidth().padding(horizontal = 24.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(18.dp),
                                ) {
                                    BasicText(
                                        L10n.Profile.emptyPublishedSelf,
                                        style = AppFonts.body(15f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
                                    )
                                    OrganicButton(L10n.Profile.emptyPublishedCta) { open(Route.Write()) }
                                }
                            }
                        } else storyCards(cards, open, onLast = model::loadMore)
                    }
                    if (linked.isNotEmpty()) {
                        item { SectionHeading(L10n.Profile.linkedCards, Modifier.padding(top = 48.dp)) }
                        miniCards(linked, open, keyPrefix = "linked:")
                    }
                }
            }
        }
    }
    OrganicInlineBar(L10n.App.Nav.back, back, scrolled = list.scrolledPast20()) {
        profile?.takeIf { !it.isSelf }?.let { p ->
            SafetyMenu(session, SafetyService.Target.User(p.author.id), p.author.handle, p.isBlocked, seed = seedFromString(p.author.id).toDouble(), onChange = reload)
        }
    }
    }
}

/**
 * ProfileSafety's BlockedNotice: who is blocked and what that means, and a
 * small terracotta-text Unblock (no frame of its own) that fades while it works; the page then re-reads.
 */
@Composable
private fun BlockedNotice(session: Session, userId: String, handle: String, onUnblocked: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BasicText(L10n.Safety.blockedNotice(handle = handle), style = AppFonts.heading(20f, lineHeight = 1.3f).copy(textAlign = TextAlign.Center))
        BasicText(
            L10n.Safety.blockedNoticeBody,
            style = AppFonts.body(14.5f, lineHeight = 1.6f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
            modifier = Modifier.padding(bottom = 8.dp),
        )
        OrganicButton(if (busy) "…" else L10n.Safety.unblock, variant = ButtonVariant.Tonal, small = true, enabled = !busy) {
            busy = true
            scope.launch {
                runCatching { session.safety?.unblock(userId) }.onSuccess { onUnblocked() }
                busy = false
            }
        }
    }
}

/** The profile masthead while it loads (the web's skel blocks): avatar, name, two bio lines, the meta line. */
@Composable
private fun ProfileHeroSkeleton() {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Skeleton(height = 96.dp, circle = true)
        Skeleton(Modifier.fillMaxWidth(0.6f).widthIn(max = 220.dp), height = 34.dp, radius = 10.dp)
        Skeleton(Modifier.fillMaxWidth(0.8f).widthIn(max = 440.dp), height = 16.dp, radius = 8.dp)
        Skeleton(Modifier.fillMaxWidth(0.6f).widthIn(max = 300.dp), height = 16.dp, radius = 8.dp)
        Skeleton(Modifier.fillMaxWidth(0.7f).widthIn(max = 280.dp), height = 13.dp, radius = 8.dp)
    }
    Spacer(Modifier.height(28.dp))
}

/** "TW" → "台灣" in the interface language (its SquareFlag is drawn beside it); free text stays as it is. */
fun regionLabel(region: String): String = Regions.label(region)

/** page.module.css .sectionHeading on a phone: 20/700, -0.01em, left-aligned on the page margin, 24 below. */
@Composable
private fun SectionHeading(title: String, modifier: Modifier = Modifier) {
    BasicText(
        title,
        style = AppFonts.heading(20f, lineHeight = 1.3f).copy(letterSpacing = (-0.01).em),
        modifier = modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 24.dp).semantics { heading() },
    )
}

/** "August 2026" / "2026年8月": the web's joined date, year and long month in the interface language. */
private fun joinedMonth(iso: String?): String = iso?.let {
    runCatching {
        java.time.OffsetDateTime.parse(it).format(
            java.time.format.DateTimeFormatter.ofPattern(if (Strings.language == Strings.Language.ZhTW) "y年M月" else "MMMM y", Strings.language.locale),
        )
    }.getOrNull()
} ?: ""
