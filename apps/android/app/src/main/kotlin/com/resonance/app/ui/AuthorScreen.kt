package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
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
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicInlineBar
import com.resonance.design.SketchLoader
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

    LaunchedEffect(handle) {
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

    Column(Modifier.fillMaxSize().cream()) {
        OrganicInlineBar(L10n.App.Nav.back, back)
        when (phase) {
            "loading" -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { SketchLoader(48.dp) }
            "notFound" -> OrganicEmptyState(L10n.Profile.notFound, L10n.Profile.backHome, back)
            "failed" -> OrganicEmptyState(L10n.Native.loadError)
            else -> profile?.let { p ->
                val a = p.author
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 48.dp)) {
                    item {
                        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            HandDrawnAvatar(a.initials, a.avatarUrl, a.accent(), 96.dp, a.avatarSeedValue())
                            BasicText(a.handle, style = AppFonts.heading(32f, lineHeight = 1.2f))
                            BasicText(p.bio ?: L10n.Profile.bioEmpty, style = AppFonts.body(15f, lineHeight = 1.6f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                a.region?.let { BasicText(regionLabel(it), style = AppFonts.body(13f, color = Tokens.TextMuted)) }
                                BasicText(L10n.Profile.cardCount(count = p.cardCount), style = AppFonts.body(13f, color = Tokens.TextMuted))
                                BasicText(L10n.Profile.joined(date = mediumDate(p.joinedAt) ?: ""), style = AppFonts.body(13f, color = Tokens.TextMuted))
                            }
                        }
                    }
                    if (p.isBlocked) {
                        item {
                            Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                BasicText(L10n.Safety.blockedNotice(handle = a.handle), style = AppFonts.heading(18f))
                                BasicText(L10n.Safety.blockedNoticeBody, style = AppFonts.body(14f, color = Tokens.TextMuted))
                            }
                        }
                    } else if (cards.isNotEmpty()) {
                        item { Box(Modifier.fillMaxWidth().padding(bottom = 24.dp), contentAlignment = Alignment.Center) { BasicText(L10n.Profile.publishedHeading, style = AppFonts.heading(22f)) } }
                        storyCards(cards, open) {
                            cursor?.let { c ->
                                cursor = null
                                scope.launch { runCatching { session.reading.profileCards(handle, cursor = c) }.onSuccess { cards = cards + it.cards; cursor = it.nextCursor } }
                            }
                        }
                    }
                    if (linked.isNotEmpty()) {
                        item { Box(Modifier.fillMaxWidth().padding(top = 48.dp, bottom = 24.dp), contentAlignment = Alignment.Center) { BasicText(L10n.Profile.linkedCards, style = AppFonts.heading(22f)) } }
                        storyCards(linked, open)
                    }
                }
            }
        }
    }
}

/** "TW" → "🇹🇼 台灣" in the interface language; free text stays as it is. */
fun regionLabel(region: String): String {
    if (region.length != 2 || !region.all { it.isLetter() }) return region
    val code = region.uppercase()
    val flag = code.map { String(Character.toChars(127397 + it.code)) }.joinToString("")
    return "$flag ${Locale("", code).getDisplayCountry(Strings.language.locale)}"
}
