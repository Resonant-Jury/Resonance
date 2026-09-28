package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.resonance.api.models.FeedCard
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.CssText
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicEmptyState
import com.resonance.design.SketchLoader
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.async
import kotlinx.coroutines.launch

/**
 * The home feed as the web runs it (home/page.tsx): today's picks first;
 * "load more" reveals the latest public cards deduped against the picks.
 * The recommender's reasons stay hidden, as on the web.
 */
@Composable
fun FeedScreen(session: Session, open: (Route) -> Unit) {
    val scope = rememberCoroutineScope()
    var phase by remember { mutableStateOf("loading") }
    val recommended = remember { mutableStateListOf<FeedCard>() }
    val latest = remember { mutableStateListOf<FeedCard>() }
    var showLatest by remember { mutableStateOf(false) }
    var cursor by remember { mutableStateOf<String?>(null) }
    var loadingMore by remember { mutableStateOf(false) }

    suspend fun load() {
        phase = "loading"
        val picks = scope.async { runCatching { session.reading.recommended() }.getOrDefault(emptyList()) }
        runCatching { session.reading.feed() }
            .onSuccess { page ->
                latest.clear(); latest.addAll(page.cards); cursor = page.nextCursor
                recommended.clear(); recommended.addAll(picks.await())
                phase = "loaded"
            }
            .onFailure {
                recommended.clear(); recommended.addAll(picks.await())
                phase = if (recommended.isEmpty()) "failed" else "loaded"
            }
    }
    LaunchedEffect(Unit) { load() }

    val latestVisible = recommended.isEmpty() || showLatest
    val picked = recommended.map { it.id }.toSet()
    val cards = if (latestVisible) recommended + latest.filter { it.id !in picked } else recommended.toList()
    val canLoadMore = !latestVisible || cursor != null

    TabScreen(L10n.Home.heading) {
        item {
            CssText(L10n.Home.subheading, AppFonts.Family.Body, 15f, lineHeight = 1.6f, color = Tokens.TextMuted, modifier = Modifier.padding(horizontal = 20.dp).padding(bottom = 12.dp))
        }
        when (phase) {
            "loading" -> item { Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) { SketchLoader(48.dp) } }
            "failed" -> item { OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry) { scope.launch { load() } } }
            else -> {
                if (cards.isEmpty()) {
                    item { OrganicEmptyState(L10n.Home.Empty.title + L10n.Home.Empty.subtitle) }
                } else {
                    storyCards(cards, open)
                    item {
                        Column(Modifier.fillMaxWidth().padding(top = 48.dp, start = 20.dp, end = 20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            if (latestVisible && !canLoadMore) {
                                CssText(L10n.Home.endOfDay, AppFonts.Family.Heading, 20f, 700, lineHeight = 1.3f)
                            }
                            if (canLoadMore) {
                                OrganicButton(if (loadingMore) L10n.Home.moreLoading else L10n.Home.moreBtn, variant = ButtonVariant.Outline) {
                                    if (!latestVisible) showLatest = true
                                    else cursor?.let { c ->
                                        loadingMore = true
                                        scope.launch {
                                            runCatching { session.reading.feed(cursor = c) }.onSuccess { page ->
                                                val known = latest.map { it.id }.toSet()
                                                latest.addAll(page.cards.filter { it.id !in known }); cursor = page.nextCursor
                                            }
                                            loadingMore = false
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
