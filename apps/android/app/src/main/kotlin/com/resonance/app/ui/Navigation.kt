package com.resonance.app.ui

import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.runtime.key
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.padding
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.ui.NavDisplay
import com.resonance.api.models.FeedCard
import com.resonance.app.PushCenter
import com.resonance.app.Session
import com.resonance.kit.reading.FeedLoader
import com.resonance.app.thoughtmap.ThoughtMapScreen
import com.resonance.app.thoughtmap.ThoughtMapStore
import com.resonance.design.generated.IconName
import com.resonance.design.OrganicTabBar
import com.resonance.design.OrganicTabItem
import com.resonance.design.cream
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.l10n.L10n

/** Screens on a tab's back stack. */
sealed interface Route {
    data class Root(val tab: Tab) : Route
    /** A card's page; `preview` is the card as the list it was tapped in drew it (the page draws that at once). */
    data class Card(val key: String, val preview: FeedCard? = null) : Route
    data class Author(val handle: String) : Route
    data object Settings : Route
    /** My thought map (me/thought-map). */
    data object ThoughtMap : Route
    /**
     * Writing a card; a resonance answers `referenceCardId`. With a `cardId` it edits one of
     * your cards (a draft, or a published card's revision). `showsCard` is whether the card
     * opens once the writer is gone (false when its own page is underneath).
     */
    data class Write(
        val referenceCardId: String? = null,
        val cardId: String? = null,
        val showsCard: Boolean = true,
        /** Words to start from (a note grown into a resonance). */
        val story: String? = null,
    ) : Route
    /**
     * A conversation, by the other person's pen name — and their `uid` when the place it opens
     * from knows it (the conversation list, a notification), so the thread listens at once and
     * still opens after a rename. A note (`noteCardId` + `noteId`) quotes one to answer.
     */
    data class Thread(val handle: String, val noteCardId: String? = null, val noteId: String? = null, val uid: String? = null) : Route {
        val note: MessagingApi.Note? get() = if (noteCardId != null && noteId != null) MessagingApi.Note(noteCardId, noteId) else null

        /** The same person's conversation (by uid when both know it; pen names are unique whatever their case). */
        fun samePerson(other: Thread): Boolean =
            if (uid != null && other.uid != null) uid == other.uid else handle.equals(other.handle, ignoreCase = true)
    }
    data class SettingsSection(val section: com.resonance.app.ui.SettingsSection) : Route

    companion object {
        /**
         * Site paths the app can show itself: /card/{slug}, /u/{handle}, /me/thought-map, and
         * /messages/{handle}?note={noteId}&card={cardId} (a note's reply link keeps its
         * query), with or without a locale. The manifest's App Links filter claims these
         * prefixes and no others — keep the two in step.
         */
        fun fromPath(path: String): Route? {
            val bare = path.substringBefore('?')
            val query = path.substringAfter('?', "")
            val parts = bare.split('/').filter { it.isNotEmpty() }.let { if (it.firstOrNull() in setOf("en", "zh-TW")) it.drop(1) else it }
            if (parts.size != 2) return null
            return when (parts[0]) {
                "card" -> Card(parts[1])
                "u" -> Author(android.net.Uri.decode(parts[1]))
                "me" -> if (parts[1] == "thought-map") ThoughtMap else null
                "messages" -> {
                    val params = query.split('&').filter { it.isNotEmpty() }.associate { it.substringBefore('=') to android.net.Uri.decode(it.substringAfter('=', "")) }
                    val card = params["card"]
                    val note = params["note"]
                    if (card != null && note != null) Thread(android.net.Uri.decode(parts[1]), card, note) else Thread(android.net.Uri.decode(parts[1]))
                }
                else -> null
            }
        }
    }
}

enum class Tab { Feed, Messages, Write, Notifications, CardBox }

/**
 * Opens a conversation from outside the screens (a push, a link) on the Messages stack. When
 * that conversation is already on top — a push for the thread being read — it stays as it is
 * instead of being stacked a second time; a note to quote takes its place.
 */
internal fun openThread(stack: MutableList<Route>, route: Route.Thread) {
    val top = stack.lastOrNull() as? Route.Thread
    when {
        top == null || !top.samePerson(route) -> stack.add(route)
        route.note != null && route.note != top.note -> stack[stack.lastIndex] = route.copy(uid = route.uid ?: top.uid)
    }
}

/**
 * Where a tapped push leads: its page (`route`, parsed), a conversation by the sender's uid —
 * the push's own `fromUserId`, or else what its bell row says once the list has it ([sender]) —
 * or null: the notifications. With the uid the thread listens at once and still opens after a
 * rename.
 */
internal fun pushedRoute(route: Route?, fromUserId: String?, sender: () -> String?): Route? =
    if (route is Route.Thread && route.uid == null) route.copy(uid = fromUserId ?: sender()) else route

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
    // The thought map keeps its camera, selection and cards while a card of it is open in the writer above it
    // (its entry leaves the composition then); leaving the map for good drops it, so the next visit reads afresh.
    val mapHolder = remember { object { var store: ThoughtMapStore? = null } }
    val mapOnStack = stacks.values.any { s -> s.any { it is Route.ThoughtMap } }
    LaunchedEffect(mapOnStack) { if (!mapOnStack) mapHolder.store = null }

    // The home feed outlives its screen (which leaves the composition whenever a page covers it or
    // another tab is chosen), so coming back finds it as it was left.
    val scope = rememberCoroutineScope()
    val feed = remember { FeedLoader(session.reading, scope) }

    // A site path from a link or a push. A conversation belongs to the Messages tab's stack; other pages open on the current tab.
    fun open(route: Route) {
        if (route is Route.Thread) {
            tab = Tab.Messages
            openThread(stacks.getValue(Tab.Messages), route)
            return
        }
        stacks.getValue(tab).add(route)
    }

    // Just past onboarding: the writer opens on the first tab, as the web's signup goes to /write
    // (unless a link brought the person here, which wins, as the web's `next` does).
    LaunchedEffect(Unit) {
        if (!session.justOnboarded) return@LaunchedEffect
        session.justOnboarded = false
        if (incomingRoute.value == null) stack.add(Route.Write())
    }

    // A site page the app doesn't show itself opens in the in-app browser rather than being dropped.
    val context = LocalContext.current
    LaunchedEffect(incomingRoute.value) {
        val path = incomingRoute.value ?: return@LaunchedEffect
        incomingRoute.value = null
        Route.fromPath(path)?.let(::open) ?: InAppBrowser.open(context, session.config.origin.trimEnd('/') + "/" + path.trimStart('/'))
    }

    // A tapped push: its page, or the notifications when it has none (also after a cold start, which leaves it waiting here).
    val tappedPush by PushCenter.opened.collectAsStateWithLifecycle()
    LaunchedEffect(tappedPush) {
        val opened = tappedPush ?: return@LaunchedEffect
        PushCenter.consume()
        opened.notificationId?.let { session.notifications.markRead(it) }
        // A push names the sender by pen name, and by uid when it carries `fromUserId`.
        val route = pushedRoute(Route.fromPath(opened.route), opened.fromUserId) { session.notifications.sender(opened.notificationId) }
        if (route != null) open(route) else tab = Tab.Notifications
    }

    val notifications by session.notifications.items.collectAsStateWithLifecycle()
    val unread = notifications.count { it.isUnread }
    val conversations by session.conversations.state.collectAsStateWithLifecycle()
    val deletionDate by session.deletionDate.collectAsStateWithLifecycle()
    // A language change re-renders every screen (the strings are read while composing); the stacks stay.
    val languageEpoch by session.languageEpoch.collectAsStateWithLifecycle()

    Box(Modifier.fillMaxSize().cream()) {
        key(languageEpoch) { NavDisplay(
            backStack = stack,
            onBack = { stack.removeLastOrNull() },
            entryProvider = entryProvider {
                entry<Route.Root> { r ->
                    when (r.tab) {
                        Tab.Feed -> FeedScreen(session, feed, push)
                        Tab.Messages -> ConversationsScreen(session, push)
                        Tab.Notifications -> NotificationsScreen(session, push)
                        Tab.CardBox -> CardBoxScreen(session, push)
                        Tab.Write -> {}
                    }
                }
                entry<Route.Card> { r ->
                    CardScreen(session, r.key, r.preview, push, popToRoot = { if (stack.size > 1) stack.removeRange(1, stack.size) }) { stack.removeLastOrNull() }
                }
                entry<Route.Author> { r -> AuthorScreen(session, r.handle, push) { stack.removeLastOrNull() } }
                entry<Route.Write> { r ->
                    WriteScreen(
                        session, r.referenceCardId, r.cardId, r.story,
                        // Closed with the draft or revision saved: the screens showing cards read them again.
                        close = {
                            session.noteCardChange()
                            stack.removeLastOrNull()
                        },
                    ) { key ->
                        session.noteCardChange()
                        stack.removeLastOrNull()
                        // The card takes the writer's place, as the web goes to it — unless its own page is underneath.
                        if (r.showsCard) stack.add(Route.Card(key))
                    }
                }
                entry<Route.Thread> { r -> ThreadScreen(session, r.handle, r.uid, r.note, push) { stack.removeLastOrNull() } }
                entry<Route.Settings> { SettingsScreen(push) { stack.removeLastOrNull() } }
                entry<Route.ThoughtMap> {
                    val store = mapHolder.store ?: ThoughtMapStore().also { mapHolder.store = it }
                    ThoughtMapScreen(session, store, push) { stack.removeLastOrNull() }
                }
                entry<Route.SettingsSection> { r -> SettingsSectionScreen(session, r.section) { stack.removeLastOrNull() } }
            },
        ) }
        // The undo banner floats above the tab bar (or the bottom edge on pushed screens) on every screen.
        deletionDate?.let { date ->
            Box(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = if (stack.size == 1) 96.dp else 12.dp)) {
                AccountDeletionBanner(session, date)
            }
        }
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
                    OrganicTabItem(Tab.Messages, L10n.App.Nav.messages, IconName.Chat, badge = conversations.unreadTotal),
                    OrganicTabItem(Tab.Write, L10n.App.Nav.write, IconName.Pen, isAction = true),
                    OrganicTabItem(Tab.Notifications, L10n.App.Nav.notifications, IconName.Bell, badge = unread),
                    OrganicTabItem(Tab.CardBox, L10n.App.Nav.me, IconName.Cards),
                ),
                selection = tab,
                onSelect = { picked ->
                    // The pen opens the writer over the current tab, like the web's floating pen.
                    if (picked == Tab.Write) {
                        stack.add(Route.Write())
                        return@OrganicTabBar
                    }
                    if (picked == tab) stacks.getValue(tab).let { if (it.size > 1) it.removeRange(1, it.size) }
                    tab = picked
                },
            )
        }
    }
}
