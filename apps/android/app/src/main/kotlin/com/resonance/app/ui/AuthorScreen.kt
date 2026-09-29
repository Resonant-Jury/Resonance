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
import com.resonance.api.models.FeedCard
import com.resonance.api.models.Profile
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicInlineBar
import com.resonance.design.ButtonVariant
import com.resonance.design.EmptyAction
import com.resonance.design.OrganicButton
import com.resonance.design.Skeleton
import com.resonance.design.storyCardSkeletons
import com.resonance.geometry.seedFromString
import com.resonance.design.cream
import com.resonance.design.generated.Tokens
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.launch
import java.util.Locale

/** A person's page (u/[handle]/page.tsx). */
@Composable
fun AuthorScreen(session: Session, handle: String, open: (Route) -> Unit, back: () -> Unit) {
    val scope = rememberCoroutineScope()
    var phase by remember(handle) { mutableStateOf("loading") }
    var profile by remember(handle) { mutableStateOf<Profile?>(null) }
    var cards by remember(handle) { mutableStateOf<List<FeedCard>>(emptyList()) }
    var linked by remember(handle) { mutableStateOf<List<FeedCard>>(emptyList()) }
    var cursor by remember(handle) { mutableStateOf<String?>(null) }
    // Bumped after a block or unblock, so the page re-reads what the viewer may see.
    var reload by remember(handle) { mutableStateOf(0) }

    LaunchedEffect(handle, reload) {
        if (profile == null) phase = "loading"
        try {
            profile = session.reading.profile(handle)
            val page = session.reading.profileCards(handle)
            cards = page.cards
            cursor = page.nextCursor
            linked = runCatching { session.reading.profileLinks(handle) }.getOrDefault(emptyList())
            phase = "loaded"
        } catch (e: ApiFailure) {
            phase = if (e.isNotFound) "notFound" else "failed"
        } catch (e: Exception) {
            phase = "failed"
        }
    }

    val list = rememberLazyListState()
    Column(Modifier.fillMaxSize().cream()) {
        OrganicInlineBar(L10n.App.Nav.back, back, scrolled = list.scrolledPast20()) {
            profile?.takeIf { !it.isSelf }?.let { p ->
                SafetyMenu(session, SafetyService.Target.User(p.author.id), p.author.handle, p.isBlocked, seed = seedFromString(p.author.id).toDouble()) { reload++ }
            }
        }
        when (phase) {
            // The web's profile skeleton: the masthead's blocks, then four loading cards.
            "loading" -> LazyColumn(Modifier.fillMaxSize(), userScrollEnabled = false) {
                item { ProfileHeroSkeleton() }
                storyCardSkeletons(4)
            }
            "notFound" -> OrganicEmptyState(title = L10n.Profile.notFound, actionTitle = L10n.Profile.backHome, onAction = back, action = EmptyAction.Link, verticalPadding = 40.dp)
            "failed" -> OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { reload++ }, action = EmptyAction.Outline)
            else -> profile?.let { p ->
                val a = p.author
                LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(bottom = 48.dp)) {
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
                                a.region?.let { BasicText(regionLabel(it), style = meta) }
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                    OrganicIcon(IconName.Cards, size = 14.dp, color = Tokens.TextMuted)
                                    BasicText(L10n.Profile.cardCount(count = p.cardCount), style = meta)
                                }
                                BasicText(L10n.Profile.joined(date = joinedMonth(p.joinedAt)), style = meta)
                                if (!p.isSelf && p.isConnected) {
                                    OrganicIcon(IconName.UserCheck, Modifier.semantics { contentDescription = L10n.Profile.connected }, size = 20.dp, color = Tokens.Terracotta)
                                }
                            }
                        }
                    }
                    if (p.isBlocked) {
                        item { BlockedNotice(session, a.id, a.handle) { reload++ } }
                    } else if (cards.isNotEmpty()) {
                        item { SectionHeading(L10n.Profile.publishedHeading) }
                        storyCards(cards, open) {
                            cursor?.let { c ->
                                cursor = null
                                scope.launch { runCatching { session.reading.profileCards(handle, cursor = c) }.onSuccess { cards = cards + it.cards; cursor = it.nextCursor } }
                            }
                        }
                    }
                    if (linked.isNotEmpty()) {
                        item { SectionHeading(L10n.Profile.linkedCards, Modifier.padding(top = 48.dp)) }
                        miniCards(linked, open, keyPrefix = "linked:")
                    }
                }
            }
        }
    }
}

/**
 * ProfileSafety's BlockedNotice: who is blocked and what that means, and a
 * small ghost Unblock that fades while it works; the page then re-reads.
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
        OrganicButton(if (busy) "…" else L10n.Safety.unblock, variant = ButtonVariant.Ghost, small = true, enabled = !busy) {
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

/** "TW" → "🇹🇼 台灣" in the interface language; free text stays as it is. */
fun regionLabel(region: String): String {
    if (region.length != 2 || !region.all { it.isLetter() }) return region
    val code = region.uppercase()
    val flag = code.map { String(Character.toChars(127397 + it.code)) }.joinToString("")
    return "$flag ${Locale("", code).getDisplayCountry(Strings.language.locale)}"
}

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
