package com.resonance.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSerializable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.rememberDecoratedNavEntries
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.runtime.serialization.NavBackStackSerializer
import androidx.navigation3.ui.NavDisplay
import com.resonance.api.models.FeedCard
import com.resonance.app.PushCenter
import com.resonance.app.Session
import com.resonance.app.thoughtmap.ThoughtMapScreen
import com.resonance.app.thoughtmap.ThoughtMapStore
import com.resonance.design.OrganicTabBar
import com.resonance.design.OrganicTabItem
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.l10n.L10n
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/**
 * Screens on a tab's back stack. The stacks are saved with the activity (rotation, a process the
 * system reclaimed), so a route holds only what names its page; [contentKey] is what the page's
 * saved state and ViewModels are kept under.
 */
@Serializable
sealed interface Route : NavKey {
    val contentKey: String

    @Serializable
    data class Root(val tab: Tab) : Route {
        override val contentKey get() = "root:$tab"
    }

    /**
     * A card's page; `preview` is the card as the list it was tapped in drew it (the page draws
     * that at once). It isn't saved: a restored page reads the card itself.
     */
    @Serializable
    data class Card(val key: String, @Transient val preview: FeedCard? = null) : Route {
        override val contentKey get() = "card:$key"
    }

    @Serializable
    data class Author(val handle: String) : Route {
        override val contentKey get() = "author:$handle"
    }

    @Serializable
    data object Settings : Route {
        override val contentKey get() = "settings"
    }

    /** My thought map (me/thought-map). */
    @Serializable
    data object ThoughtMap : Route {
        override val contentKey get() = "thought-map"
    }
    /**
     * Writing a card; a resonance answers `referenceCardId`. With a `cardId` it edits one of
     * your cards (a draft, or a published card's revision). `showsCard` is whether the card
     * opens once the writer is gone (false when its own page is underneath).
     */
    @Serializable
    data class Write(
        val referenceCardId: String? = null,
        val cardId: String? = null,
        val showsCard: Boolean = true,
        /** Words to start from (a note grown into a resonance). */
        val story: String? = null,
        /**
         * The writer began as a new card and has saved it as the draft `cardId` ([rememberDraft]).
         * It keeps the page key it began with, so the writer on screen isn't rebuilt under the
         * person typing.
         */
        val savedNew: Boolean = false,
    ) : Route {
        override val contentKey get() = "write:$referenceCardId:${if (savedNew) null else cardId}"
    }
    /**
     * A conversation, by the other person's pen name — and their `uid` when the place it opens
     * from knows it (the conversation list, a notification), so the thread listens at once and
     * still opens after a rename. A note (`noteCardId` + `noteId`) quotes one to answer.
     */
    @Serializable
    data class Thread(val handle: String, val noteCardId: String? = null, val noteId: String? = null, val uid: String? = null) : Route {
        val note: MessagingApi.Note? get() = if (noteCardId != null && noteId != null) MessagingApi.Note(noteCardId, noteId) else null
        override val contentKey get() = "thread:${uid ?: handle.lowercase()}:$noteCardId:$noteId"

        /** The same person's conversation (by uid when both know it; pen names are unique whatever their case). */
        fun samePerson(other: Thread): Boolean =
            if (uid != null && other.uid != null) uid == other.uid else handle.equals(other.handle, ignoreCase = true)
    }
    @Serializable
    data class SettingsSection(val section: com.resonance.app.ui.SettingsSection) : Route {
        override val contentKey get() = "settings:$section"
    }

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
 * A new card's writer saved its first draft: its stack entry now names the draft, and no longer
 * carries the words it started from (they are in the draft). A writer covered meanwhile — a push,
 * a link — and come back to, or restored with the activity, then reopens that draft, instead of a
 * blank card whose next edit would save a second one. The draft is often saved as the writer is
 * covered, after its page has gone, so the entry is found by identity; a writer already closed
 * stays closed.
 */
internal fun MutableList<Route>.rememberDraft(writer: Route.Write, id: String) {
    val i = indexOfFirst { it === writer }
    if (i >= 0) this[i] = writer.copy(cardId = id, story = null, savedNew = true)
}

/** Back to the tab's root page. */
internal fun MutableList<Route>.popToRoot() {
    if (size > 1) subList(1, size).clear()
}

/** A tab's back stack, saved with the activity: its routes are [Serializable] (no reflection). */
@Composable
private fun rememberRouteStack(root: Route): NavBackStack<Route> =
    rememberSerializable(serializer = NavBackStackSerializer(Route.serializer())) { NavBackStack(root) }

/**
 * A tab's pages, each decorated with its own saved state (scroll, fields) and its own
 * ViewModelStore — two card pages never share one. They are kept for as long as the page is on
 * its stack, whichever tab is showing, so going back or switching tabs finds a page as it was
 * left; popping it drops them. A page is known by its tab, its place and its route, so the same
 * card twice on one stack, or on two tabs, is two pages.
 */
@Composable
private fun rememberStackEntries(tab: Tab, stack: NavBackStack<Route>, content: @Composable (Route) -> Unit): List<NavEntry<Route>> {
    val decorators = listOf(rememberSaveableStateHolderNavEntryDecorator<Route>(), rememberViewModelStoreNavEntryDecorator<Route>())
    val routes = stack.toList()
    val entries = remember(routes) {
        routes.mapIndexed { i, route -> NavEntry(route, contentKey = "$tab/$i/${route.contentKey}", content = content) }
    }
    return rememberDecoratedNavEntries(entries, decorators)
}

/** The thought map's store, kept while the map is on its stack (a card of it open in the writer above it included). */
class ThoughtMapModel : ViewModel() {
    val store = ThoughtMapStore()
}

/**
 * Four tabs and the pen. Each tab keeps its own back stack — saved, so rotation or a reclaimed
 * process brings it back — and each page on it keeps its state and ViewModels while it is there;
 * re-selecting a tab pops to its root; system back (with the predictive-back animation) pops the
 * current tab's stack. The bar hides on pushed screens.
 */
@Composable
fun MainTabs(session: Session, incomingRoute: MutableState<String?>) {
    var tab by rememberSaveable { mutableStateOf(Tab.Feed) }
    val stacks: Map<Tab, NavBackStack<Route>> = Tab.entries.associateWith { rememberRouteStack(Route.Root(it)) }
    val stack: NavBackStack<Route> = stacks.getValue(tab)

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
    // A language change re-renders every screen (the strings are read while composing); the stacks and their pages stay.
    val languageEpoch by session.languageEpoch.collectAsStateWithLifecycle()

    val entries: Map<Tab, List<NavEntry<Route>>> = Tab.entries.associateWith { t ->
        val own = stacks.getValue(t)
        rememberStackEntries(t, own) { route -> Page(session, route, own) }
    }

    Box(Modifier.fillMaxSize().cream()) {
        key(languageEpoch) {
            NavDisplay(entries = entries.getValue(tab), onBack = { stack.removeLastOrNull() })
        }
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
                    if (picked == tab) stacks.getValue(tab).popToRoot()
                    tab = picked
                },
            )
        }
    }
}

/** A page of a tab's stack: what it opens goes on the same stack, and back pops it. */
@Composable
private fun Page(session: Session, route: Route, stack: NavBackStack<Route>) {
    val push: (Route) -> Unit = { stack.add(it) }
    val pop: () -> Unit = { stack.removeLastOrNull() }
    when (route) {
        is Route.Root -> when (route.tab) {
            Tab.Feed -> FeedScreen(session, push)
            Tab.Messages -> ConversationsScreen(session, push)
            Tab.Notifications -> NotificationsScreen(session, push)
            Tab.CardBox -> CardBoxScreen(session, push)
            Tab.Write -> {}
        }
        is Route.Card -> CardScreen(session, route.key, route.preview, push, popToRoot = { stack.popToRoot() }, back = pop)
        is Route.Author -> AuthorScreen(session, route.handle, push, pop)
        is Route.Write -> WriteScreen(
            session, route.referenceCardId, route.cardId, route.story,
            onCreated = { id -> stack.rememberDraft(route, id) },
            // Closed with the draft or revision saved: the screens showing cards read them again.
            close = {
                session.noteCardChange()
                pop()
            },
        ) { key ->
            session.noteCardChange()
            pop()
            // The card takes the writer's place, as the web goes to it — unless its own page is underneath.
            if (route.showsCard) stack.add(Route.Card(key))
        }
        is Route.Thread -> ThreadScreen(session, route.handle, route.uid, route.note, push, pop)
        Route.Settings -> SettingsScreen(push, pop)
        Route.ThoughtMap -> {
            // The map keeps its camera, selection and cards while a card of it is open in the writer above it;
            // leaving the map for good drops it, so the next visit reads afresh.
            val model = viewModel { ThoughtMapModel() }
            ThoughtMapScreen(session, model.store, push, pop)
        }
        is Route.SettingsSection -> SettingsSectionScreen(session, route.section, pop)
    }
}
