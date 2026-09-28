package com.resonance.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.ui.NavDisplay
import com.resonance.app.Session
import com.resonance.design.generated.IconName
import com.resonance.design.OrganicTabBar
import com.resonance.design.OrganicTabItem
import com.resonance.design.cream
import com.resonance.kit.l10n.L10n

/** Screens on a tab's back stack. */
sealed interface Route {
    data class Root(val tab: Tab) : Route
    data class Card(val key: String) : Route
    data class Author(val handle: String) : Route

    companion object {
        /** Site paths the app can show itself: /card/{slug}, /u/{handle}, with or without a locale. */
        fun fromPath(path: String): Route? {
            val parts = path.split('/').filter { it.isNotEmpty() }.let { if (it.firstOrNull() in setOf("en", "zh-TW")) it.drop(1) else it }
            if (parts.size != 2) return null
            return when (parts[0]) {
                "card" -> Card(parts[1])
                "u" -> Author(android.net.Uri.decode(parts[1]))
                else -> null
            }
        }
    }
}

enum class Tab { Feed, Messages, Write, Notifications, CardBox }

/**
 * Four tabs and the pen. Each tab keeps its own back stack; re-selecting a
 * tab pops to its root; system back (with the predictive-back animation)
 * pops the current tab's stack. The bar hides on pushed screens.
 */
@Composable
fun MainTabs(session: Session, incomingRoute: MutableState<String?>) {
    var tab by remember { mutableStateOf(Tab.Feed) }
    val stacks = remember { Tab.entries.associateWith { mutableStateListOf<Route>(Route.Root(it)) } }
    val stack: SnapshotStateList<Route> = stacks.getValue(tab)
    val push: (Route) -> Unit = { stack.add(it) }

    LaunchedEffect(incomingRoute.value) {
        incomingRoute.value?.let { Route.fromPath(it) }?.let { stack.add(it) }
        incomingRoute.value = null
    }

    Box(Modifier.fillMaxSize().cream()) {
        NavDisplay(
            backStack = stack,
            onBack = { stack.removeLastOrNull() },
            entryProvider = entryProvider {
                entry<Route.Root> { r ->
                    when (r.tab) {
                        Tab.Feed -> FeedScreen(session, push)
                        Tab.Messages -> PlaceholderScreen(L10n.Messages.title, L10n.Messages.empty)
                        Tab.Notifications -> PlaceholderScreen(L10n.App.Nav.notifications, L10n.App.Notifications.empty)
                        Tab.CardBox -> CardBoxScreen(session, push)
                        Tab.Write -> {}
                    }
                }
                entry<Route.Card> { r -> CardScreen(session, r.key, push) { stack.removeLastOrNull() } }
                entry<Route.Author> { r -> AuthorScreen(session, r.handle, push) { stack.removeLastOrNull() } }
            },
        )
        AnimatedVisibility(
            stack.size == 1,
            modifier = Modifier.align(Alignment.BottomCenter),
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
        ) {
            OrganicTabBar(
                listOf(
                    // The web's glyphs for the same places (Subnavbar, NotificationBell, FloatingWriteButton).
                    OrganicTabItem(Tab.Feed, L10n.Native.tabFeed, IconName.Sparkle),
                    OrganicTabItem(Tab.Messages, L10n.App.Nav.messages, IconName.Chat),
                    OrganicTabItem(Tab.Write, L10n.App.Nav.write, IconName.Pen, isAction = true),
                    OrganicTabItem(Tab.Notifications, L10n.App.Nav.notifications, IconName.Bell),
                    OrganicTabItem(Tab.CardBox, L10n.App.Nav.me, IconName.Cards),
                ),
                selection = tab,
                onSelect = { picked ->
                    if (picked == Tab.Write) return@OrganicTabBar // the editor arrives in A3
                    if (picked == tab) stacks.getValue(tab).let { if (it.size > 1) it.removeRange(1, it.size) }
                    tab = picked
                },
            )
        }
    }
}
