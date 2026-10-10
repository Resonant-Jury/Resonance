package com.resonance.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.navigation3.scene.SinglePaneSceneStrategy
import com.resonance.design.HeaderChrome
import com.resonance.design.InlineBarHeight
import com.resonance.design.LayoutClass
import com.resonance.design.LocalHeaderChrome
import com.resonance.design.LocalInlineBarHeight
import com.resonance.design.LocalWindowLayout
import com.resonance.design.TopBarRow
import com.resonance.design.TopPen
import com.resonance.design.TopTabs
import com.resonance.design.TopTabsFit
import com.resonance.design.WindowLayout
import com.resonance.design.topTabWidths
import com.resonance.design.topTabsOrder
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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
import com.resonance.design.OrganicTabBar
import com.resonance.design.OrganicTabItem
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.launch
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
 * The tab a tapped push opens when it has no page of its own: the conversations for the one
 * notification that stands for all of them (`/messages`), else the notifications.
 */
internal fun pushedTab(route: String): Tab {
    val parts = route.substringBefore('?').split('/').filter { it.isNotEmpty() }.let { if (it.firstOrNull() in setOf("en", "zh-TW")) it.drop(1) else it }
    return if (parts == listOf("messages")) Tab.Messages else Tab.Notifications
}

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

/**
 * Back one page, never past the root: a second back that lands before the first one has been drawn
 * (the system back pressed twice quickly, a double tap on the arrow) would otherwise empty the stack,
 * which NavDisplay refuses.
 */
internal fun MutableList<Route>.popPage() {
    if (size > 1) removeAt(lastIndex)
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
 * card twice on one stack, or on two tabs, is two pages. [content] is also given whether the page
 * is still on its stack (its route, that very one, at its place): a page going while it is drawn
 * has been popped.
 */
@Composable
private fun rememberStackEntries(
    tab: Tab,
    stack: NavBackStack<Route>,
    content: @Composable (route: Route, onStack: () -> Boolean) -> Unit,
): List<NavEntry<Route>> {
    val decorators = listOf(rememberSaveableStateHolderNavEntryDecorator<Route>(), rememberViewModelStoreNavEntryDecorator<Route>())
    val routes = stack.toList()
    val entries = remember(routes) {
        routes.mapIndexed { i, route ->
            val onStack = { stack.getOrNull(i) === route }
            NavEntry(
                route, contentKey = "$tab/$i/${route.contentKey}",
                metadata = mapOf(PageMotion.TAB_METADATA to tab, ROUTE_METADATA to route, INDEX_METADATA to i),
            ) { content(it, onStack) }
        }
    }
    return rememberDecoratedNavEntries(entries, decorators)
}

/**
 * Four tabs and the pen. Each tab keeps its own back stack — saved, so rotation or a reclaimed
 * process brings it back — and each page on it keeps its state and ViewModels while it is there;
 * re-selecting a tab pops to its root; system back (with the predictive-back animation) pops the
 * current tab's stack. The bar hides on pushed screens. Pages move as [PageFrame] draws them.
 */
@Composable
fun MainTabs(session: Session, incomingRoute: MutableState<String?>) {
    var tab by rememberSaveable { mutableStateOf(Tab.Feed) }
    val stacks: Map<Tab, NavBackStack<Route>> = Tab.entries.associateWith { rememberRouteStack(Route.Root(it)) }
    val stack: NavBackStack<Route> = stacks.getValue(tab)
    // The window as it is now (a rotation, a fold or a split resizes it without a new activity).
    val windowWidth = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() }
    val cls = LayoutClass.of(windowWidth.value)
    val expanded = cls == LayoutClass.Expanded

    // A site path from a link or a push. A conversation belongs to the Messages tab's stack; other pages open on the current tab.
    // Beside the conversations (an expanded window) it takes the thread pane's place.
    fun open(route: Route) {
        if (route is Route.Thread) {
            tab = Tab.Messages
            val messages = stacks.getValue(Tab.Messages)
            if (expanded && drawsAsPanes(messages)) {
                // The pane already showing that conversation keeps it (a note to quote takes its place).
                val shown = messages.getOrNull(1) as? Route.Thread
                val same = shown != null && shown.samePerson(route)
                if (!same || messages.size > 2 || (route.note != null && route.note != shown.note)) {
                    messages.chooseInPane(if (same) route.copy(uid = route.uid ?: shown.uid) else route)
                }
            } else openThread(messages, route)
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
        if (route != null) open(route) else tab = pushedTab(opened.route)
    }

    // Ctrl-N / Cmd-N on a keyboard: a new card, over the current tab, as the pen does (not over a writer already open).
    // Ctrl-1…4: Feed, Messages, Notifications, Card Box, as a tap on that tab.
    val currentStack by rememberUpdatedState(stack)
    val pick = rememberUpdatedState<(Tab) -> Unit> { picked ->
        if (picked == tab) stacks.getValue(tab).popToRoot()
        tab = picked
    }
    DisposableEffect(Unit) {
        KeyShortcuts.newCard = { if (currentStack.lastOrNull() !is Route.Write) currentStack.add(Route.Write()) }
        KeyShortcuts.tab = { n -> KeyTabs.getOrNull(n - 1)?.let { pick.value(it) } }
        onDispose {
            KeyShortcuts.newCard = null
            KeyShortcuts.tab = null
        }
    }

    val notifications by session.notifications.items.collectAsStateWithLifecycle()
    val unread = notifications.count { it.isUnread }
    val conversations by session.conversations.state.collectAsStateWithLifecycle()
    val deletionDate by session.deletionDate.collectAsStateWithLifecycle()
    // A language change re-renders every screen (the strings are read while composing): the stacks
    // stay, and their pages are composed afresh. The pages' saved state and ViewModels are made inside
    // the key with them: kept outside it, the holder still had the old pages' keys registered when the
    // new ones asked for the same keys ("Key … was used multiple times"), and the app crashed.
    val languageEpoch by session.languageEpoch.collectAsStateWithLifecycle()

    val motion = remember { PageMotion() }
    val tabItems = listOf(
        // The web's glyphs for the same places (Subnavbar, NotificationBell, the header's pen).
        OrganicTabItem(Tab.Feed, L10n.Native.tabFeed, IconName.Sparkle),
        OrganicTabItem(Tab.Messages, L10n.App.Nav.messages, IconName.Chat, badge = conversations.unreadTotal),
        OrganicTabItem(Tab.Write, L10n.App.Nav.write, IconName.Pen, isAction = true),
        OrganicTabItem(Tab.Notifications, L10n.App.Nav.notifications, IconName.Bell, badge = unread),
        OrganicTabItem(Tab.CardBox, L10n.App.Nav.me, IconName.Cards),
    )
    val select: (Tab) -> Unit = { picked ->
        // The pen opens the writer over the current tab, like the web header's pen.
        if (picked == Tab.Write) stack.add(Route.Write())
        else {
            if (picked == tab) stacks.getValue(tab).popToRoot()
            tab = picked
        }
    }
    // Medium and expanded windows: the tabs in the middle of a full-width header and the pen at its
    // end, over every page but the writer (design note B2); compact: the bottom bar on a tab's first page.
    val topTabs = cls.topTabs
    val tabs = topTabsOrder(tabItems)
    val pad = LayoutClass.pad(windowWidth.value).dp
    val labelled = topTabWidths(tabs.map { it.value.title }, labels = cls.tabLabels)
    val labels = TopTabsFit.labels(cls, TopTabsFit.groupWidth(labelled.map { it.value }), windowWidth.value, pad.value)
    val tabWidths = if (labels) labelled else topTabWidths(tabs.map { it.value.title }, labels = false)
    val chrome = if (topTabs) HeaderChrome(windowWidth, TopTabsFit.groupWidth(tabWidths.map { it.value }).dp, pad, labels) else null
    val panes = remember(expanded, session) { listOf(MessagesPanesStrategy(expanded, session), SinglePaneSceneStrategy()) }

    CompositionLocalProvider(LocalWindowLayout provides WindowLayout(windowWidth)) {
        Box(Modifier.fillMaxSize().cream()) {
            key(languageEpoch) {
                val entries: Map<Tab, List<NavEntry<Route>>> = Tab.entries.associateWith { t ->
                    val own = stacks.getValue(t)
                    rememberStackEntries(t, own) { route, onStack -> PageFrame(motion, onStack) { WithHeader(route, chrome) { Page(session, route, own) } } }
                }
                NavDisplay(
                    entries = entries.getValue(tab),
                    sceneStrategies = panes,
                    onBack = { stack.popPage() },
                    transitionSpec = motion.push,
                    popTransitionSpec = motion.pop,
                    predictivePopTransitionSpec = motion.predictivePop,
                )
            }
            // The header's tabs and pen lie over the pages' bars (which leave them room), still while pages
            // move under them; the writer fades them away as it opens.
            if (chrome != null) HeaderTabsSlot(shown = stack.lastOrNull() !is Route.Write) {
                Box(Modifier.fillMaxWidth().statusBarsPadding().height(TopBarRow)) {
                    TopTabs(tabs, tab, select, tabWidths, chrome.labels, L10n.App.Nav.main, Modifier.align(Alignment.Center))
                    val pen = tabItems.first { it.isAction }
                    TopPen(pen.title, pen.icon, { select(Tab.Write) }, Modifier.align(Alignment.CenterEnd).padding(end = pad))
                }
            }
            // The undo banner floats above the tab bar (or the bottom edge on pushed screens) on every screen.
            deletionDate?.let { date ->
                Box(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = if (!topTabs && stack.size == 1) 96.dp else 12.dp)) {
                    AccountDeletionBanner(session, date)
                }
            }
            if (!topTabs) TabBarSlot(stack.size == 1, Modifier.align(Alignment.BottomCenter)) {
                OrganicTabBar(tabItems, selection = tab, onSelect = select)
            }
        }
    }
}

/**
 * A page under the header's tabs (design note B2): its bar leaves them room ([chrome]) and is the
 * root bars' 56 tall. The writer has the window to itself — no tabs over it, its bar as a phone's.
 */
@Composable
private fun WithHeader(route: Route, chrome: HeaderChrome?, page: @Composable () -> Unit) {
    val own = if (route is Route.Write) null else chrome
    CompositionLocalProvider(
        LocalHeaderChrome provides own,
        LocalInlineBarHeight provides if (own != null) TopBarRow else InlineBarHeight,
        content = page,
    )
}

/**
 * Where the header's tabs and pen are: in place over every page but the writer, which they fade
 * from (160 ms) as it opens and come back with once it has gone. Gone, they are left unplaced
 * (no touch, nothing read out).
 */
@Composable
private fun HeaderTabsSlot(shown: Boolean, content: @Composable () -> Unit) {
    val alpha by animateFloatAsState(if (shown) 1f else 0f, tween(HEADER_TABS_FADE_MILLIS, easing = LinearEasing), label = "headerTabs")
    Box(
        Modifier.fillMaxWidth().layout { measurable, constraints ->
            val placeable = measurable.measure(constraints)
            layout(placeable.width, placeable.height) {
                if (alpha > 0f) placeable.placeWithLayer(0, 0) { this.alpha = alpha }
            }
        },
    ) { content() }
}

private const val HEADER_TABS_FADE_MILLIS = 160

/** What Ctrl-1…4 choose, in the header's order. */
private val KeyTabs = listOf(Tab.Feed, Tab.Messages, Tab.Notifications, Tab.CardBox)

/** Keyboard shortcuts the activity hears before any screen: the screens say what they do. */
object KeyShortcuts {
    /** Ctrl-N / Cmd-N: open the writer (set while the signed-in tabs are shown). */
    var newCard: (() -> Unit)? = null
    /** Ctrl-1…4 / Cmd-1…4: choose that tab (1 the feed … 4 the card box), as a tap on it. */
    var tab: ((Int) -> Unit)? = null
}

/**
 * Where the tab bar is: shown on a tab's first page, hidden on the pages pushed over it. Back on the
 * first page it is there at once, as the page beneath a swipe let go of is — a quick fade and a short
 * rise, not a spring still settling after the page has gone — and it goes the way it always went,
 * sliding down as it fades. Hidden, it stays composed and is only left unplaced (it draws nothing,
 * takes no touch and isn't read out), so coming back doesn't spend the frame of the release on
 * building it.
 */
@Composable
private fun TabBarSlot(shown: Boolean, modifier: Modifier, bar: @Composable () -> Unit) {
    // How visible it is, and how far below its place (of its height).
    val alpha = remember { Animatable(if (shown) 1f else 0f) }
    val drop = remember { Animatable(if (shown) 0f else 1f) }
    LaunchedEffect(shown) {
        if (shown) {
            // From hidden it rises from a third of its height; caught half-way down, from where it is.
            if (alpha.value == 0f) drop.snapTo(TAB_BAR_RISE_FROM)
            launch { alpha.animateTo(1f, tween(TAB_BAR_FADE_MILLIS, easing = LinearEasing)) }
            drop.animateTo(0f, tween(TAB_BAR_RISE_MILLIS, easing = PageMotionSpec.EmphasizedDecelerate))
        } else {
            launch { alpha.animateTo(0f, spring(stiffness = Spring.StiffnessMediumLow)) }
            drop.animateTo(1f, spring(stiffness = Spring.StiffnessMediumLow))
        }
    }
    Box(
        modifier.layout { measurable, constraints ->
            val placeable = measurable.measure(constraints)
            layout(placeable.width, placeable.height) {
                if (shown || alpha.value > 0f) {
                    placeable.placeWithLayer(0, 0) {
                        this.alpha = alpha.value
                        translationY = drop.value * size.height
                    }
                }
            }
        },
    ) { bar() }
}

/** The tab bar coming back: its fade, and its rise from [TAB_BAR_RISE_FROM] of its height. */
private const val TAB_BAR_FADE_MILLIS = 90
private const val TAB_BAR_RISE_MILLIS = 150
private const val TAB_BAR_RISE_FROM = 1f / 3f

/** A page of a tab's stack: what it opens goes on the same stack, and back pops it. */
@Composable
private fun Page(session: Session, route: Route, stack: NavBackStack<Route>) {
    val push: (Route) -> Unit = { stack.add(it) }
    val pop: () -> Unit = { stack.popPage() }
    when (route) {
        is Route.Root -> when (route.tab) {
            Tab.Feed -> FeedScreen(session, push)
            // Beside the thread pane, a row puts its thread in the pane rather than stacking it.
            Tab.Messages -> {
                val twoPane = LocalTwoPane.current
                ConversationsScreen(session) { r -> if (twoPane && r is Route.Thread) stack.chooseInPane(r) else stack.add(r) }
            }
            Tab.Notifications -> NotificationsScreen(session, push)
            Tab.CardBox -> CardBoxScreen(session, push)
            Tab.Write -> {}
        }
        is Route.Card -> CardScreen(session, route.key, route.preview, push, popToRoot = { stack.popToRoot() }, back = pop)
        is Route.Author -> AuthorScreen(session, route.handle, push, pop)
        is Route.Write -> WriteScreen(
            session, route.referenceCardId, route.cardId, route.story,
            onCreated = { id -> stack.rememberDraft(route, id) },
            // Closed with the draft or revision saved: the screens showing cards read them again — not
            // when the visit wrote nothing.
            close = {
                session.takeWriterChange()?.let(session::noteCardChange)
                pop()
            },
        ) { key ->
            session.noteCardChange(session.takeWriterChange() ?: Session.CardChange())
            pop()
            // The card takes the writer's place, as the web goes to it — unless its own page is underneath.
            if (route.showsCard) stack.add(Route.Card(key))
        }
        is Route.Thread -> ThreadScreen(session, route.handle, route.uid, route.note, push, pop)
        Route.Settings -> SettingsScreen(push, pop)
        // The session keeps the map between visits (ThoughtMapStore.open): within a while, a visit
        // shows it as it was left, reading again only the cards the writer changed.
        Route.ThoughtMap -> ThoughtMapScreen(session, session.thoughtMap, push, pop)
        is Route.SettingsSection -> SettingsSectionScreen(session, route.section, pop)
    }
}
