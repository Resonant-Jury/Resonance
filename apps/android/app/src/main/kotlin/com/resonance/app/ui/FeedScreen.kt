package com.resonance.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.resonance.app.Session
import com.resonance.design.BrandBarHeight
import com.resonance.design.ButtonVariant
import com.resonance.design.FeedEndMark
import com.resonance.design.EmptyAction
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicEmptyState
import com.resonance.design.generated.IconName
import com.resonance.design.storyCardSkeletons
import com.resonance.kit.l10n.L10n
import com.resonance.kit.reading.FeedLoader
import com.resonance.kit.reading.withoutAuthors
import kotlinx.coroutines.launch

/**
 * The feed's page state: kept while the feed's tab root is (always, until sign-out), and through a
 * rotation. The reader's last feed is kept on the device too, so a cold start draws it at once.
 */
class FeedModel(session: Session) : ViewModel() {
    val feed = FeedLoader(session.reading, viewModelScope, storeFor = { uid -> session.kept(uid) })
}

/**
 * The home feed as the web runs it (home/page.tsx): today's picks first;
 * "load more" reveals the latest public cards deduped against the picks.
 * Neither waits for the other: the latest cards show as soon as they arrive,
 * and picks that come after them are offered by a hint at the top rather than
 * moving the cards being read. The recommender's reasons stay hidden, as on
 * the web. [FeedLoader] holds it all (in [FeedModel]), so coming back finds the
 * feed as it was, scrolled where it was left, without reading it again.
 */
@Composable
fun FeedScreen(session: Session, open: (Route) -> Unit) {
    val feed = viewModel { FeedModel(session) }.feed
    val scope = rememberCoroutineScope()
    val state by feed.state.collectAsStateWithLifecycle()
    // Your own card written, published or re-shelved, or a block: the feed reads again (keeping what it shows meanwhile);
    // so does a feed read long ago, when the app comes back to it.
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    val foregrounded by session.foregrounded.collectAsStateWithLifecycle()
    LaunchedEffect(changes, foregrounded) { feed.refresh(session.uid, changes) }
    val list = rememberLazyListState()
    // Never a card by someone blocked — not even one kept from before the block.
    val blocked by session.blocked.collectAsStateWithLifecycle()
    val cards = remember(state.cards, blocked) { state.cards.withoutAuthors(blocked) }
    val view = LocalView.current

    // No page title: the brand bar is the feed's only heading, and the first card starts right under its wave.
    TabScreen(
        null,
        list = list,
        // Pulled down: read again now, from the server rather than the HTTP cache. Nothing back: the feed stays, and says why.
        onRefresh = {
            session.readAfresh()
            feed.reload()?.let { view.announce(it.message) }
        },
        refreshEnabled = state.phase != FeedLoader.Phase.Loading,
        overlay = {
            val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + BrandBarHeight + HeaderEdgeHeight
            AnimatedVisibility(
                state.picksReady && state.phase == FeedLoader.Phase.Loaded,
                Modifier.align(Alignment.TopCenter).padding(top = top + 12.dp),
                enter = slideInVertically { -it } + fadeIn(),
                exit = slideOutVertically { -it } + fadeOut(),
            ) {
                OrganicButton(L10n.Home.Recommended.ready, icon = IconName.Sparkle, small = true) {
                    feed.revealPicks()
                    scope.launch { list.animateScrollToItem(0) }
                }
            }
        },
    ) {
        when (state.phase) {
            // The web's FeedSkeleton: the real cards' bands with shimmering blocks, so nothing jumps on arrival.
            FeedLoader.Phase.Loading -> storyCardSkeletons(6, firstUnderBar = true)
            FeedLoader.Phase.Failed -> item { OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { feed.load() }, action = EmptyAction.Outline) }
            FeedLoader.Phase.Loaded -> {
                if (cards.isEmpty()) {
                    item {
                        // Under the bar's band, as the first card would be.
                        OrganicEmptyState(
                            L10n.Home.Empty.subtitle, L10n.Home.Empty.cta, { open(Route.Write()) }, title = L10n.Home.Empty.title,
                            modifier = Modifier.padding(top = HeaderEdgeHeight),
                        )
                    }
                } else {
                    refreshNote(state.refreshFailure, underBar = true)
                    // A note over the cards parts the first one from the bar: it keeps its own top rule then.
                    storyCards(cards, open, firstUnderBar = state.refreshFailure == null)
                    item {
                        Column(Modifier.fillMaxWidth().padding(top = 48.dp, start = 20.dp, end = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            // While more can load, only the button; the end mark once nothing more can.
                            if (state.canLoadMore) {
                                OrganicButton(if (state.loadingMore) L10n.Home.moreLoading else L10n.Home.moreBtn, variant = ButtonVariant.Tonal) {
                                    feed.loadMore()
                                }
                            } else if (state.latestVisible) {
                                FeedEndMark(L10n.Home.feedEnd)
                            }
                        }
                    }
                }
            }
        }
    }
}
